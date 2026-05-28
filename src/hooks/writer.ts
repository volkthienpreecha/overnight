/**
 * Reads/writes the Claude Code statusLine hook in ~/.claude/settings.json.
 * The statusLine hook fires after every Claude response and receives session
 * data via stdin as JSON. We use it to capture exact rate-limit timestamps.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { HOOK_SCRIPT_PATH, STATUS_PATH, ensureDirs } from '../lib/config.js'

const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json')

const HOOK_MARKER = '// overnight:hook'

const HOOK_SCRIPT = `${HOOK_MARKER}
// overnight statusLine hook — reads session data, writes rate-limit timing
const fs = require('fs');
const os = require('os');
let raw = '';
process.stdin.on('data', d => raw += d);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(raw || '{}');
    const statusPath = require('path').join(os.homedir(), '.overnight', 'status.json');
    fs.mkdirSync(require('path').dirname(statusPath), { recursive: true });
    fs.writeFileSync(statusPath, JSON.stringify({
      ts: Date.now(),
      session_id: data.session_id || null,
      context_window: data.context_window || null,
      cost_usd: data.cost_usd || null,
      raw_keys: Object.keys(data),
    }));
    // Display in Claude Code status bar
    const pct = data.context_window?.filled_pct ?? data.context_window?.used_pct ?? null;
    if (pct != null) {
      process.stdout.write('🌙 overnight | ctx: ' + Math.round(pct) + '%');
    } else {
      process.stdout.write('🌙 overnight');
    }
  } catch (e) {
    process.stdout.write('🌙 overnight');
  }
});
`

export function writeHookScript(): void {
  ensureDirs()
  fs.writeFileSync(HOOK_SCRIPT_PATH, HOOK_SCRIPT)
}

export function installStatusLineHook(): { installed: boolean; alreadyPresent: boolean } {
  writeHookScript()

  // Read or create Claude settings
  let settings: Record<string, unknown> = {}
  const settingsDir = path.dirname(CLAUDE_SETTINGS_PATH)

  if (fs.existsSync(CLAUDE_SETTINGS_PATH)) {
    try {
      settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf8')) as Record<string, unknown>
    } catch {
      // Settings file is malformed; back it up and start fresh
      fs.copyFileSync(CLAUDE_SETTINGS_PATH, CLAUDE_SETTINGS_PATH + '.bak')
      settings = {}
    }
  } else {
    fs.mkdirSync(settingsDir, { recursive: true })
  }

  const currentHook = settings.statusLine as string | undefined
  if (currentHook === HOOK_SCRIPT_PATH) {
    return { installed: false, alreadyPresent: true }
  }

  settings.statusLine = HOOK_SCRIPT_PATH
  fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2))
  return { installed: true, alreadyPresent: false }
}

export function removeStatusLineHook(): boolean {
  if (!fs.existsSync(CLAUDE_SETTINGS_PATH)) return false
  try {
    const settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf8')) as Record<string, unknown>
    if (settings.statusLine === HOOK_SCRIPT_PATH) {
      delete settings.statusLine
      fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2))
      return true
    }
  } catch {
    // ignore
  }
  return false
}

export function readStatusData(): {
  ts: number | null
  sessionId: string | null
  contextPct: number | null
} {
  if (!fs.existsSync(STATUS_PATH)) {
    return { ts: null, sessionId: null, contextPct: null }
  }
  try {
    const data = JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8')) as {
      ts?: number
      session_id?: string
      context_window?: { filled_pct?: number; used_pct?: number }
    }
    const contextPct =
      data.context_window?.filled_pct ?? data.context_window?.used_pct ?? null
    return {
      ts: data.ts ?? null,
      sessionId: data.session_id ?? null,
      contextPct: contextPct ?? null,
    }
  } catch {
    return { ts: null, sessionId: null, contextPct: null }
  }
}
