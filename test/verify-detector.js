/**
 * Unit test for detector reset/session parsing against the actual TS source.
 *
 * Run: node test/verify-detector.js
 */
const fs = require('fs')
const path = require('path')
const ts = require('typescript')
const vm = require('vm')

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'detector.ts'), 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText

const mod = { exports: {} }
vm.runInNewContext(output, {
  module: mod,
  exports: mod.exports,
  require: () => ({}),
  console,
  Date,
}, { filename: 'detector.ts' })

const { extractResetTime, detectLine } = mod.exports

let passed = 0
let failed = 0

function assert(label, condition, detail = '') {
  if (condition) {
    console.log('\x1b[32m✅\x1b[0m', label)
    passed++
  } else {
    console.log('\x1b[31m❌\x1b[0m', label)
    if (detail) console.log('   ', detail)
    failed++
  }
}

function nextMinuteDate() {
  const target = new Date(Date.now() + 60_000)
  target.setSeconds(0, 0)
  return target
}

function format12h(date) {
  let hour = date.getHours()
  const minute = String(date.getMinutes()).padStart(2, '0')
  const meridiem = hour >= 12 ? 'PM' : 'AM'
  hour = hour % 12
  if (hour === 0) hour = 12
  return `${hour}:${minute} ${meridiem}`
}

function format24h(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const now = Date.now()
const retryInSeconds = extractResetTime('RESOURCE_EXHAUSTED. Please retry in 1.5s.')
assert('extractResetTime: parses retry-in seconds', retryInSeconds > now && retryInSeconds - now < 3000)

const target = nextMinuteDate()
const retryAt12h = extractResetTime(`You've hit your usage limit. Please try again at ${format12h(target)}.`)
assert(
  'extractResetTime: parses Codex 12-hour try-again-at time',
  retryAt12h >= target.getTime() && retryAt12h - Date.now() < 75_000,
  `got ${retryAt12h}, target ${target.getTime()}`,
)

const retryAt24h = extractResetTime(`You've hit your usage limit. Please try again at ${format24h(target)}.`)
assert(
  'extractResetTime: parses Codex 24-hour try-again-at time',
  retryAt24h >= target.getTime() && retryAt24h - Date.now() < 75_000,
  `got ${retryAt24h}, target ${target.getTime()}`,
)

const detections = detectLine('To continue this session, run codex exec resume helpful-gopher-42')
assert('detectLine: captures Codex resume session id', detections.some(d => d.type === 'session_id' && d.value === 'helpful-gopher-42'))

console.log()
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
