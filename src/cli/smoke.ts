#!/usr/bin/env node
/**
 * session-store-smoke — verify the scanner works against the user's real
 * `~/.claude/projects/` directory.
 *
 * Usage:
 *   session-store-smoke                       # list projects & sessions
 *   session-store-smoke --session <id>        # dump one session as JSON
 *   session-store-smoke --help                # show help
 *
 * Exit codes:
 *   0  success
 *   1  no sessions found (or path doesn't exist)
 *   2  invalid arguments
 */

import * as path from 'node:path'
import * as os from 'node:os'
import { resolveConfigRoot, resolveProjectsRoot } from '../internal/config.js'
import { defaultFindGitRoot } from '../internal/gitRoot.js'
import { scanProjects, scanSession } from '../index.js'

interface CliArgs {
  sessionId?: string
  help: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      args.help = true
    } else if (arg === '--session' && i + 1 < argv.length) {
      args.sessionId = argv[i + 1]
      i += 1
    }
  }
  return args
}

function printHelp(): void {
  console.log(`session-store-smoke — verify @claude-code-local/session-store against real data

Usage:
  session-store-smoke                       list all projects + sessions
  session-store-smoke --session <id>        dump one session as pretty JSON
  session-store-smoke --help                show this help

Environment:
  CLAUDE_CONFIG_DIR    override the config root (default: ~/.claude)
`)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const configRoot = resolveConfigRoot()
  const projectsRoot = resolveProjectsRoot()

  console.log(`config root:        ${configRoot}`)
  console.log(`projects dir:       ${projectsRoot}`)
  console.log()

  if (args.sessionId) {
    const detail = await scanSession(args.sessionId as never, {
      findGitRoot: defaultFindGitRoot,
      includeSubagentMessages: true,
    })
    if (!detail) {
      console.error(`Session not found: ${args.sessionId}`)
      process.exit(1)
    }
    console.log(JSON.stringify(detail, null, 2))
    return
  }

  const items = await scanProjects(undefined, { findGitRoot: defaultFindGitRoot })

  if (items.length === 0) {
    console.error(
      `No sessions found under ${projectsRoot}.\n` +
        `Run a Claude Code session first, or set CLAUDE_CONFIG_DIR to a different path.`,
    )
    process.exit(1)
  }

  // Group by project for readable output.
  const byProject = new Map<string, typeof items>()
  for (const item of items) {
    const bucket = byProject.get(item.sanitizedProjectPath) ?? []
    bucket.push(item)
    byProject.set(item.sanitizedProjectPath, bucket)
  }

  console.log(`Found ${items.length} session(s) across ${byProject.size} project(s):\n`)
  for (const [projectKey, projectItems] of byProject) {
    const projectPath = projectItems[0]?.projectPath ?? projectKey
    console.log(`📁 ${projectPath}`)
    console.log(`   sanitized: ${projectKey}`)
    for (const item of projectItems.slice(0, 10)) {
      const title = item.title.length > 60 ? item.title.slice(0, 60) + '...' : item.title
      const size = humanSize(item.sizeBytes)
      const mtime = new Date(item.modifiedAt).toISOString().slice(0, 16).replace('T', ' ')
      console.log(`   • ${item.id}  ${mtime}  ${item.messageCount}msg  ${size}`)
      console.log(`     ${title}`)
    }
    if (projectItems.length > 10) {
      console.log(`     ... and ${projectItems.length - 10} more`)
    }
    console.log()
  }

  // Sanity cross-check
  console.log(
    `Tip: verify with: find ${projectsRoot} -name '*.jsonl' -type f | wc -l`,
  )
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err)
  process.exit(2)
})

// Avoid unused-import warning for path/os (kept available for future flags).
void path
void os
