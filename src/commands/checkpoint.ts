import chalk from 'chalk'
import fs from 'fs'
import path from 'path'
import { CHECKPOINTS_DIR, ensureDirs } from '../lib/config.js'

export function checkpointCommand(action: string, id?: string): void {
  if (action !== 'list' && action !== 'show') {
    console.error(chalk.red(`Unknown checkpoint action: ${action}`))
    console.error('Usage: overnight checkpoint [list|show] [id]')
    process.exitCode = 1
    return
  }

  ensureDirs()

  if (action === 'list') {
    if (!fs.existsSync(CHECKPOINTS_DIR)) {
      console.log(chalk.dim('No checkpoints yet.'))
      return
    }
    const files = fs.readdirSync(CHECKPOINTS_DIR).filter(f => f.endsWith('.md')).sort().reverse()
    if (files.length === 0) {
      console.log(chalk.dim('No checkpoints yet.'))
      return
    }
    console.log(chalk.bold(`\n🌙 overnight checkpoints (${files.length})\n`))
    for (const f of files) {
      const stat = fs.statSync(path.join(CHECKPOINTS_DIR, f))
      const age = Math.round((Date.now() - stat.mtimeMs) / 60000)
      console.log(`  ${chalk.cyan(f)}  ${chalk.dim(age + 'm ago')}`)
    }
    console.log()
    return
  }

  if (action === 'show') {
    if (!fs.existsSync(CHECKPOINTS_DIR)) {
      console.log(chalk.dim('No checkpoints.'))
      return
    }
    const files = fs.readdirSync(CHECKPOINTS_DIR).filter(f => f.endsWith('.md')).sort().reverse()
    const target = id
      ? files.find(f => f.includes(id))
      : files[0]

    if (!target) {
      console.log(chalk.red(`No checkpoint found${id ? ` matching "${id}"` : ''}`))
      return
    }

    const content = fs.readFileSync(path.join(CHECKPOINTS_DIR, target), 'utf8')
    console.log(chalk.bold(`\n${target}\n`))
    console.log(content)
  }
}
