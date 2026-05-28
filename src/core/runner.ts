/**
 * Core runner: spawns the agent command, watches its output, handles
 * rate-limit waits, crash restarts, hang alerts, and notifications.
 */
import { spawn, ChildProcess } from 'child_process'
import chalk from 'chalk'
import { OvernightConfig, SessionState } from '../lib/types.js'
import { detectLine, extractResetTime, defaultResetTime, formatTime, formatResetIn } from './detector.js'
import { waitUntil } from './countdown.js'
import { notify } from '../notify/index.js'
import { logEvent } from '../lib/log.js'
import { saveCheckpoint } from '../lib/config.js'

export interface RunOptions {
  command: string
  args: string[]
  config: OvernightConfig
  verbose?: boolean
}

const MAX_RECENT_LINES = 50
const CHECKPOINT_INJECT_MARKER = '__overnight_checkpoint_request__'

// ---------------------------------------------------------------------------
// Agent detection
// ---------------------------------------------------------------------------

function isClaude(command: string): boolean {
  return /\bclaude\b/i.test(command)
}

function isCodex(command: string): boolean {
  return /\bcodex\b/i.test(command)
}

function isGemini(command: string): boolean {
  return /\bgemini\b/i.test(command)
}

// ---------------------------------------------------------------------------
// Stream-JSON / structured-output injection
// Each agent has its own flag to emit machine-readable JSONL so overnight
// can capture the session ID and parse events reliably.
// ---------------------------------------------------------------------------

// Claude: --output-format stream-json
// When -p / --print is present, Claude also requires --verbose for stream-json to work.
function injectStreamJson(args: string[]): { args: string[]; injected: boolean } {
  const alreadySet = args.some(
    (a, i) =>
      a === '--output-format' ||
      a === '-f' ||
      (i > 0 && (args[i - 1] === '--output-format' || args[i - 1] === '-f') && a === 'stream-json'),
  )
  if (alreadySet) return { args, injected: false }

  const hasPrint = args.some(a => a === '-p' || a === '--print')
  const hasVerbose = args.some(a => a === '--verbose')
  const toInject = ['--output-format', 'stream-json']
  if (hasPrint && !hasVerbose) toInject.push('--verbose')

  return { args: [...toInject, ...args], injected: true }
}

// Gemini: --output-format stream-json  (same flag as Claude)
function injectStreamJsonForGemini(args: string[]): { args: string[]; injected: boolean } {
  return injectStreamJson(args)
}

// Codex: --json  (codex exec --json "prompt" emits JSONL; session ID appears
// in the exit message "run codex exec resume <id>" which detector.ts parses)
function injectJsonForCodex(args: string[]): { args: string[]; injected: boolean } {
  if (args.some(a => a === '--json')) return { args, injected: false }
  if (args[0] === 'exec') {
    return { args: ['exec', '--json', ...args.slice(1)], injected: true }
  }
  // Non-exec (interactive) mode — can't safely inject; user handles output format
  return { args, injected: false }
}

// ---------------------------------------------------------------------------
// Resume-args builders — each agent uses its own resume mechanism
// ---------------------------------------------------------------------------

// Claude: drops -p / --print and value, prepends --resume SESSION_ID
function buildResumeArgs(originalArgs: string[], sessionId: string): string[] {
  const stripped = originalArgs.filter((a, i, arr) => {
    if (a === '-p' || a === '--print') return false
    if (i > 0 && (arr[i - 1] === '-p' || arr[i - 1] === '--print')) return false
    return true
  })
  return ['--resume', sessionId, ...stripped]
}

// Codex: `codex exec resume SESSION_ID [flags]`
// Drops the positional prompt argument, keeps behavioural flags.
// Falls back to --last when session ID wasn't captured.
function buildCodexResumeArgs(originalArgs: string[], sessionId: string | null): string[] {
  const isExecMode = originalArgs[0] === 'exec'
  // Keep flags (--dangerously-bypass-approvals-and-sandbox, --approval-mode, etc.)
  // Drop the positional prompt and --json (we re-add it explicitly)
  const flags = (isExecMode ? originalArgs.slice(1) : originalArgs).filter(
    (a, i, arr) => {
      if (a === '--json') return false                                         // re-added below
      if (a.startsWith('-')) return true                                       // keep flags
      if (i > 0 && arr[i - 1].startsWith('-') && !arr[i - 1].startsWith('--approval-mode') === false) return true  // flag value
      return false                                                             // drop positional prompt
    },
  )
  const resumeTarget = sessionId ? [sessionId] : ['--last']
  return isExecMode
    ? ['exec', '--json', 'resume', ...resumeTarget, ...flags]
    : ['resume', ...resumeTarget]
}

