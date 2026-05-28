# overnight

Your coding agent stops when it hits a rate limit, crashes, hangs, or asks a question. You wake up and nothing moved.

`overnight` wraps Claude Code, Codex, or Gemini and watches the run for you. It resumes after rate limits, restarts after crashes, alerts you when a human is needed, and saves checkpoints so you can see what happened.

Works on Windows PowerShell without tmux or WSL.

## Install

### Download a binary, no Node.js required

Go to [Releases](https://github.com/volkthienpreecha/agent-watch/releases/latest) and download the file for your platform.

**Windows**

1. Download `overnight-vX.X.X-win.exe`.
2. Rename it to `overnight.exe`.
3. Put it in a folder on your PATH.

PowerShell example:

```powershell
$bin = "$HOME\bin"
New-Item -ItemType Directory -Force $bin
Move-Item .\overnight-vX.X.X-win.exe "$bin\overnight.exe"
[Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path', 'User') + ";$bin", 'User')
```

Open a new terminal, then check:

```powershell
overnight --version
```

If Windows SmartScreen blocks the file, right-click it, open **Properties**, check **Unblock**, then try again.

**Mac / Linux**

```bash
chmod +x overnight-*-macos   # or overnight-*-linux
sudo mv overnight-*-macos /usr/local/bin/overnight
overnight --version
```

### npm, requires Node.js 18+

```bash
npm install -g overnight-cli
```

On Windows PowerShell, use `npm.cmd` if `npm` is blocked by execution policy:

```powershell
npm.cmd install -g overnight-cli
```

The installed command is `overnight`.

## See It Work First

Run the demo before connecting any accounts:

```bash
overnight demo
```

It simulates a full rate-limit cycle in about 15 seconds: session capture, wait, resume, and success.

## Quick Start

Notifications are optional, but useful if you are actually leaving the agent unattended.

```bash
overnight setup --telegram
```

Then prefix your normal agent command:

```bash
overnight run -- claude -p "Build feature X" --dangerously-skip-permissions
overnight run -- codex exec "Build feature X" --dangerously-bypass-approvals-and-sandbox
overnight run -- gemini -p "Build feature X"
```

Use a short hang timeout while testing:

```bash
overnight run --hang-timeout 30 -- codex exec "Try a small task"
```

## What It Does

| Situation | What happens |
|---|---|
| Rate limit | Waits for the reset, saves a checkpoint, resumes the same session when possible |
| Crash | Restarts up to 3 times and resumes the same session if one was captured |
| No output | Alerts you and stops the wrapper so the blocked process does not sit forever |
| Auth prompt, merge conflict, y/n question | Alerts right away, then keeps watching for silence |
| Task finishes | Sends a success ping if notifications are connected |

## Agent Support

| | Claude Code | Codex CLI | Gemini CLI |
|---|---|---|---|
| Rate-limit detection | yes | yes | yes |
| Same-session resume | `--resume SESSION_ID` | `exec resume SESSION_ID` | `--resume SESSION_ID` |
| Wait-time parsing | `resets in 5 hours` | `try again in 10 minutes`, `try again at 11:00 PM` | `retry in 60s` |

## Commands

```bash
overnight run -- <command> [args]   # Watch an agent command
overnight demo                      # Simulated rate-limit cycle
overnight setup --telegram          # Telegram notification wizard
overnight setup --slack             # Slack webhook wizard
overnight status                    # Config and recent events
overnight log                       # Full event history
overnight log --tail 20             # Last 20 events
overnight log --type rate_limit     # Filter by event type
overnight checkpoint list           # List saved checkpoints
overnight checkpoint show           # Show the latest checkpoint
overnight uninstall                 # Remove config and hooks
```

## Setup Notes

Telegram setup asks for a bot token from [@BotFather](https://t.me/botfather), then waits for you to send a message to the bot so it can capture your chat ID.

Slack setup asks for an incoming webhook URL.

Secrets are stored locally in `~/.overnight/config.json`. Remove them with:

```bash
overnight uninstall
```

`overnight setup` can also install a Claude Code `statusLine` hook. The hook adds a small `overnight` indicator to Claude's status bar and lets `overnight status` show the last Claude session it saw.

## How It Works

`overnight run` starts your command, passes output through to your terminal, and watches each line.

1. It adds structured-output flags when supported: `--output-format stream-json` for Claude/Gemini and `--json` for `codex exec`.
2. It captures session IDs from agent output.
3. It detects rate-limit, crash, completion, hang, and human-needed patterns.
4. On rate limit, it saves the last output as a checkpoint, waits until the reset, then runs the agent's resume command.
5. On crash, it restarts with backoff up to the configured limit.
6. On hang or human-needed prompts, it alerts you with the last output.

## Development

```bash
git clone https://github.com/volkthienpreecha/agent-watch
cd agent-watch
npm install
npm run build
node dist/cli.js demo
```

On Windows PowerShell, use `npm.cmd` if `npm` is blocked:

```powershell
npm.cmd install
npm.cmd run build
```

Useful checks:

```bash
npm run typecheck
node test/verify-resume-args.js
node test/verify-detector.js
node dist/cli.js run -- node test/simulate-crash-then-complete.js
node dist/cli.js run --hang-timeout 5 -- node test/simulate-hang.js
```

## License

MIT
