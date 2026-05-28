# overnight

Claude Code stops when it hits a rate limit. You wake up, nothing got done.

`overnight` wraps your agent and handles it. Rate limits, crashes, hangs. When the limit clears it picks up right where it left off using the actual session ID, not a restart from scratch. Works on Windows without tmux or WSL.

## Install

```bash
npm install -g overnight-cli
```

The command is still `overnight`.

## Quick start

```bash
# Optional but worth it: set up Telegram so it pings you
overnight setup --telegram

# Then just prefix your normal claude command
overnight run -- claude -p "Build feature X" --dangerously-skip-permissions
```

That's it. Go to sleep.

## What it does

| Situation | What overnight does |
|---|---|
| Rate limit | Waits for the reset, resumes with `--resume SESSION_ID` |
| Crash | Restarts up to 3 times, uses `--resume` to keep context |
| No output for 10 min | Sends an alert with the last 30 lines |
| Auth prompt / merge conflict / y-n question | Sends an alert right away |
| Task finishes | Sends a success ping |

## Works with Claude, Codex, and Gemini

Each agent uses its own native resume so you don't lose context on a long task.

| | Claude Code | Codex CLI | Gemini CLI |
|---|---|---|---|
| Rate-limit detection | ✅ | ✅ | ✅ |
| Resumes same session | ✅ `--resume SESSION_ID` | ✅ `exec resume SESSION_ID` | ✅ `--resume SESSION_ID` |
| Parses exact wait time | ✅ | ✅ | ✅ |
| Auto-injects JSON output | ✅ `--output-format stream-json` | ✅ `--json` | ✅ `--output-format stream-json` |

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

overnight spawns your agent as a child process and pipes the output through normally. In the background it:

1. Injects `--output-format stream-json` (or the equivalent for each agent) so it can read the session ID from the output
2. Watches for rate-limit messages using patterns sourced from each agent's actual error strings
3. On rate limit: saves the last 30 lines as a checkpoint, waits until the exact reset time, then runs `claude --resume SESSION_ID` (or the Codex / Gemini equivalent) to continue the same session
4. On crash: backs off and restarts, reusing `--resume` if a session ID was captured
5. On silence: monitors for auth prompts, merge conflicts, and other patterns that mean the agent is stuck

## Telegram setup (5 steps)

```bash
overnight setup --telegram
```

1. Message [@BotFather](https://t.me/botfather) on Telegram, send `/newbot`, copy the token
2. Paste the token into the wizard
3. Send any message to your new bot
4. overnight captures your chat ID automatically
5. Test message sent

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

## Flags for overnight run

```bash
overnight run -v -- claude ...              # Verbose: shows session ID and resume command
overnight run --hang-timeout 30 -- ...      # Alert if no output for 30 seconds (good for testing)
```

## Claude Code status bar hook

`overnight setup` can install a hook into `~/.claude/settings.json`:

```json
{ "statusLine": "~/.overnight/hook.js" }
```

This makes overnight read the exact rate-limit reset time from Claude's structured data instead of parsing text. It also shows context usage in Claude's status bar: `🌙 overnight | ctx: 73%`

## Windows

Works on Windows PowerShell and Command Prompt without any extra setup. No tmux, no WSL, no admin rights needed.

## Contributing

Node.js 18+, TypeScript, no native modules.

```bash
git clone https://github.com/volkthienpreecha/agent-watch
cd agent-watch
npm install
npm run build
node dist/cli.js run -- echo "test"
```

To test specific features:

```bash
node test/verify-resume-args.js                                    # Unit tests for resume logic
node dist/cli.js run -- node test/simulate-crash-then-complete.js  # Crash recovery
node dist/cli.js run --hang-timeout 5 -- node test/simulate-hang.js  # Hang detection
node dist/cli.js run -- node test/simulate-codex-rate-limit.js     # Codex rate limit
node dist/cli.js run -- node test/simulate-gemini-rate-limit.js    # Gemini rate limit
```

## License

MIT
