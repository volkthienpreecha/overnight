/**
 * overnight demo — scripted simulation of the full rate-limit loop.
 *
 * No real agent or account needed. Shows the session ID capture,
 * rate-limit detection, countdown, and resume in about 15 seconds.
 * Works inside a standalone binary (no subprocess, no temp files).
 */
import chalk from 'chalk'
import { detectLine, formatTime, formatResetIn } from '../core/detector.js'
import { waitUntil } from '../core/countdown.js'

const delay = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms))

export async function demoCommand(): Promise<void> {
  console.log(chalk.bold('\n🌙 overnight demo\n'))
  console.log('  Watch overnight handle a rate limit from start to finish.')
  console.log('  No real agent or account needed. Takes about 15 seconds.\n')
  console.log(chalk.dim('─'.repeat(60)))

  // ── Attempt 1: agent runs, hits rate limit ────────────────────────────────

  console.log(chalk.dim('\n🌙 overnight: watching [demo agent]\n'))
  await delay(600)

  const attempt1Lines = [
    '{"type":"system","subtype":"init","session_id":"de001234-ab12-cd34-ef56-789012345678"}',
    '[agent] Reading codebase...',
    '[agent] Planning the implementation...',
    '[agent] Writing src/feature.ts...',
    '[agent] Writing tests...',
    '[agent] Running type check...',
    'Claude AI usage limit reached · resets in 12 seconds',
  ]

  let sessionId: string | null = null

  for (const line of attempt1Lines) {
    process.stdout.write(line + '\n')

    const detections = detectLine(line)
    for (const d of detections) {
      if (d.type === 'session_id' && !sessionId) {
        sessionId = d.value
        console.log(chalk.dim(`  overnight: session ${d.value.slice(0, 8)}…`))
      }
    }
    await delay(650)
  }

  // ── Rate limit handling ───────────────────────────────────────────────────

  const resetAt = Date.now() + 12_000   // 12s wait for demo
  const resumeCmd = `claude --resume ${sessionId} --output-format stream-json --verbose`

  console.log(chalk.yellow(`\n🌙 overnight: Rate limit hit. Resuming at ${formatTime(resetAt)} (12s)`))
  await delay(300)
  console.log(chalk.dim('  overnight: checkpoint saved'))
  console.log(chalk.dim(`  overnight: waiting until ${formatTime(resetAt)}…`))

  // Live countdown
  const ticker = setInterval(() => {
    const remaining = formatResetIn(resetAt)
    process.stdout.write(`\r  ⏳ ${remaining} remaining…`.padEnd(50))
  }, 1000)

  await waitUntil(resetAt + 1000)
  clearInterval(ticker)
  process.stdout.write('\r' + ' '.repeat(60) + '\r')

  // ── Attempt 2: resume ─────────────────────────────────────────────────────

  console.log(chalk.cyan(`\n⚡ overnight: Resuming Claude session ${sessionId!.slice(0, 8)}…`))
  console.log(chalk.dim(`  resume cmd: ${resumeCmd}`))
  console.log()
  await delay(500)

  const attempt2Lines = [
    '{"type":"system","subtype":"init","session_id":"de001234-ab12-cd34-ef56-789012345678"}',
    '[agent] Resuming from checkpoint...',
    '[agent] Finishing src/feature.ts...',
    '[agent] All 12 tests passing.',
    '[agent] Opening pull request...',
    '{"type":"result","subtype":"success"}',
  ]

  for (const line of attempt2Lines) {
    process.stdout.write(line + '\n')
    await delay(650)
  }

  // ── Done ──────────────────────────────────────────────────────────────────

  console.log(chalk.green('\n✅ overnight: Done after 0m'))
  console.log(chalk.dim('─'.repeat(60)))

  console.log(chalk.bold('\n  That\'s overnight. Try it on a real task:\n'))
  console.log(chalk.cyan('  overnight run -- claude -p "your task" --dangerously-skip-permissions'))
  console.log(chalk.cyan('  overnight run -- codex exec "your task" --dangerously-bypass-approvals-and-sandbox'))
  console.log(chalk.cyan('  overnight run -- gemini -p "your task"'))
  console.log()
  console.log(chalk.dim('  Set up Telegram to get pinged when it finishes: overnight setup --telegram'))
  console.log()
}