// Gemini: drops -p / --prompt and value, prepends --resume SESSION_ID
// Falls back to "latest" when session ID wasn't captured.
function buildGeminiResumeArgs(originalArgs: string[], sessionId: string | null): string[] {
  const stripped = originalArgs.filter((a, i, arr) => {
    if (a === '-p' || a === '--prompt') return false
    if (i > 0 && (arr[i - 1] === '-p' || arr[i - 1] === '--prompt')) return false
    return true
  })
  const resumeTarget = sessionId ?? 'latest'
  return ['--resume', resumeTarget, ...stripped]
}

async function spawnAndWatch(
  command: string,
  args: string[],
  state: SessionState,
  config: OvernightConfig,
  verbose: boolean,
): Promise<'rate_limit' | 'complete' | 'crash' | 'hang'> {
  return new Promise(resolve => {
    const proc: ChildProcess = spawn(command, args, {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })

    state.lastOutputAt = Date.now()
    let rateLimitDetected = false
    let humanNeededAlerted = false
    let hangTimer: NodeJS.Timeout | null = null

    // Reset hang timer on any output
    const resetHangTimer = (): void => {
      if (hangTimer) clearTimeout(hangTimer)
      hangTimer = setTimeout(async () => {
        if (rateLimitDetected) return // don't double-alert
        const snippet = state.recentLines.slice(-5).join('\n')
        console.log(chalk.yellow('\n⚠️  overnight: No output for ' + Math.round(config.hangTimeoutMs / 60000) + ' min'))
        logEvent('hang', 'No output for hang timeout', { hangTimeoutMs: config.hangTimeoutMs }, state.sessionId ?? undefined)
        await notify(config, {
          type: 'human_needed',
          message: `No output for ${Math.round(config.hangTimeoutMs / 60000)} min — agent may be stuck`,
          snippet,
          sessionId: state.sessionId ?? undefined,
        })
        resolve('hang')
      }, config.hangTimeoutMs)
    }

    resetHangTimer()

    const processLine = async (line: string): Promise<void> => {
      state.lastOutputAt = Date.now()
      state.recentLines.push(line)
      if (state.recentLines.length > MAX_RECENT_LINES) state.recentLines.shift()

      const detections = detectLine(line)
      for (const d of detections) {
        switch (d.type) {
          case 'session_id':
            if (!state.sessionId) {
              state.sessionId = d.value
              logEvent('start', `Session ID: ${d.value}`, {}, d.value)
              if (verbose) console.log(chalk.dim(`  overnight: session ${d.value.slice(0, 8)}…`))
            }
            break

          case 'rate_limit':
            if (!rateLimitDetected) {
              rateLimitDetected = true
              if (hangTimer) clearTimeout(hangTimer)

              const resetAt = extractResetTime(line) ?? defaultResetTime()
              state.rateLimitResetAt = resetAt
              state.phase = 'rate_limited'

              const snippet = state.recentLines.slice(-5).join('\n')
              console.log(chalk.yellow(`\n🌙 overnight: Rate limit hit. Resuming at ${formatTime(resetAt)} (${formatResetIn(resetAt)})`))
              logEvent('rate_limit', `Rate limit hit, resuming at ${new Date(resetAt).toISOString()}`, { resetAt }, state.sessionId ?? undefined)

              await notify(config, {
                type: 'rate_limit',
                message: `Rate limit hit — resuming at ${formatTime(resetAt)}`,
                snippet,
                sessionId: state.sessionId ?? undefined,
                resetAt,
              })

              // Let the current process exit naturally; don't force-kill
            }
            break

          case 'reset_time': {
            const rt = parseInt(d.value, 10)
            if (!state.rateLimitResetAt || rt < state.rateLimitResetAt) {
              state.rateLimitResetAt = rt
            }
            break
          }

          case 'complete':
            if (hangTimer) clearTimeout(hangTimer)
            state.phase = 'complete'
            resolve('complete')
            break

          case 'human_needed':
            if (!humanNeededAlerted) {
              humanNeededAlerted = true
              const snippet = state.recentLines.slice(-10).join('\n')
              console.log(chalk.red('\n⚠️  overnight: Agent may need human input'))
              logEvent('human_needed', line, {}, state.sessionId ?? undefined)
              await notify(config, {
                type: 'human_needed',
                message: 'Agent appears to need human input',
                snippet,
                sessionId: state.sessionId ?? undefined,
              })
            }
            break
        }
      }
    }

    // Stream stdout: pass through to terminal AND process each line
    let stdoutBuf = ''
    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      process.stdout.write(text)
      stdoutBuf += text
      const lines = stdoutBuf.split('\n')
      stdoutBuf = lines.pop() ?? ''
      for (const line of lines) {
        void processLine(line)
        resetHangTimer()
      }
    })

    let stderrBuf = ''
    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      process.stderr.write(text)
      stderrBuf += text
      const lines = stderrBuf.split('\n')
      stderrBuf = lines.pop() ?? ''
      for (const line of lines) {
        void processLine(line)
        resetHangTimer()
      }
    })

    proc.on('close', (code) => {
      if (hangTimer) clearTimeout(hangTimer)

      // Flush remaining buffers synchronously before checking flags.
      // detectLine is synchronous so rateLimitDetected is set immediately.
      const flush = (buf: string): void => {
        if (!buf) return
        process.stdout.write(buf)
        state.recentLines.push(buf)
        if (state.recentLines.length > MAX_RECENT_LINES) state.recentLines.shift()
        const detections = detectLine(buf)
        for (const d of detections) {
          if (d.type === 'session_id' && !state.sessionId) state.sessionId = d.value
          if (d.type === 'rate_limit') rateLimitDetected = true
          if (d.type === 'reset_time') {
            const rt = parseInt(d.value, 10)
            if (!state.rateLimitResetAt || rt < state.rateLimitResetAt) state.rateLimitResetAt = rt
          }
          if (d.type === 'complete') state.phase = 'complete'
        }
      }
      flush(stdoutBuf)
      flush(stderrBuf)

      if (rateLimitDetected) {
        resolve('rate_limit')
      } else if (code === 0 || state.phase === 'complete') {
        resolve('complete')
      } else {
        resolve('crash')
      }
    })

    proc.on('error', (err) => {
      if (hangTimer) clearTimeout(hangTimer)
      console.error(chalk.red(`\n💥 overnight: Failed to start process: ${err.message}`))
      resolve('crash')
    })
  })
}

