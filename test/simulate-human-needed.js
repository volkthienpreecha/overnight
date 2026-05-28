/**
 * Proves human-needed escalation fires on patterns that need human input.
 *
 * Tests the most common blocked-agent patterns:
 *   - password prompt
 *   - y/n confirmation
 *   - git merge conflict
 *   - permission denied
 *
 * Run: node dist/cli.js run -- node test/simulate-human-needed.js [pattern]
 *
 * Patterns: password | yn | conflict | permission (default: password)
 *
 * Expected: overnight prints "⚠️  overnight: Agent may need human input"
 * and (if Telegram configured) sends a notification with the last 10 lines.
 */

const pattern = process.argv[2] || 'password'

process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'human-test-aaaa-bbbb-cccc-ddddeeeeffff' }) + '\n')
process.stdout.write('Starting task...\n')
process.stdout.write('Working...\n')

setTimeout(() => {
  switch (pattern) {
    case 'password':
      process.stdout.write('Enter password: \n')
      break
    case 'yn':
      process.stdout.write('This will delete 47 files. Continue? [y/n] \n')
      break
    case 'conflict':
      process.stdout.write('<<<<<<< HEAD\n')
      process.stdout.write('function doThing() { return 1 }\n')
      process.stdout.write('=======\n')
      process.stdout.write('function doThing() { return 2 }\n')
      process.stdout.write('>>>>>>> feature-branch\n')
      break
    case 'permission':
      process.stdout.write('Permission denied: /etc/hosts\n')
      break
    default:
      process.stdout.write('Enter password: \n')
  }

  // Keep alive — in real life the agent is stuck waiting for input
  setTimeout(() => {}, 300_000)
}, 300)
