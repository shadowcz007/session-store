/**
 * Example: bulk export every session to a single JSON archive.
 *
 * Use case: the "export all sessions" feature for a desktop app or a
 * one-off backup. Walks every project under CLAUDE_CONFIG_DIR and writes a
 * timestamped directory of one JSON file per session plus an index.
 *
 * Run with:
 *
 *     bun run examples/typescript/dump-all-sessions.ts
 *     # or with a custom destination:
 *     EXPORT_DIR=/tmp/sessions bun run examples/typescript/dump-all-sessions.ts
 *
 * Output layout:
 *
 *     <EXPORT_DIR>/sessions-2026-06-16T08-30-00Z/
 *     ├── index.json                ← array of SessionListItem
 *     ├── <sanitized-project>/
 *     │   ├── <sessionId>.json      ← SessionDetail (messages inlined)
 *     │   └── ...
 *     └── ...
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  scanProjects,
  scanSession,
  clearSessionStoreCache,
  type SessionId,
} from '@claude-code-local/session-store'

const EXPORT_ROOT = process.env.EXPORT_DIR ?? join(process.cwd(), 'exports')

async function main(): Promise<void> {
  clearSessionStoreCache()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outDir = join(EXPORT_ROOT, `sessions-${stamp}`)
  mkdirSync(outDir, { recursive: true })

  console.log(`Exporting to ${outDir}`)
  const items = await scanProjects()
  console.log(`Found ${items.length} session(s) across ${
    new Set(items.map((i) => i.sanitizedProjectPath)).size
  } project(s).\n`)

  // 1. Write the lightweight index up front.
  writeFileSync(
    join(outDir, 'index.json'),
    JSON.stringify(items, null, 2),
    'utf-8',
  )

  // 2. Stream each full session into its project folder.
  let succeeded = 0
  let failed = 0
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const projectDir = join(outDir, item.sanitizedProjectPath)
    mkdirSync(projectDir, { recursive: true })

    try {
      const detail = await scanSession(item.id as SessionId)
      if (!detail) {
        console.warn(`  ⚠ ${item.id}  disappeared mid-export`)
        failed += 1
        continue
      }
      writeFileSync(
        join(projectDir, `${item.id}.json`),
        JSON.stringify(detail, null, 2),
        'utf-8',
      )
      succeeded += 1
      if ((i + 1) % 50 === 0) {
        console.log(`  ${i + 1}/${items.length}...`)
      }
    } catch (err) {
      console.error(`  ✗ ${item.id}  ${err instanceof Error ? err.message : err}`)
      failed += 1
    }
  }

  console.log(`\nDone. ${succeeded} exported, ${failed} failed.`)
  console.log(`Index: ${join(outDir, 'index.json')}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
