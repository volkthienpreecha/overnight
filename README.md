# overnight

> Keep your coding agent running while you sleep.

Rate-limit recovery · checkpoint summaries · crash detection · Telegram/Slack alerts · **Windows support**

---

## The problem

Claude Code stops when it hits a usage limit, crashes, or hangs. You have to babysit the terminal or lose progress. Every existing tool solves only the rate-limit case, and only on macOS/Linux via tmux output-scraping.

overnight solves the whole problem — cross-platform, installable as an npm package, with a 5-step Telegram setup wizard.

## Install

```bash
npm install -g overnight
```

## Quick start

```bash
# 1. Configure notifications (optional but recommended)
overnight setup --telegram

# 2. Run your agent
overnight run -- claude -p "Build feature X in my codebase" --dangerously-skip-permissions
```

That's it. Go to sleep. overnight handles everything else.

## What it does

| Scenario | overnight behavior |
|---|---|
| Rate limit hit | Saves checkpoint, waits for reset, resumes with `--resume SESSION_ID` |
| Claude crashes (non-zero exit) | Restarts up to 3× with backoff, uses `--resume` to preserve context |
| No output for 10 min | Sends alert — "agent may be stuck" — with last 30 lines |
| Needs human input (auth, merge conflict, y/n prompt) | Sends alert immediately |
| Task completes | Sends success notification |

## Why it's different

| Feature | claude-auto-retry | autoclaude | **overnight** |
|---|---|---|---|
| Rate-limit recovery | ✅ | ✅ | ✅ |
| Checkpoint before pause | ❌ | ❌ | ✅ |
| Crash recovery + resume | ❌ | ❌ | ✅ |
| Hang detection | ❌ | ❌ | ✅ |
| Human-needed escalation | ❌ | ❌ | ✅ |
| Telegram/Slack alerts | ❌ | ❌ | ✅ |
| **Windows support** | ❌ | ❌ | ✅ |
| npm installable | ❌ | ❌ | ✅ |
| Hook-based (not output scraping) | ❌ | ❌ | ✅ |

## How it works

overnight wraps your agent command as a child process and pipes all output through to your terminal normally. In the background it:

1. **Parses output** for rate-limit text patterns and extracts the session ID from Claude Code's JSON stream format
2. **Reads the statusLine hook** (optional, installs via `overnight setup`) for exact rate-limit timestamps from Claude Code's structured data instead of guessing from text
3. **On rate limit**: saves the last 30 lines as a checkpoint, waits until reset time, then runs `claude --resume SESSION_ID` to pick up exactly where it left off — full conversation history intact
4. **On crash**: waits with exponential backoff, resumes or restarts
5. **On hang**: monitors for human-needed patterns (password prompts, merge conflicts, y/n questions) and alerts before the session is stuck for hours

## Commands

```bash
overnight run -- <cmd> [args]    # Run any command with supervision
overnight setup                   # Interactive setup wizard
overnight setup --telegram        # Set up Telegram notifications
overnight setup --slack           # Set up Slack notifications
overnight status                  # Show config and recent events
overnight log                     # Show event history
overnight log --tail 20           # Last 20 events
overnight checkpoint list         # List saved checkpoints
overnight checkpoint show         # Show latest checkpoint
overnight uninstall               # Remove config and hooks
```

## Telegram setup (5 steps)

```bash
overnight setup --telegram
```

1. Message [@BotFather](https://t.me/botfather) → `/newbot` → copy token
2. Paste token into the wizard
3. Message your new bot (any text)
4. overnight captures your chat ID automatically
5. Test notification sent — done

## Notifications

Notification sent when:
- Rate limit hit (with resume time)
- Resumed after waiting
- Crashed (with restart count)
- Stuck or needs human input (with last 30 lines)
- Task completed

## Claude Code statusLine hook

`overnight setup` optionally installs a hook into `~/.claude/settings.json`:

```json
{ "statusLine": "~/.overnight/hook.js" }
```

This hook receives session data from Claude Code after every response and writes the exact rate-limit reset timestamp to `~/.overnight/status.json`. This makes overnight's wait time accurate instead of estimated.

The hook also displays context usage in Claude Code's status bar: `🌙 overnight | ctx: 73%`

## Windows

overnight works on Windows PowerShell and Command Prompt without tmux or WSL. Process spawning, output piping, and Claude Code's `--resume` flag all work natively on Windows.

## Contributing

Built with TypeScript + Node.js 18+. No native modules. Cross-platform by design.

```bash
git clone https://github.com/volkthienpreecha/agent-watch
cd agent-watch
npm install
npm run build
node dist/cli.js run -- echo "test"
```

## License

MIT
