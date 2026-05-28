# overnight — Agent Watch Design Doc
**Date:** 2026-05-27  
**Branch:** staging  
**Mode:** Builder (distribution-first OSS)  
**Chosen approach:** C — npm package + Windows-first

---

## Problem

Claude Code (and Codex) stops when it hits a rate limit, crashes, or hangs. Users must babysit the session or lose progress. Existing OSS tools solve only the rate-limit case, and only on macOS/Linux via tmux output-scraping. Nobody has built a cross-platform, installable solution that handles the full overnight failure surface.

---

## What Users Actually Want

- "Don't lose progress."
- "Don't make me babysit."
- "Wake me only if blocked."

Rate-limit auto-retry is 10% of that. The rest is: crash recovery, hang detection, context checkpointing, and smart human escalation.

---

## Eureka (from landscape search)

> Everyone builds output-scraping wrappers assuming the terminal is the only interface. But Claude Code exposes a `statusLine` hook in `~/.claude/settings.json` that fires after every response, returning rate-limit data as structured JSON (usage percentage, reset timestamp). Building on this hook means: no tmux dependency, no text parsing, structured reset timestamps, works in any terminal including Windows PowerShell.

This is the architectural insight that separates overnight from every existing tool.

---

## Product Name

**`overnight`** — npm package, CLI, daemon

Tagline: *"Run your coding agent while you sleep."*

Viral setup line: `overnight setup --telegram`

---

## Agreed Premises

1. statusLine hook is the right integration point (not output-scraping)
2. Checkpoint summary before pause is the killer differentiator
3. "Overnight reliability" != "auto-resume" — crash/hang/escalation are required
4. Anthropic may ship native auto-resume, but not the broader watchdog (moat is checkpoint + escalation)
5. Demo story drives distribution: the GIF is "midnight → limit → wait → resume → 6am ping"

---

## Distribution Strategy

**Primary wedge:** Windows support. Every competitor is tmux-only (macOS/Linux). Claude Code has substantial Windows users. overnight is the first tool that works on Windows PowerShell — this is the unoccupied angle.

**Install experience:**
```
npm install -g @overnight/cli
overnight setup
overnight setup --telegram   # viral moment: Telegram bot wizard
```

**Distribution channels (priority order):**
1. GitHub — clean README with the demo GIF (morning ping screenshot)
2. r/ClaudeAI — post with "I built overnight: works on Windows + Telegram alerts"
3. npm — package page, download graph compounds over time
4. X/Twitter — 15s screen recording of the demo story
5. awesome-cli-coding-agents repo — PR to add overnight
6. Anthropic GitHub issues #35744, #18980 — comment with overnight as the solution

---

## Architecture

```
overnight setup
  └── Writes statusLine hook to ~/.claude/settings.json
  └── Starts overnight-daemon as background process (pm2 / native on Windows)
  └── Creates ~/.overnight/config.json

overnight-daemon
  ├── Hook receiver: reads ~/.overnight/status.json (written by statusLine hook)
  │     └── rate_limit_reached → sleep until reset_at, send resume command
  ├── Process monitor: watches claude/codex PID
  │     └── crash → restart after backoff, inject context checkpoint
  ├── Output staleness detector: watches stdout via pipe
  │     └── no output for N minutes → snapshot state, alert if human needed
  └── Notification dispatcher
        └── Telegram bot (default) | Slack webhook | desktop notification

Claude Code statusLine hook (writes to ~/.overnight/status.json):
  {
    "ts": 1716857400,
    "rate_limit_pct": 95,
    "reset_at": 1716864000,
    "session_id": "abc123"
  }
```

### Checkpoint Summary (the differentiator)

Before every planned pause (rate-limit wait), overnight injects a prompt into the active Claude Code session:

```
[overnight] Rate limit reached. Before pausing, please write a 3-sentence
summary of: (1) what you completed, (2) what you were working on, and
(3) what to do next. This will be restored on resume.
```

The response is saved to `~/.overnight/checkpoints/{session_id}.md`.

On resume, overnight prepends this checkpoint to the session context via `--resume-with-context` flag (or by appending it as the first user message).

### Human-Needed Escalation

overnight monitors for patterns that mean "agent is stuck":
- Same file edited 3+ times without progress (loop detection)
- Authentication prompts in output
- Git merge conflict markers in output
- "Permission denied" repeated
- No tool calls for N consecutive turns

