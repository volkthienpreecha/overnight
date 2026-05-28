import chalk from 'chalk'
import { readConfig } from '../lib/config.js'
import { runAgent } from '../core/runner.js'

export interface RunCommandOptions {
  verbose?: boolean
  hangTimeout?: number   // seconds, overrides config (useful for testing)
}

export async function runCommand(
  cmdAndArgs: string[],
  opts: RunCommandOptions,
): Promise<void> {
  if (cmdAndArgs.length === 0) {
    console.error(chalk.red('overnight run: no command specified'))
    console.error('Usage: overnight run -- claude -p "your task" [flags]')
    process.exit(1)
  }

  const [command, ...args] = cmdAndArgs
  const config = readConfig()

  if (opts.hangTimeout) {
    config.hangTimeoutMs = opts.hangTimeout * 1000
  }

  console.log(chalk.dim(`🌙 overnight: watching ${command} ${args.join(' ')}`))
  if (!config.notifications.telegram && !config.notifications.slack) {
    console.log(chalk.dim('  tip: run `overnight setup --telegram` to get notified when your agent needs attention'))
  }

  await runAgent({
    command,
    args,
    config,
    verbose: opts.verbose,
  })
}
