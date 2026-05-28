import { Detection, DetectionType } from '../lib/types.js'

// Patterns that indicate Claude Code hit its usage/rate limit
const RATE_LIMIT_PATTERNS = [
  /usage limit reached/i,
  /rate limit/i,
  /resets in \d/i,
  /try again in/i,
  /exceeded.*limit/i,
  /limit.*exceeded/i,
  /quota exceeded/i,
  // Claude Code stream-json format: error result
  /"subtype":"error".*"limit/i,
  // Claude Code text: "Claude usage limit reached · resets in 5 hours"
  /claude.*limit/i,
]

// Patterns that indicate the agent completed its task successfully
const COMPLETE_PATTERNS = [
  /^overnight:complete$/i,          // explicit signal we inject
  /"stop_reason":"end_turn"/,        // stream-json end_turn (normal completion)
  /"subtype":"success"/,             // stream-json success result
]

// Patterns that indicate the agent needs human input
const HUMAN_NEEDED_PATTERNS = [
  /password[:\s]/i,
  /enter.*password/i,
  /authentication.*required/i,
  /2fa|two.factor/i,
  /please.*log.*in/i,
  /\[y\/n\]/i,
  /\(yes\/no\)/i,
  /merge conflict/i,
  /<<<<<<< HEAD/,          // git conflict marker
  /permission denied/i,
  /access denied/i,
  /are you sure/i,
]

// Session ID from Claude Code stream-json: {"type":"system","subtype":"init","session_id":"UUID",...}
const SESSION_ID_PATTERN = /"session_id"\s*:\s*"([0-9a-f-]{36})"/i

// Reset time from Claude Code text output: "resets in 5 hours" / "resets in 30 minutes"
const RESET_HOURS_PATTERN = /resets in (\d+(?:\.\d+)?)\s*hours?/i
const RESET_MINUTES_PATTERN = /resets in (\d+)\s*minutes?/i
const TRY_AGAIN_HOURS_PATTERN = /try again in (\d+(?:\.\d+)?)\s*hours?/i
const TRY_AGAIN_MINUTES_PATTERN = /try again in (\d+)\s*minutes?/i

export function detectLine(line: string): Detection[] {
  const detections: Detection[] = []

  // Session ID extraction
  const sessionMatch = SESSION_ID_PATTERN.exec(line)
  if (sessionMatch) {
    detections.push({ type: 'session_id', value: sessionMatch[1], raw: line })
  }

  // Rate limit
  if (RATE_LIMIT_PATTERNS.some(p => p.test(line))) {
    detections.push({ type: 'rate_limit', value: 'rate_limit_detected', raw: line })

    // Try to extract reset time from the same line
    const resetTime = extractResetTime(line)
    if (resetTime) {
      detections.push({ type: 'reset_time', value: String(resetTime), raw: line })
    }
  }

  // Completion
  if (COMPLETE_PATTERNS.some(p => p.test(line))) {
    detections.push({ type: 'complete', value: 'completed', raw: line })
  }

  // Human needed
  if (HUMAN_NEEDED_PATTERNS.some(p => p.test(line))) {
    detections.push({ type: 'human_needed', value: 'human_input_required', raw: line })
  }

  return detections
}

export function extractResetTime(text: string): number | null {
  // "resets in X hours"
  let m = RESET_HOURS_PATTERN.exec(text)
  if (m) return Date.now() + parseFloat(m[1]) * 3600 * 1000

  m = RESET_MINUTES_PATTERN.exec(text)
  if (m) return Date.now() + parseInt(m[1]) * 60 * 1000

  m = TRY_AGAIN_HOURS_PATTERN.exec(text)
  if (m) return Date.now() + parseFloat(m[1]) * 3600 * 1000

  m = TRY_AGAIN_MINUTES_PATTERN.exec(text)
  if (m) return Date.now() + parseInt(m[1]) * 60 * 1000

  return null
}

export function extractSessionId(line: string): string | null {
  const m = SESSION_ID_PATTERN.exec(line)
  return m ? m[1] : null
}

export function isHangPattern(line: string): boolean {
  return HUMAN_NEEDED_PATTERNS.some(p => p.test(line))
}

// Infer default reset time when the exact time is unknown
// Claude Max resets every 5 hours, Pro every 8 hours — use 5h as safe default
export function defaultResetTime(): number {
  return Date.now() + 5 * 3600 * 1000
}

export function formatResetIn(resetAt: number): string {
  const ms = resetAt - Date.now()
  if (ms <= 0) return 'now'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