When triggered: send Telegram/Slack alert with last 30 lines + checkpoint summary.

---

## Windows Implementation Notes

Terminal injection on Windows does not use tmux `send-keys`. Options:
1. **Named pipe / IPC**: overnight-daemon opens a named pipe; a small shim in the hook writes to it; the daemon reads and can inject input back via `WriteConsoleInput` Win32 API.
2. **Windows Terminal / ConPTY**: newer sessions can accept input via the ConPTY API.
3. **Fallback**: write a `.overnight-resume` marker file; Claude Code's `preStart` hook reads it on next launch and prepends context.

Option 3 is the minimal Windows path for day 1. Options 1/2 come in v2.

---

## Ship Plan (4 days)

**Day 1 — Core engine (Approach A)**
- Node.js project: `packages/core`
- statusLine hook writer: `overnight setup` patches `~/.claude/settings.json`
- Hook script: writes to `~/.overnight/status.json`
- Rate-limit watcher: reads status.json, sleeps until reset_at, sends "continue" via terminal
- Test on macOS first

**Day 2 — Checkpoint + Windows**
- Checkpoint injection: detect rate-limit-approaching (>80%), inject summary prompt
- Checkpoint save to `~/.overnight/checkpoints/`
- Windows path: `.overnight-resume` marker file approach
- Test on Windows (PowerShell)

**Day 3 — Notifications + escalation**
- Telegram bot setup wizard: `overnight setup --telegram` (5 steps, guided)
- Slack webhook support
- Human-needed detection: loop detection + auth prompt pattern matching

**Day 4 — Polish + distribution**
- README with demo GIF (record the demo story: midnight → limit → wait → resume → morning ping)
- `overnight status` terminal dashboard (live view of daemon state)
- npm publish to `@overnight/cli`
- Post to r/ClaudeAI and X

---

## MVP Command Surface

```bash
overnight setup                    # install hooks, start daemon
overnight setup --telegram         # + telegram bot wizard
overnight run claude [args]        # explicit session wrapper (optional)
overnight status                   # show daemon state + recent events
overnight log                      # tail event log
overnight stop                     # stop daemon
overnight uninstall                # remove hooks, stop daemon
```

---

## README Structure (for maximum GitHub stars)

1. **Hero GIF** — the demo story (most important asset, record day 4)
2. One-line description: "overnight makes Claude Code reliable for unattended tasks."
3. `npm install -g @overnight/cli && overnight setup` — that's it
4. Feature bullets: rate-limit recovery, checkpoint summaries, crash detection, Telegram alerts, **Windows support**
5. How it works (3 sentences + diagram)
6. Comparison table vs claude-auto-retry, autoclaude, Smart Resume
7. Contributing / roadmap

---

## Comparison Table (for README)

| Feature | claude-auto-retry | autoclaude | overnight |
|---|---|---|---|
| Rate-limit recovery | ✅ | ✅ | ✅ |
| Checkpoint summaries | ❌ | ❌ | ✅ |
| Crash recovery | ❌ | ❌ | ✅ |
| Hang detection | ❌ | ❌ | ✅ |
| Human escalation alerts | ❌ | ❌ | ✅ |
| Telegram/Slack | ❌ | ❌ | ✅ |
| Windows support | ❌ | ❌ | ✅ |
| npm installable | ❌ | ❌ | ✅ |
| Hook-based (not scraping) | ❌ | ❌ | ✅ |

---

## Open Questions

1. **Codex support**: Codex has native session resume — does overnight add value there beyond crash/hang detection?
2. **Multi-agent support**: what if user is running 3 Claude Code sessions in parallel (e.g., with amux)? overnight-daemon should handle N sessions.
3. **Checkpoint injection method**: injecting a prompt mid-session assumes Claude Code supports that. Test whether the `preToolUse` or `postToolUse` hook is the right place for this.
4. **Windows ConPTY**: is ConPTY available for terminal input injection without admin rights? Needs spike.
5. **npm org name**: `@overnight/cli` is a guess — check availability.

---

## Success Metrics

- 100 GitHub stars in first week
- 1000 npm downloads in first month
- Appears in awesome-cli-coding-agents
- At least one Windows user reports it working in the wild

---

*Generated by gstack /office-hours on 2026-05-27*
