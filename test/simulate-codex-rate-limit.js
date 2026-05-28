/**
 * Simulates a Codex CLI session that hits a rate limit then exits.
 *
 * Emits the exact strings from codex-rs/protocol/src/error.rs so overnight's
 * Codex rate-limit patterns are exercised.
 *
 * At the end it prints the Codex exit message so detector.ts can capture the
 * session ID from: "run codex exec resume <id>"
 *
 * Run:
 *   node dist/cli.js run -v -- node test/simulate-codex-rate-limit.js
 *
 * Expected:
 *   - Rate limit detected from "You've hit your usage limit" message
 *   - Session ID captured from "run codex exec resume helpful-gopher-42" line
 *   - overnight waits then builds: codex exec --json resume helpful-gopher-42
 */

const SESSION_NAME = 'helpful-gopher-42'

// Mimic codex exec --json init event
process.stdout.write(JSON.stringify({
  type: 'session',
  id: SESSION_NAME,
  model: 'codex-1',
}) + '\n')

process.stdout.write('[codex] Starting task...\n')
process.stdout.write('[codex] Reading files...\n')
process.stdout.write('[codex] Writing implementation...\n')

setTimeout(() => {
  // Exact string from codex-rs/protocol/src/error.rs (Plus plan variant)
  process.stderr.write(
    "You've hit your usage limit. Upgrade to Pro to continue using Codex or try again at 11:00 PM.\n"
  )

  setTimeout(() => {
    // Codex always prints this at the end of a session so you can resume
    process.stdout.write(`\nTo continue this session, run codex exec resume ${SESSION_NAME}\n`)
    process.exit(0)
  }, 100)
}, 600)
