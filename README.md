# overnight

Claude Code stops when it hits a rate limit. You wake up, nothing got done.

`overnight` wraps your agent and keeps it running. Rate limits, crashes, hangs. When the limit clears it picks up the same session, not a fresh start. Works on Windows without tmux or WSL.

## Install

```bash
npm install -g overnight-cli
```

The command is `overnight`.

## Quick start

```bash
# Set up Telegram so it pings you (optional but worth it)
overnight setup --telegram

# Prefix your normal agent command with overnight run --
overnight run -- claude -p "Build feature X" --dangerously-skip-permissions
```

Go to sleep. overnight handles the rest.

## What it does

| Situation | What happens |
|---|---|
| Rate limit | Waits for the reset, resumes with `--resume SESSION_ID` |
| Crash | Restarts up to 3 times, uses `--resume` to keep context |
| No output for 10 min | Sends an alert with the last 30 lines |
| Auth prompt, merge conflict, y/n question | Sends an alert right away |
| Task finishes | Sends a success ping |

## Works with Claude, Codex, and Gemini

Each one picks up the same session after a rate limit so you don't lose context.

| | Claude Code | Codex CLI | Gemini CLI |
|---|---|---|---|
| Rate-limit detection | ✅ | ✅ | ✅ |
| Resumes same session | ✅ `--resume SESSION_ID` | ✅ `exec resume SESSION_ID` | ✅ `--resume SESSION_ID` |
| Parses exact wait time | ✅ | ✅ | ✅ |

## How overnight compares

| Feature | claude-auto-retry | autoclaude | overnight |
|---|---|---|---|
| Rate-limit recovery | ✅ | ✅ | ✅ |
| Checkpoint before pause | ❌ | ❌ | ✅ |
| Crash recovery + resume | ❌ | ❌ | ✅ |
| Hang detection | ❌ | ❌ | ✅ |
| Human-needed alerts | ❌ | ❌ | ✅ |
| Telegram / Slack | ❌ | ❌ | ✅ |
| Windows support | ❌ | ❌ | ✅ |
| npm install | ❌ | ❌ | ✅ |
| No tmux required | ❌ | ❌ | ✅ |

## How it works

overnight runs your command and passes all output through to your terminal. Behind the scenes it:

1. Injects the right flag for each agent so it can capture the session ID (`--output-format stream-json` for Claude and Gemini, `--json` for Codex)
2. Watches the output for rate-limit messages using the exact error strings each agent produces
3. On rate limit: saves a checkpoint, waits until the reset, then resumes the same session with `--resume SESSION_ID`
4. On crash: backs off and restarts, reusing `--resume` if a session ID was captured
5. On silence: checks for auth prompts, merge conflicts, and anything else that means it needs you

## Telegram setup

```bash
overnight setup --telegram
```

1. Message [@BotFather](https://t.me/botfather), send `/newbot`, copy the token
2. Paste the token into the wizard
3. Send any message to your new bot
4. overnight captures your chat ID
5. Test message sent — you're done

## Commands

```bash
overnight run -- <command> [args]   # Watch any agent command
overnight setup --telegram          # Set up Telegram
overnight setup --slack             # Set up Slack
overnight status                    # Show config and recent events
overnight log                       # Full event history
overnight log --tail 20             # Last 20 events
overnight log --type rate_limit     # Filter by event type
overnight checkpoint list           # List saved checkpoints
overnight checkpoint show           # Show the latest checkpoint
overnight uninstall                 # Remove config and hooks
```

## Flags

```bash
overnight run -v -- claude ...              # Shows session ID and exact resume command
overnight run --hang-timeout 30 -- ...      # Alert if no output for 30s (useful for testing)
```

## Claude Code status bar

`overnight setup` can install a hook into `~/.claude/settings.json`:

```json
{ "statusLine": "~/.overnight/hook.js" }
```

This lets overnight read the exact reset time from Claude's session data instead of guessing from text output. It also adds a usage indicator to Claude's status bar: `🌙 overnight | ctx: 73%`

## Windows

Works on Windows PowerShell and Command Prompt. No tmux, no WSL, no admin rights.

## Contributing

Node.js 18+, TypeScript, no native modules. [GitHub repo](https://github.com/volkthienpreecha/agent-watch)

```bash
git clone https://github.com/volkthienpreecha/agent-watch
cd agent-watch
npm install
npm run build
node dist/cli.js run -- echo "test"
```

Test specific features:

```bash
node test/verify-resume-args.js                                      # Unit tests for resume logic
node dist/cli.js run -- node test/simulate-crash-then-complete.js    # Crash recovery
node dist/cli.js run --hang-timeout 5 -- node test/simulate-hang.js  # Hang detection
node dist/cli.js run -- node test/simulate-codex-rate-limit.js       # Codex rate limit
node dist/cli.js run -- node test/simulate-gemini-rate-limit.js      # Gemini rate limit
```

## License

MIT
