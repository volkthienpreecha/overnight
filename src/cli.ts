import { Command } from 'commander'
import chalk from 'chalk'

const program = new Command()

program
  .name('overnight')
  .description('Keep your coding agent running while you sleep')
  .version('0.1.0')
  .enablePositionalOptions()

// overnight run -- claude -p "task" [flags]
program
  .command('run')
  .description('Run an agent command with overnight supervision')
  .option('-v, --verbose', 'Show extra overnight status messages')
  .allowUnknownOption()
  .passThroughOptions()
  .action(async (opts, cmd) => {
    const { runCommand } = await import('./commands/run.js')
    const remaining = cmd.args
    await runCommand(remaining, { verbose: opts.verbose })
  })

// overnight setup [--telegram] [--slack] [--uninstall]
program
  .command('setup')
  .description('Configure notifications and install Claude Code hook')
  .option('--telegram', 'Set up Telegram notifications')
  .option('--slack', 'Set up Slack notifications')
  .option('--uninstall', 'Remove overnight config and hooks')
  .action(async (opts) => {
    const { setupCommand } = await import('./commands/setup.js')
    await setupCommand(opts)
  })

// overnight status
program
  .command('status')
  .description('Show overnight configuration and recent events')
  .action(async () => {
    const { statusCommand } = await import('./commands/status.js')
    statusCommand()
  })

// overnight log [--tail N] [--type TYPE] [--clear]
program
  .command('log')
  .description('Show event log')
  .option('-n, --tail <n>', 'Show last N events', '50')
  .option('--type <type>', 'Filter by event type (rate_limit, crash, resume, complete)')
  .option('--clear', 'Clear the event log')
  .action(async (opts) => {
    const { logCommand } = await import('./commands/log.js')
    logCommand({
      tail: parseInt(opts.tail),
      type: opts.type,
      clear: opts.clear,
    })
  })

// overnight checkpoint [list|show] [id]
program
  .command('checkpoint [action] [id]')
  .description('List or show saved checkpoints')
  .action(async (action = 'list', id?: string) => {
    const { checkpointCommand } = await import('./commands/checkpoint.js')
    checkpointCommand(action, id)
  })

// overnight uninstall
program
  .command('uninstall')
  .description('Remove overnight config and hooks')
  .action(async () => {
    const { setupCommand } = await import('./commands/setup.js')
    await setupCommand({ uninstall: true })
  })

// Show help if no command given
if (process.argv.length <= 2) {
  console.log(chalk.bold('\n🌙 overnight\n'))
  console.log('  Run your coding agent while you sleep — rate-limit recovery,')
  console.log('  checkpoint summaries, crash detection, Telegram/Slack alerts.')
  console.log()
  console.log(chalk.bold('  Quick start:'))
  console.log(chalk.cyan('    overnight setup --telegram'))
  console.log(chalk.cyan('    overnight run -- claude -p "your task here" --dangerously-skip-permissions'))
  console.log()
  program.help()
} else {
  program.parseAsync(process.argv).catch(err => {
    console.error(chalk.red('Error:'), (err as Error).message)
    process.exit(1)
  })
}
