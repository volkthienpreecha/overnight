import chalk from 'chalk'
import { readEvents, clearEvents } from '../lib/log.js'
import { OvernightEvent } from '../lib/types.js'

export interface LogOptions {
  tail?: number
  type?: string
  clear?: boolean
}

function colorEvent(e: OvernightEvent): string {
  const time = new Date(e.ts).toLocaleString()
  const sid = e.sessionId ? chalk.dim(` [${e.sessionId.slice(0, 8)}]`) : ''
  const msg = e.message

  switch (e.type) {
    case 'rate_limit':   return chalk.yellow(`${time}  🌙 ${msg}${sid}`)
    case 'resume':       return chalk.cyan(`${time}  ⚡ ${msg}${sid}`)
    case 'crash':        return chalk.red(`${time}  💥 ${msg}${sid}`)
    case 'human_needed': return chalk.red(`${time}  ⚠️  ${msg}${sid}`)
    case 'complete':     return chalk.green(`${time}  ✅ ${msg}${sid}`)
    case 'start':        return chalk.blue(`${time}  ▶  ${msg}${sid}`)
    case 'checkpoint':   return chalk.magenta(`${time}  📌 ${msg}${sid}`)
    default:             return chalk.dim(`${time}  ·  ${msg}${sid}`)
  }
}

export function logCommand(opts: LogOptions): void {
  if (opts.clear) {
    clearEvents()
    console.log(chalk.dim('overnight: event log cleared'))
    return
  }

  const limit = opts.tail ?? 50
  let events = readEvents(limit)

  if (opts.type) {
    events = events.filter(e => e.type === opts.type)
  }

  if (events.length === 0) {
    console.log(chalk.dim('No events yet. Run `overnight run -- claude -p "task"` to start.'))
    return
  }

  console.log(chalk.bold(`\n🌙 overnight log (last ${events.length} events)\n`))
  for (const e of events) {
    console.log(colorEvent(e))
  }
  console.log()
}
