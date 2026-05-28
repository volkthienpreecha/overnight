// Simulates Claude Code running to successful completion
const sessionId = 'aaaa1111-bbbb-cccc-dddd-eeeeffffgggg'
console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: sessionId, model: 'claude-opus-4-5' }))
console.log('Reading your codebase...')
console.log('Building the feature...')
console.log('Running tests...')
console.log('All tests passed.')
console.log(JSON.stringify({ type: 'result', subtype: 'success', session_id: sessionId, cost_usd: 0.42 }))
