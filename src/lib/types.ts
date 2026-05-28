export interface TelegramConfig {
  botToken: string
  chatId: string
}

export interface SlackConfig {
  webhookUrl: string
}

export interface NotificationConfig {
  telegram?: TelegramConfig
  slack?: SlackConfig
  onRateLimit: boolean
  onResume: boolean
  onCrash: boolean
  onHumanNeeded: boolean
  onComplete: boolean
}

export interface OvernightConfig {
  notifications: NotificationConfig
  hangTimeoutMs: number       // ms of silence before hang alert (default: 10 min)
  checkpointThresholdPct: number  // context % at which to request checkpoint (default: 80)
  maxRestarts: number         // max crash restarts before giving up (default: 3)
  restartDelayMs: number      // base delay between restarts (default: 5000)
}

export const DEFAULT_CONFIG: OvernightConfig = {
  notifications: {
    onRateLimit: true,
    onResume: true,
    onCrash: true,
    onHumanNeeded: true,
    onComplete: true,
  },
  hangTimeoutMs: 10 * 60 * 1000,
  checkpointThresholdPct: 80,
  maxRestarts: 3,
  restartDelayMs: 5000,
}

export type DetectionType =
  | 'rate_limit'
  | 'session_id'
  | 'reset_time'
  | 'complete'
  | 'human_needed'
  | 'error'

export interface Detection {
  type: DetectionType
  value: string
  raw: string
}

export interface SessionState {
  sessionId: string | null
  command: string
  args: string[]
  startedAt: number
  restarts: number
  rateLimitResetAt: number | null
  lastOutputAt: number
  recentLines: string[]
  phase: 'running' | 'rate_limited' | 'waiting' | 'resuming' | 'complete' | 'failed'
}

export type EventType =
  | 'start'
  | 'output'
  | 'rate_limit'
  | 'checkpoint'
  | 'resume'
  | 'crash'
  | 'hang'
  | 'human_needed'
  | 'complete'
  | 'error'
  | 'stop'

export interface OvernightEvent {
  ts: string
  type: EventType
  message: string
  sessionId?: string
  meta?: Record<string, unknown>
}

export interface NotifyPayload {
  type: EventType
  message: string
  snippet?: string
  sessionId?: string
  resetAt?: number
}
