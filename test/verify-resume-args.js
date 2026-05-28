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
function buildResumeArgs(originalArgs, sessionId) {
  const stripped = originalArgs.filter((a, i, arr) => {
    if (a === '-p' || a === '--print') return false
    if (i > 0 && (arr[i - 1] === '-p' || arr[i - 1] === '--print')) return false
    return true
  })
  return ['--resume', sessionId, ...stripped]
}

function injectStreamJson(args) {
  const alreadySet = args.some(
    (a, i) =>
      a === '--output-format' ||
      a === '-f' ||
      (i > 0 && (args[i - 1] === '--output-format' || args[i - 1] === '-f') && a === 'stream-json'),
  )
  if (alreadySet) return { args, injected: false }
  return { args: ['--output-format', 'stream-json', ...args], injected: true }
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
  injectStreamJson(['-p', 'build a feature', '--dangerously-skip-permissions']),
  { args: ['--output-format', 'stream-json', '-p', 'build a feature', '--dangerously-skip-permissions'], injected: true }
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
  buildResumeArgs(['--output-format', 'stream-json', '-p', 'build a feature', '--dangerously-skip-permissions'], SESSION),
  ['--resume', SESSION, '--output-format', 'stream-json', '--dangerously-skip-permissions']
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

// --- Full overnight command reconstruction ---

// Simulate what overnight does when rate limit fires on:
//   overnight run -- claude -p "build a feature" --dangerously-skip-permissions
const userArgs = ['-p', 'build a feature', '--dangerously-skip-permissions']
const { args: withJson } = injectStreamJson(userArgs)
const resumeArgs = buildResumeArgs(withJson, SESSION)

assert(
  'Full round-trip: original args → inject json → rate limit → resume command',
  ['claude', ...resumeArgs].join(' '),
  `claude --resume ${SESSION} --output-format stream-json --dangerously-skip-permissions`
)

console.log()
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
