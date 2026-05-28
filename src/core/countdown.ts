import chalk from 'chalk'
import { formatResetIn, formatTime } from './detector.js'

export type CountdownDoneReason = 'reset' | 'interrupted'

export function runCountdown(
  resetAt: number,
  onTick?: (remaining: string) => void,
): Promise<CountdownDoneReason> {
  return new Promise(resolve => {
    let stopped = false

    const tick = (): void => {
      if (stopped) return

      const now = Date.now()
      if (now >= resetAt) {
        process.stdout.write('\r' + ' '.repeat(60) + '\r')
        resolve('reset')
        return
      }

      const remaining = formatResetIn(resetAt)
      const resetTime = formatTime(resetAt)
      const line = chalk.dim(`  ⏳ overnight: resuming at ${resetTime} (in ${remaining})`)

      // Overwrite current line
      process.stdout.write('\r' + line.padEnd(70))

      if (onTick) onTick(remaining)

      setTimeout(tick, 30_000) // update every 30s
    }

    tick()

    // Allow early cancellation via SIGINT
    const cleanup = (): void => {
      stopped = true
      process.stdout.write('\r' + ' '.repeat(70) + '\r')
      resolve('interrupted')
    }
    process.once('SIGINT', cleanup)
    // Clean up listener when done
    const originalResolve = resolve
    ;(resolve as unknown as (r: CountdownDoneReason) => void) = (reason) => {
      process.removeListener('SIGINT', cleanup)
      originalResolve(reason)
    }
  })
}

export function waitUntil(resetAt: number): Promise<void> {
  const delay = Math.max(0, resetAt - Date.now())
  return new Promise(resolve => setTimeout(resolve, delay))
}
