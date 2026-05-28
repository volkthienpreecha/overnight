/**
 * Unit test: verifies buildResumeArgs constructs the correct --resume command.
 *
 * This is the key correctness question: given original args and a captured
 * session ID, does overnight build the right command to pass to Claude Code?
 *
 * Run: node test/verify-resume-args.js
 * Expected: all assertions pass (printed in green)
 */

// Replicate the logic from runner.ts so we can test it in isolation

// --- Claude ---
function buildResumeArgs(originalArgs, sessionId) {
  const stripped = originalArgs.filter((a, i, arr) => {
    if (a === '-p' || a === '--print') return false
    if (i > 0 && (arr[i - 1] === '-p' || arr[i - 1] === '--print')) return false
    return true
  })
  return ['--resume', sessionId, ...stripped]
}

function injectStreamJson(args, addVerboseForPrint = false) {
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
  if (addVerboseForPrint && hasPrint && !hasVerbose) toInject.push('--verbose')
  return { args: [...toInject, ...args], injected: true }
}

// --- Codex ---
function injectJsonForCodex(args) {
  if (args.some(a => a === '--json')) return { args, injected: false }
  if (args[0] === 'exec') {
    return { args: ['exec', '--json', ...args.slice(1)], injected: true }
  }
  return { args, injected: false }
}

function buildCodexResumeArgs(originalArgs, sessionId) {
  const isExecMode = originalArgs[0] === 'exec'
  const valueFlags = new Set([
    '-C',
    '-c',
    '-m',
    '--ask-for-approval',
    '--cd',
    '--config',
    '--cwd',
    '--model',
    '--profile',
    '--sandbox',
    '--search',
    '--approval-mode',
    '--approval-policy',
  ])
  const flags = []
  const source = isExecMode ? originalArgs.slice(1) : originalArgs
  let droppedPrompt = false
  for (let i = 0; i < source.length; i++) {
    const arg = source[i]
    if (arg === '--json') continue
    if (arg.startsWith('-')) {
      flags.push(arg)
      const flagName = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg
      if (valueFlags.has(flagName) && !arg.includes('=') && source[i + 1] && !source[i + 1].startsWith('-')) {
        flags.push(source[i + 1])
        i++
      }
      continue
    }
    if (!droppedPrompt) droppedPrompt = true
  }
  const resumeTarget = sessionId ? [sessionId] : ['--last']
  return isExecMode
    ? ['exec', '--json', 'resume', ...resumeTarget, ...flags]
    : ['resume', ...resumeTarget]
}

// --- Gemini ---
function buildGeminiResumeArgs(originalArgs, sessionId) {
  const stripped = originalArgs.filter((a, i, arr) => {
    if (a === '-p' || a === '--prompt') return false
    if (i > 0 && (arr[i - 1] === '-p' || arr[i - 1] === '--prompt')) return false
    return true
  })
  const resumeTarget = sessionId ?? 'latest'
  return ['--resume', resumeTarget, ...stripped]
}

let passed = 0
let failed = 0

function assert(label, got, expected) {
  const match = JSON.stringify(got) === JSON.stringify(expected)
  if (match) {
    console.log('\x1b[32m✅\x1b[0m', label)
    passed++
  } else {
    console.log('\x1b[31m❌\x1b[0m', label)
    console.log('   expected:', JSON.stringify(expected))
    console.log('   got:     ', JSON.stringify(got))
    failed++
  }
}

const SESSION = '9a5b1f83-dead-beef-cafe-c3d4e5f67890'

// --- injectStreamJson ---

assert(
  'injectStreamJson: injects when missing',
  injectStreamJson(['-p', 'build a feature', '--dangerously-skip-permissions'], true),
  { args: ['--output-format', 'stream-json', '--verbose', '-p', 'build a feature', '--dangerously-skip-permissions'], injected: true }
)

assert(
  'injectStreamJson: skips if already present',
  injectStreamJson(['--output-format', 'stream-json', '-p', 'build a feature']),
  { args: ['--output-format', 'stream-json', '-p', 'build a feature'], injected: false }
)

assert(
  'injectStreamJson: skips if -f stream-json present',
  injectStreamJson(['-f', 'stream-json', '-p', 'build a feature']),
  { args: ['-f', 'stream-json', '-p', 'build a feature'], injected: false }
)

// --- buildResumeArgs ---

assert(
  'buildResumeArgs: drops -p and its value, adds --resume',
  buildResumeArgs(['--output-format', 'stream-json', '--verbose', '-p', 'build a feature', '--dangerously-skip-permissions'], SESSION),
  ['--resume', SESSION, '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions']
)

assert(
  'buildResumeArgs: drops --print and its value',
  buildResumeArgs(['--print', 'build a feature', '--dangerously-skip-permissions'], SESSION),
  ['--resume', SESSION, '--dangerously-skip-permissions']
)

assert(
  'buildResumeArgs: preserves all other flags',
  buildResumeArgs(['--output-format', 'stream-json', '--allowedTools', 'bash,read,write', '--dangerously-skip-permissions'], SESSION),
  ['--resume', SESSION, '--output-format', 'stream-json', '--allowedTools', 'bash,read,write', '--dangerously-skip-permissions']
)

