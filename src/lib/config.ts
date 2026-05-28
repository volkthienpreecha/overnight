import fs from 'fs'
import os from 'os'
import path from 'path'
import { OvernightConfig, DEFAULT_CONFIG } from './types.js'

export const OVERNIGHT_DIR = path.join(os.homedir(), '.overnight')
export const CONFIG_PATH = path.join(OVERNIGHT_DIR, 'config.json')
export const EVENTS_PATH = path.join(OVERNIGHT_DIR, 'events.jsonl')
export const STATUS_PATH = path.join(OVERNIGHT_DIR, 'status.json')
export const CHECKPOINTS_DIR = path.join(OVERNIGHT_DIR, 'checkpoints')
export const HOOK_SCRIPT_PATH = path.join(OVERNIGHT_DIR, 'hook.js')

export function ensureDirs(): void {
  fs.mkdirSync(OVERNIGHT_DIR, { recursive: true })
  fs.mkdirSync(CHECKPOINTS_DIR, { recursive: true })
}

export function readConfig(): OvernightConfig {
  if (!fs.existsSync(CONFIG_PATH)) return { ...DEFAULT_CONFIG }
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
    const parsed = JSON.parse(raw) as Partial<OvernightConfig>
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      notifications: {
        ...DEFAULT_CONFIG.notifications,
        ...(parsed.notifications ?? {}),
      },
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function writeConfig(config: OvernightConfig): void {
  ensureDirs()
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
}

export function patchConfig(patch: Partial<OvernightConfig>): OvernightConfig {
  const current = readConfig()
  const next: OvernightConfig = {
    ...current,
    ...patch,
    notifications: {
      ...current.notifications,
      ...(patch.notifications ?? {}),
    },
  }
  writeConfig(next)
  return next
}

export function hasNotifications(): boolean {
  const config = readConfig()
  return !!(config.notifications.telegram || config.notifications.slack)
}

export function saveCheckpoint(sessionId: string, summary: string): string {
  ensureDirs()
  const ts = Date.now()
  const filename = `${ts}-${sessionId.slice(0, 8)}.md`
  const filepath = path.join(CHECKPOINTS_DIR, filename)
  const content = [
    `# Checkpoint — ${new Date(ts).toISOString()}`,
    `Session: ${sessionId}`,
    '',
    summary,
  ].join('\n')
  fs.writeFileSync(filepath, content)
  return filepath
}

export function loadLatestCheckpoint(sessionId?: string): string | null {
  if (!fs.existsSync(CHECKPOINTS_DIR)) return null
  const files = fs.readdirSync(CHECKPOINTS_DIR)
    .filter(f => f.endsWith('.md'))
    .filter(f => !sessionId || f.includes(sessionId.slice(0, 8)))
    .sort()
    .reverse()
  if (files.length === 0) return null
  return fs.readFileSync(path.join(CHECKPOINTS_DIR, files[0]), 'utf8')
}