async function requestCheckpoint(state: SessionState, config: OvernightConfig): Promise<void> {
  // We can't inject into the PTY in pipe mode, so we save last 30 lines as the
  // checkpoint context. In a future version with PTY support, we'd inject a prompt.
  const snippet = state.recentLines.slice(-30).join('\n')
  if (state.sessionId) {
    const checkpointPath = saveCheckpoint(
      state.sessionId,
      `## Context at pause\n\nLast output before rate limit:\n\n\`\`\`\n${snippet}\n\`\`\`\n`,
    )
    logEvent('checkpoint', `Checkpoint saved to ${checkpointPath}`, {}, state.sessionId)
    if (config.notifications.onRateLimit) {
      console.log(chalk.dim(`  overnight: checkpoint saved`))
    }
  }
}

export async function runAgent(options: RunOptions): Promise<void> {
  const { command, args, config, verbose = false } = options

  // Inject structured-output flag so overnight can capture the session ID
  // and parse events. Each agent has its own flag.
  let baseArgs = [...args]
  if (isClaude(command)) {
    const { args: injected, injected: didInject } = injectStreamJson(baseArgs)
    baseArgs = injected
    if (didInject && verbose) {
      console.log(chalk.dim('  overnight: injected --output-format stream-json (needed for session ID capture)'))
    }
  } else if (isGemini(command)) {
    const { args: injected, injected: didInject } = injectStreamJsonForGemini(baseArgs)
    baseArgs = injected
    if (didInject && verbose) {
      console.log(chalk.dim('  overnight: injected --output-format stream-json for Gemini (needed for session ID capture)'))
    }
  } else if (isCodex(command)) {
    const { args: injected, injected: didInject } = injectJsonForCodex(baseArgs)
    baseArgs = injected
    if (didInject && verbose) {
      console.log(chalk.dim('  overnight: injected --json for Codex (needed for session ID capture)'))
    }
  }

  const state: SessionState = {
    sessionId: null,
    command,
    args: baseArgs,
    startedAt: Date.now(),
    restarts: 0,
    rateLimitResetAt: null,
    lastOutputAt: Date.now(),
    recentLines: [],
    phase: 'running',
  }

  logEvent('start', `overnight run: ${command} ${baseArgs.join(' ')}`)

  let currentArgs = [...baseArgs]
  let crashCount = 0        // only consecutive crashes; resets after a successful rate-limit resume
  let rateLimitCount = 0    // total rate-limit events this session

  while (true) {
    const isResume = state.restarts > 0 || state.phase === 'waiting'
    if (isResume) {
      console.log(chalk.cyan(`\n⚡ overnight: Starting (attempt #${state.restarts + 1})…`))
    }

    const reason = await spawnAndWatch(command, currentArgs, state, config, verbose)

    switch (reason) {
      case 'complete': {
        const duration = Math.round((Date.now() - state.startedAt) / 60000)
        console.log(chalk.green(`\n✅ overnight: Done after ${duration}m`))
        logEvent('complete', `Completed in ${duration}m`, {}, state.sessionId ?? undefined)
        await notify(config, {
          type: 'complete',
          message: `Done! Completed in ${duration} min.`,
          sessionId: state.sessionId ?? undefined,
        })
        return
      }

      case 'rate_limit': {
        rateLimitCount++
        crashCount = 0  // reset crash counter — rate limit is expected, not a bug
        await requestCheckpoint(state, config)

        const resetAt = state.rateLimitResetAt ?? defaultResetTime()
        state.rateLimitResetAt = null  // reset for next cycle
        state.phase = 'waiting'

        // Show countdown until reset
        console.log(chalk.dim(`  overnight: waiting until ${formatTime(resetAt)}…`))
        const ticker = setInterval(() => {
          const remaining = formatResetIn(resetAt)
          process.stdout.write(`\r  ⏳ ${remaining} remaining…`.padEnd(50))
        }, 30_000)

        await waitUntil(resetAt + 5000) // +5s buffer
        clearInterval(ticker)
        process.stdout.write('\r' + ' '.repeat(60) + '\r')

        state.phase = 'resuming'
        state.restarts++

        if (isClaude(command)) {
          if (state.sessionId) {
            currentArgs = buildResumeArgs(baseArgs, state.sessionId)
            console.log(chalk.cyan(`\n⚡ overnight: Resuming Claude session ${state.sessionId.slice(0, 8)}…`))
          } else {
            currentArgs = [...baseArgs]
            console.log(chalk.yellow('  overnight: ⚠ no session ID captured — restarting Claude from scratch (context may be lost)'))
          }
        } else if (isCodex(command)) {
          currentArgs = buildCodexResumeArgs(baseArgs, state.sessionId)
          const label = state.sessionId ? state.sessionId.slice(0, 8) + '…' : '--last'
          console.log(chalk.cyan(`\n⚡ overnight: Resuming Codex session (${label})`))
        } else if (isGemini(command)) {
          currentArgs = buildGeminiResumeArgs(baseArgs, state.sessionId)
          const label = state.sessionId ? state.sessionId.slice(0, 8) + '…' : 'latest'
          console.log(chalk.cyan(`\n⚡ overnight: Resuming Gemini session (${label})`))
        } else {
          currentArgs = [...baseArgs]
          console.log(chalk.cyan(`\n⚡ overnight: Restarting after rate limit…`))
        }

        if (verbose) {
          console.log(chalk.dim(`  resume cmd: ${command} ${currentArgs.join(' ')}`))
        }

        logEvent('resume', `Resuming after rate limit #${rateLimitCount} — session: ${state.sessionId ?? 'unknown'}`, { sessionId: state.sessionId, resumeCmd: `${command} ${currentArgs.join(' ')}` }, state.sessionId ?? undefined)
        await notify(config, {
          type: 'resume',
          message: `Rate limit reset — resuming now (limit #${rateLimitCount})`,
          sessionId: state.sessionId ?? undefined,
        })
        continue
      }

      case 'hang': {
        state.phase = 'failed'
        logEvent('error', 'Giving up: agent hung and may need human input')
        console.log(chalk.yellow('\novernight: Stopping. Check if the agent needs your attention.'))
        return
      }

      case 'crash': {
        crashCount++
        state.restarts++

        if (crashCount > config.maxRestarts) {
          console.log(chalk.red(`\n💥 overnight: Crashed ${config.maxRestarts} consecutive times — giving up`))
          logEvent('error', `Max consecutive crashes (${config.maxRestarts}) exceeded`)
          await notify(config, {
            type: 'crash',
            message: `Crashed ${config.maxRestarts} consecutive times — giving up`,
            snippet: state.recentLines.slice(-10).join('\n'),
            sessionId: state.sessionId ?? undefined,
          })
          state.phase = 'failed'
          return
        }

        const delay = config.restartDelayMs * crashCount
        console.log(chalk.red(`\n💥 overnight: Crashed — restarting in ${delay / 1000}s (crash ${crashCount}/${config.maxRestarts})`))
        logEvent('crash', `Process crashed, restart ${crashCount}/${config.maxRestarts}`, {}, state.sessionId ?? undefined)
        await notify(config, {
          type: 'crash',
          message: `Crashed — restarting in ${delay / 1000}s (attempt ${crashCount}/${config.maxRestarts})`,
          snippet: state.recentLines.slice(-5).join('\n'),
          sessionId: state.sessionId ?? undefined,
        })

        await new Promise(r => setTimeout(r, delay))

        if (isClaude(command) && state.sessionId) {
          currentArgs = buildResumeArgs(baseArgs, state.sessionId)
        } else if (isCodex(command) && state.sessionId) {
          currentArgs = buildCodexResumeArgs(baseArgs, state.sessionId)
        } else if (isGemini(command) && state.sessionId) {
          currentArgs = buildGeminiResumeArgs(baseArgs, state.sessionId)
        } else {
          currentArgs = [...baseArgs]
        }
        if (verbose) console.log(chalk.dim(`  resume cmd: ${command} ${currentArgs.join(' ')}`))
        continue
      }
    }
  }
}
