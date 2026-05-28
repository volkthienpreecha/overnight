/**
 * Proves session ID capture and correct resume command construction.
 *
 * This script simulates what Claude Code emits when run with
 * --output-format stream-json. overnight should:
 *   1. Extract the session ID from the init message
 *   2. Hit the rate limit
 *   3. Log the exact resume command it will run: claude --resume SESSION_ID ...
 *
 * Run: node dist/cli.js run -v -- node test/simulate-session-proof.js
 * Look for: "session 9a5b1f83..." and "resume cmd: claude --resume 9a5b..."
 */

const SESSION_ID = '9a5b1f83-dead-beef-cafe-c3d4e5f67890'

// 1. Claude Code stream-json init message — this is what overnight parses for the session ID
process.stdout.write(JSON.stringify({
  type: 'system',
  subtype: 'init',
  session_id: SESSION_ID,
  model: 'claude-opus-4-5',
  cwd: process.cwd(),
}) + '\n')

// 2. Some work output
setTimeout(() => process.stdout.write('Reading your codebase...\n'), 100)
setTimeout(() => process.stdout.write('Writing feature code...\n'), 200)
setTimeout(() => process.stdout.write('Running tests...\n'), 300)

// 3. Rate limit hit
setTimeout(() => {
  process.stdout.write('Claude usage limit reached · resets in 0 minutes\n')
  process.exit(1)
}, 500)
