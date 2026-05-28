import { OvernightConfig, NotifyPayload, EventType } from '../lib/types.js'
import { sendTelegram } from './telegram.js'
import { sendSlack } from './slack.js'
import { formatTime } from '../core/detector.js'

function shouldNotify(config: OvernightConfig, type: EventType): boolean {
  const n = config.notifications
  switch (type) {
    case 'rate_limit': return n.onRateLimit
    case 'resume': return n.onResume
    case 'crash': return n.onCrash
    case 'human_needed': return n.onHumanNeeded
    case 'complete': return n.onComplete
    default: return false
  }
}

function buildMessage(payload: NotifyPayload): string {
  const { type, message, snippet, sessionId, resetAt } = payload

  const icons: Record<string, string> = {
    rate_limit: '🌙',
    resume: '⚡',
    crash: '💥',
    human_needed: '⚠️',
    complete: '✅',
  }

  const icon = icons[type] ?? 'ℹ️'
  const lines = [`${icon} overnight: ${message}`]

  if (resetAt && type === 'rate_limit') {
    lines.push(`↻ Resuming at ${formatTime(resetAt)}`)
  }
  if (sessionId) {
    lines.push(`Session: ${sessionId.slice(0, 8)}…`)
  }
  if (snippet) {
    lines.push('', 'Last output:', '```', snippet, '```')
  }

  return lines.join('\n')
}

export async function notify(config: OvernightConfig, payload: NotifyPayload): Promise<void> {
  if (!shouldNotify(config, payload.type)) return

  const { telegram, slack } = config.notifications
  const text = buildMessage(payload)

  const sends: Promise<void>[] = []

  if (telegram) {
    sends.push(
      sendTelegram(telegram.botToken, telegram.chatId, text).catch(err =>
        console.error('overnight: telegram notify failed:', (err as Error).message),
      ),
    )
  }

  if (slack) {
    sends.push(
      sendSlack(slack.webhookUrl, text).catch(err =>
        console.error('overnight: slack notify failed:', (err as Error).message),
      ),
    )
  }

  await Promise.all(sends)
}
