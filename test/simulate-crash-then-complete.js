/**
 * Proves crash recovery: crashes once, succeeds on the second attempt.
 *
 * Uses a shared counter file so each process invocation knows which attempt it is.
 *
 * Run: node dist/cli.js run -- node test/simulate-crash-then-complete.js
 *
 * Expected:
 *   Attempt 1: exits with code 1 → overnight logs crash, waits, restarts
 *   Attempt 2: exits cleanly → overnight logs "Done"
 */

const fs = require('fs')
const os = require('os')
const path = require('path')

const COUNTER_FILE = path.join(os.tmpdir(), 'overnight-crash-test-counter.txt')

let attempt = 1
try {
  attempt = parseInt(fs.readFileSync(COUNTER_FILE, 'utf8') || '1', 10)
} catch { /* first run */ }

// Increment for next run
fs.writeFileSync(COUNTER_FILE, String(attempt + 1))

process.stdout.write(JSON.stringify({
  type: 'system',
  subtype: 'init',
  session_id: `crash-test-00${attempt}0-0000-0000-000000000000`,
}) + '\n')

process.stdout.write(`[attempt ${attempt}] Starting...\n`)

setTimeout(() => {
  if (attempt === 1) {
    process.stderr.write(`[attempt ${attempt}] Something went wrong — crashing\n`)
    // Clean up counter so a re-run of the test starts fresh
    // (but don't clean on attempt 1 — leave it so attempt 2 sees "2")
    process.exit(1)
  } else {
    process.stdout.write(`[attempt ${attempt}] All good this time!\n`)
    fs.unlinkSync(COUNTER_FILE) // reset counter for next test run
    process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success' }) + '\n')
    process.exit(0)
  }
}, 400)