assert(
  'buildResumeArgs: places --resume before everything',
  buildResumeArgs(['--output-format', 'stream-json'], SESSION),
  ['--resume', SESSION, '--output-format', 'stream-json']
)

// --- injectJsonForCodex ---

assert(
  'injectJsonForCodex: injects --json after exec',
  injectJsonForCodex(['exec', 'build a feature', '--dangerously-bypass-approvals-and-sandbox']),
  { args: ['exec', '--json', 'build a feature', '--dangerously-bypass-approvals-and-sandbox'], injected: true }
)

assert(
  'injectJsonForCodex: skips if --json already present',
  injectJsonForCodex(['exec', '--json', 'build a feature']),
  { args: ['exec', '--json', 'build a feature'], injected: false }
)

assert(
  'injectJsonForCodex: skips for non-exec (interactive) mode',
  injectJsonForCodex(['build a feature']),
  { args: ['build a feature'], injected: false }
)

// --- buildCodexResumeArgs ---

assert(
  'buildCodexResumeArgs: exec mode with session ID — drops prompt, keeps flags',
  buildCodexResumeArgs(['exec', '--json', 'build a feature', '--dangerously-bypass-approvals-and-sandbox'], 'helpful-gopher-42'),
  ['exec', '--json', 'resume', 'helpful-gopher-42', '--dangerously-bypass-approvals-and-sandbox']
)

assert(
  'buildCodexResumeArgs: exec mode without session ID — uses --last',
  buildCodexResumeArgs(['exec', '--json', 'build a feature', '--dangerously-bypass-approvals-and-sandbox'], null),
  ['exec', '--json', 'resume', '--last', '--dangerously-bypass-approvals-and-sandbox']
)

assert(
  'buildCodexResumeArgs: non-exec mode with session ID',
  buildCodexResumeArgs(['build a feature'], 'helpful-gopher-42'),
  ['resume', 'helpful-gopher-42']
)

assert(
  'buildCodexResumeArgs: keeps flags with values',
  buildCodexResumeArgs(['exec', '--json', 'build a feature', '--model', 'gpt-5.1', '--approval-mode', 'never', '--cd', 'C:\\repo', '--dangerously-bypass-approvals-and-sandbox'], 'helpful-gopher-42'),
  ['exec', '--json', 'resume', 'helpful-gopher-42', '--model', 'gpt-5.1', '--approval-mode', 'never', '--cd', 'C:\\repo', '--dangerously-bypass-approvals-and-sandbox']
)

// --- buildGeminiResumeArgs ---

assert(
  'buildGeminiResumeArgs: drops -p and value, prepends --resume SESSION_ID',
  buildGeminiResumeArgs(['--output-format', 'stream-json', '-p', 'build a feature', '--sandbox'], SESSION),
  ['--resume', SESSION, '--output-format', 'stream-json', '--sandbox']
)

assert(
  'buildGeminiResumeArgs: drops --prompt and value',
  buildGeminiResumeArgs(['--prompt', 'build a feature', '--output-format', 'stream-json'], SESSION),
  ['--resume', SESSION, '--output-format', 'stream-json']
)

assert(
  'buildGeminiResumeArgs: uses "latest" when no session ID',
  buildGeminiResumeArgs(['--output-format', 'stream-json', '-p', 'build a feature'], null),
  ['--resume', 'latest', '--output-format', 'stream-json']
)

// --- Full round-trip: Claude ---

// Simulate what overnight does when rate limit fires on:
//   overnight run -- claude -p "build a feature" --dangerously-skip-permissions
const userArgs = ['-p', 'build a feature', '--dangerously-skip-permissions']
const { args: withJson } = injectStreamJson(userArgs, true)
const resumeArgs = buildResumeArgs(withJson, SESSION)

assert(
  'Claude round-trip: original args → inject json → rate limit → resume command',
  ['claude', ...resumeArgs].join(' '),
  `claude --resume ${SESSION} --output-format stream-json --verbose --dangerously-skip-permissions`
)

// --- Full round-trip: Codex ---

//   overnight run -- codex exec "build a feature" --dangerously-bypass-approvals-and-sandbox
const codexUserArgs = ['exec', 'build a feature', '--dangerously-bypass-approvals-and-sandbox']
const { args: codexWithJson } = injectJsonForCodex(codexUserArgs)
const codexResumeArgs = buildCodexResumeArgs(codexWithJson, 'helpful-gopher-42')

assert(
  'Codex round-trip: original args → inject json → rate limit → resume command',
  ['codex', ...codexResumeArgs].join(' '),
  'codex exec --json resume helpful-gopher-42 --dangerously-bypass-approvals-and-sandbox'
)

// --- Full round-trip: Gemini ---

//   overnight run -- gemini -p "build a feature" --sandbox
const geminiUserArgs = ['-p', 'build a feature', '--sandbox']
const { args: geminiWithJson } = injectStreamJson(geminiUserArgs)  // same flag as Claude
const geminiResumeArgs = buildGeminiResumeArgs(geminiWithJson, SESSION)

assert(
  'Gemini round-trip: original args → inject json → rate limit → resume command',
  ['gemini', ...geminiResumeArgs].join(' '),
  `gemini --resume ${SESSION} --output-format stream-json --sandbox`
)

console.log()
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
