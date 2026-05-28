import * as p from '@clack/prompts'
import chalk from 'chalk'
import { readConfig, writeConfig } from '../lib/config.js'
import { installStatusLineHook } from '../hooks/writer.js'
import { validateTelegramToken, pollTelegramForChatId, sendTelegram } from '../notify/telegram.js'
import { validateSlackWebhook } from '../notify/slack.js'
import { OvernightConfig } from '../lib/types.js'

export interface SetupOptions {
  telegram?: boolean
  slack?: boolean
  uninstall?: boolean
}

export async function setupCommand(opts: SetupOptions): Promise<void> {
  if (opts.uninstall) {
    await uninstallCommand()
    return
  }

  p.intro(chalk.bold('🌙 overnight setup'))

  const config = readConfig()

  if (opts.telegram || (!opts.slack && !opts.telegram)) {
    await setupTelegram(config)
  }

  if (opts.slack || (!opts.telegram && !opts.slack)) {
    // Only ask about Slack if we haven't already set up Telegram (or explicitly requested)
    if (opts.slack) {
      await setupSlack(config)
    } else if (!config.notifications.telegram) {
      const wantSlack = await p.confirm({ message: 'Also set up Slack notifications?' })
      if (p.isCancel(wantSlack)) { p.cancel('Setup cancelled'); process.exit(0) }
      if (wantSlack) await setupSlack(config)
    }
  }

  // Configure hang timeout
  const hangInput = await p.text({
    message: 'Alert me if no output for (minutes)',
    placeholder: String(config.hangTimeoutMs / 60000),
    validate: (v) => {
      const n = parseInt(v)
      if (isNaN(n) || n < 1) return 'Must be at least 1 minute'
    },
    defaultValue: String(config.hangTimeoutMs / 60000),
  })
  if (p.isCancel(hangInput)) { p.cancel('Setup cancelled'); process.exit(0) }
  config.hangTimeoutMs = parseInt(hangInput as string) * 60000

  // Install Claude Code statusLine hook
  const installHook = await p.confirm({
    message: 'Install statusLine hook into Claude Code? (improves rate-limit timing accuracy)',
    initialValue: true,
  })
  if (!p.isCancel(installHook) && installHook) {
    try {
      const result = installStatusLineHook()
      if (result.alreadyPresent) {
        p.note('Hook already installed', 'Claude Code integration')
      } else {
        p.note('Hook installed into ~/.claude/settings.json', 'Claude Code integration')
      }
    } catch (err) {
      p.note(`Could not install hook: ${(err as Error).message}`, 'Warning')
    }
  }

  writeConfig(config)
  p.outro(chalk.green('overnight is configured! Run: overnight run -- claude -p "your task"'))
}

async function setupTelegram(config: OvernightConfig): Promise<void> {
  const wantTelegram = config.notifications.telegram
    ? await p.confirm({ message: `Update existing Telegram config (bot: @…)?`, initialValue: false })
    : await p.confirm({ message: 'Set up Telegram notifications?' })

  if (p.isCancel(wantTelegram) || !wantTelegram) return

  p.note(
    '1. Open Telegram and message @BotFather\n2. Send /newbot and follow the steps\n3. Copy the bot token (looks like 123456:ABC-DEF…)',
    'Create a Telegram bot',
  )

  const tokenInput = await p.text({
    message: 'Paste your bot token',
    validate: v => (v.includes(':') ? undefined : 'Token format: 12345:ABC-DEF…'),
  })
  if (p.isCancel(tokenInput)) { p.cancel('Setup cancelled'); process.exit(0) }
  const botToken = tokenInput as string

  // Validate token
  const spinner = p.spinner()
  spinner.start('Validating token…')
  let botUsername: string
  try {
    botUsername = await validateTelegramToken(botToken)
    spinner.stop(`Bot: @${botUsername}`)
  } catch (err) {
    spinner.stop(chalk.red('Invalid token'))
    p.note((err as Error).message, 'Error')
    return
  }

  p.note(
    `Send any message to @${botUsername} in Telegram now.\novernight will capture your chat ID automatically.`,
    'Connect your account',
  )

  const waitSpinner = p.spinner()
  waitSpinner.start('Waiting for your message (2 min timeout)…')
  let chatId: string
  try {
    chatId = await pollTelegramForChatId(botToken, 120_000)
    waitSpinner.stop(`Chat ID captured: ${chatId}`)
  } catch {
    waitSpinner.stop(chalk.red('Timed out — no message received'))
    p.note('Run `overnight setup --telegram` to try again', 'Try again')
    return
  }

  // Send test message
  try {
    await sendTelegram(
      botToken,
      chatId,
      '🌙 overnight is connected! I\'ll notify you when your agent needs attention.',
    )
    p.note('Test message sent', 'Telegram connected')
  } catch (err) {
    p.note(`Test message failed: ${(err as Error).message}`, 'Warning')
  }

  config.notifications.telegram = { botToken, chatId }
}

async function setupSlack(config: OvernightConfig): Promise<void> {
  p.note(
    '1. Go to api.slack.com/apps → Your App → Incoming Webhooks\n2. Activate Incoming Webhooks\n3. Click "Add New Webhook to Workspace"\n4. Copy the webhook URL',
    'Create a Slack webhook',
  )

  const webhookInput = await p.text({
    message: 'Paste your Slack webhook URL',
    validate: v => (v.startsWith('https://hooks.slack.com/') ? undefined : 'Must start with https://hooks.slack.com/'),
  })
  if (p.isCancel(webhookInput)) { p.cancel('Setup cancelled'); process.exit(0) }
  const webhookUrl = webhookInput as string

  const spinner = p.spinner()
  spinner.start('Sending test message…')
  try {
    await validateSlackWebhook(webhookUrl)
    spinner.stop('Slack connected')
    config.notifications.slack = { webhookUrl }
  } catch (err) {
    spinner.stop(chalk.red('Failed'))
    p.note((err as Error).message, 'Error')
  }
}

async function uninstallCommand(): Promise<void> {
  p.intro(chalk.bold('🌙 overnight uninstall'))

  const confirm = await p.confirm({
    message: 'Remove overnight config and hooks?',
    initialValue: false,
  })
  if (p.isCancel(confirm) || !confirm) {
    p.cancel('Cancelled')
    return
  }

  const { removeStatusLineHook } = await import('../hooks/writer.js')
  const removed = removeStatusLineHook()
  if (removed) {
    p.note('Removed statusLine hook from ~/.claude/settings.json', 'Hook removed')
  }

  const { OVERNIGHT_DIR } = await import('../lib/config.js')
  const fs = await import('fs')
  if (fs.existsSync(OVERNIGHT_DIR)) {
    fs.rmSync(OVERNIGHT_DIR, { recursive: true, force: true })
    p.note(`Removed ~/.overnight/`, 'Config removed')
  }

  p.outro('overnight uninstalled.')
}
