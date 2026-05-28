/**
 * Simulates a Gemini CLI session that hits a rate limit then exits.
 *
 * Emits the exact strings from packages/core/src/utils/googleQuotaErrors.ts
 * so overnight's Gemini rate-limit patterns are exercised.
 *
 * Run:
 *   node dist/cli.js run -v -- node test/simulate-gemini-rate-limit.js
 *
 * Expected:
 *   - Rate limit detected from RESOURCE_EXHAUSTED / "Please retry in Xs" message
 *   - Session ID captured from {"type":"init","session_id":"UUID"} init event
 *   - Reset time parsed from "Please retry in 120s" (2 minutes)
 *   - overnight waits then builds: gemini --resume SESSION_ID --output-format stream-json
 */

const SESSION_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

// Gemini stream-json init event (--output-format stream-json)
process.stdout.write(JSON.stringify({
  type: 'init',
  session_id: SESSION_ID,
  model: 'gemini-2.5-pro',
}) + '\n')

process.stdout.write('[gemini] Starting task...\n')
process.stdout.write('[gemini] Reading codebase...\n')
process.stdout.write('[gemini] Generating code...\n')

setTimeout(() => {
  // Exact string from googleQuotaErrors.ts (retryable per-minute limit)
  // Also includes the retry delay overnight will parse
  process.stderr.write(
    'RESOURCE_EXHAUSTED: You exceeded your current quota, please check your plan and billing details. ' +
    'For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. ' +
    'Please retry in 120s.\n'
  )

  setTimeout(() => {
    process.exit(1)  // Gemini exits non-zero on rate limit
  }, 100)
}, 600)
