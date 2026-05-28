import { Detection, DetectionType } from '../lib/types.js'

// Patterns that indicate any supported agent hit its usage/rate limit
const RATE_LIMIT_PATTERNS = [
  // --- Claude ---
  /usage limit reached/i,
  /resets in \d/i,
  /exceeded.*limit/i,
  /limit.*exceeded/i,
  // Claude Code stream-json error result
  /"subtype":"error".*"limit/i,
  // Claude Code text: "Claude usage limit reached · resets in 5 hours"
  /claude.*limit/i,

  // --- Codex (OpenAI) ---
  // Exact strings from codex-rs/protocol/src/error.rs
  /you've hit your usage limit/i,
  /selected model is at capacity/i,
  /exceeded retry limit/i,
  /workspace is out of credits/i,
  /hit your spend cap/i,

  // --- Gemini (Google) ---
  // From packages/core/src/utils/googleQuotaErrors.ts
  /RESOURCE_EXHAUSTED/,
  /you have exhausted your daily quota/i,
  /RATE_LIMIT_EXCEEDED/,
  /QUOTA_EXHAUSTED/,
  /rate limit exceeded for host/i,
  /please retry in \d/i,
  /suggested retry after \d/i,
  /INSUFFICIENT_G1_CREDITS_BALANCE/i,

  // --- Generic (catches OpenAI/Google HTTP errors in any agent) ---
  /rate limit/i,
  /quota exceeded/i,
  /try again in/i,
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

// Session ID from Claude/Gemini stream-json: {"session_id":"UUID"}
const SESSION_ID_PATTERN = /"session_id"\s*:\s*"([0-9a-f-]{36})"/i
// camelCase variant used by some agents
const SESSION_ID_CAMEL_PATTERN = /"sessionId"\s*:\s*"([0-9a-f-]{36})"/i
// Codex JSON session event: {"type":"session","id":"thread-name-or-uuid","model":"..."}
// The id can be a kebab-case thread name (e.g. helpful-gopher-42) or a UUID.
const CODEX_SESSION_JSON_PATTERN = /"type"\s*:\s*"session"[^}]*"id"\s*:\s*"([a-z0-9][a-z0-9_-]{2,})"/i
// Codex end-of-session message: "To continue this session, run codex exec resume abc-def-123"
// Thread names are kebab-case words; UUIDs are hex with dashes.
const CODEX_SESSION_PATTERN = /codex(?:\s+exec)?\s+resume\s+([a-z0-9][a-z0-9_-]{4,})/i

// Reset time from Claude text: "resets in 5 hours" / "resets in 30 minutes"
const RESET_HOURS_PATTERN = /resets in (\d+(?:\.\d+)?)\s*hours?/i
const RESET_MINUTES_PATTERN = /resets in (\d+)\s*minutes?/i
const TRY_AGAIN_HOURS_PATTERN = /try again in (\d+(?:\.\d+)?)\s*hours?/i
const TRY_AGAIN_MINUTES_PATTERN = /try again in (\d+)\s*minutes?/i
// Gemini: "Please retry in 44.097s" / "Suggested retry after 60s"
const RETRY_IN_SECONDS_PATTERN = /(?:please\s+)?retry in (\d+(?:\.\d+)?)\s*s\b/i
const RETRY_AFTER_SECONDS_PATTERN = /retry after\s+(\d+(?:\.\d+)?)\s*s\b/i
// Codex: "try again at <time>" — too variable to parse reliably; fall back to default

export function detectLine(line: string): Detection[] {
  const detections: Detection[] = []

  // Session ID extraction — try all known formats
  const sessionMatch =
    SESSION_ID_PATTERN.exec(line) ??
    SESSION_ID_CAMEL_PATTERN.exec(line) ??
    CODEX_SESSION_JSON_PATTERN.exec(line) ??
    CODEX_SESSION_PATTERN.exec(line)
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
  // "resets in X hours" (Claude)
  let m = RESET_HOURS_PATTERN.exec(text)
  if (m) return Date.now() + parseFloat(m[1]) * 3600 * 1000

  m = RESET_MINUTES_PATTERN.exec(text)
  if (m) return Date.now() + parseInt(m[1]) * 60 * 1000

  m = TRY_AGAIN_HOURS_PATTERN.exec(text)
  if (m) return Date.now() + parseFloat(m[1]) * 3600 * 1000

  m = TRY_AGAIN_MINUTES_PATTERN.exec(text)
  if (m) return Date.now() + parseInt(m[1]) * 60 * 1000

  // "Please retry in 44.097s" / "Suggested retry after 60s" (Gemini)
  m = RETRY_IN_SECONDS_PATTERN.exec(text)
  if (m) return Date.now() + parseFloat(m[1]) * 1000

  m = RETRY_AFTER_SECONDS_PATTERN.exec(text)
  if (m) return Date.now() + parseFloat(m[1]) * 1000

  return null
}

export function extractSessionId(line: string): string | null {
  const m =
    SESSION_ID_PATTERN.exec(line) ??
    SESSION_ID_CAMEL_PATTERN.exec(line) ??
    CODEX_SESSION_JSON_PATTERN.exec(line) ??
    CODEX_SESSION_PATTERN.exec(line)
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
  const s = Math.floor((ms % 60000) / 1000)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
