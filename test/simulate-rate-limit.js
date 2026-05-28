// Simulates Claude Code output including session ID and rate limit
const sessionId = '9a5b1f83-4c2d-4e8f-a1b2-c3d4e5f67890'
console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: sessionId, model: 'claude-opus-4-5' }))
console.log('Working on your task...')
console.log('Reading files...')
console.log('Writing code...')

setTimeout(() => {
  console.log('Claude usage limit reached · resets in 0 minutes')
  process.exit(1)
}, 800)
