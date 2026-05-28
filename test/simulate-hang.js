/**
 * Proves hang detection fires after silence.
 *
 * Outputs a few lines then goes completely silent.
 * overnight should fire the hang alert after --hang-timeout seconds.
 *
 * Run with a short timeout:
 *   node dist/cli.js run --hang-timeout 5 -- node test/simulate-hang.js
 *
 * Expected: after 5 seconds of silence, overnight prints the hang warning
 * and exits (or notifies if Telegram is configured).
 *
 * Without the flag it uses the default 10-minute timeout, so use --hang-timeout 5
 * for testing.
 */

process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'hang-test-0000-0000-0000-000000000000' }) + '\n')
process.stdout.write('Starting long-running task...\n')
process.stdout.write('Analyzing codebase...\n')
process.stdout.write('[overnight hang test] Going silent now. Waiting for hang detection...\n')

// Stay alive but silent — overnight should detect the hang
// The process never exits on its own; overnight kills it via the hang handler
setTimeout(() => {}, 300_000) // 5 min keepalive — overnight will interrupt before this
