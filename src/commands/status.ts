import chalk from 'chalk'
import fs from 'fs'
import { readConfig, OVERNIGHT_DIR, CHECKPOINTS_DIR } from '../lib/config.js'
import { readEvents } from '../lib/log.js'
import { readStatusData } from '../hooks/writer.js'
import { formatResetIn } from '../core/detector.js'

export function statusCommand(): void {
  console.log(chalk.bold('\n🌙 overnight status\n'))

  // Config
  const config = readConfig()
  const hasTelegram = !!config.notifications.telegram
  const hasSlack = !!config.notifications.slack

  console.log(chalk.bold('Notifications:'))
  console.log(`  Telegram: ${hasTelegram ? chalk.green('connected') : chalk.dim('not set up')}`)
  console.log(`  Slack:    ${hasSlack ? chalk.green('connected') : chalk.dim('not set up')}`)
  console.log()

  console.log(chalk.bold('Settings:'))
  console.log(`  Hang timeout:      ${config.hangTimeoutMs / 60000} min`)
  console.log(`  Max restarts:      ${config.maxRestarts}`)
  console.log()

  // statusLine hook data
  const hookData = readStatusData()
  if (hookData.ts) {
    const ageMs = Date.now() - hookData.ts
    console.log(chalk.bold('Last Claude Code session (from hook):'))
    console.log(`  Session ID:  ${hookData.sessionId?.slice(0, 8) ?? 'unknown'}…`)
    console.log(`  Context:     ${hookData.contextPct != null ? Math.round(hookData.contextPct) + '%' : 'unknown'}`)
    console.log(`  Last seen:   ${Math.round(ageMs / 60000)} min ago`)
    console.log()
  }

  // Recent events
  const events = readEvents(10)
  if (events.length > 0) {
    console.log(chalk.bold('Recent events:'))
    for (const e of events.reverse()) {
      const time = new Date(e.ts).toLocaleTimeString()
      const icon = eventIcon(e.type)
      const sid = e.sessionId ? chalk.dim(` [${e.sessionId.slice(0, 8)}]`) : ''
      console.log(`  ${chalk.dim(time)}  ${icon} ${e.message}${sid}`)
    }
    console.log()
  }

  // Checkpoint count
  if (fs.existsSync(CHECKPOINTS_DIR)) {
    const count = fs.readdirSync(CHECKPOINTS_DIR).filter(f => f.endsWith('.md')).length
    if (count > 0) {
      console.log(chalk.dim(`  ${count} checkpoint(s) in ~/.overnight/checkpoints/`))
    }
  }

  if (!hasTelegram && !hasSlack) {
    console.log(chalk.yellow('tip: run `overnight setup --telegram` to get notified when your agent needs attention'))
  }
  console.log()
}

function eventIcon(type: string): string {
  switch (type) {
    case 'start': return '▶'
    case 'rate_limit': return '🌙'
    case 'resume': return '⚡'
    case 'checkpoint': return '📌'
    case 'crash': return '💥'
    case 'hang': return '⏸'
    case 'human_needed': return '⚠️'
    case 'complete': return '✅'
    case 'error': return '❌'
    default: return '·'
  }
}
