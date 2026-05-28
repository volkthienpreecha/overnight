import fs from 'fs'
import { EVENTS_PATH, ensureDirs } from './config.js'
import { OvernightEvent, EventType } from './types.js'

export function logEvent(
  type: EventType,
  message: string,
  meta?: Record<string, unknown>,
  sessionId?: string,
): void {
  ensureDirs()
  const event: OvernightEvent = {
    ts: new Date().toISOString(),
    type,
    message,
    ...(sessionId ? { sessionId } : {}),
    ...(meta ? { meta } : {}),
  }
  fs.appendFileSync(EVENTS_PATH, JSON.stringify(event) + '\n')
}

export function readEvents(limit = 50): OvernightEvent[] {
  if (!fs.existsSync(EVENTS_PATH)) return []
  const lines = fs.readFileSync(EVENTS_PATH, 'utf8')
    .split('\n')
    .filter(l => l.trim())
  return lines
    .slice(-limit)
    .map(l => {
      try { return JSON.parse(l) as OvernightEvent }
      catch { return null }
    })
    .filter((e): e is OvernightEvent => e !== null)
}

export function clearEvents(): void {
  ensureDirs()
  fs.writeFileSync(EVENTS_PATH, '')
}
