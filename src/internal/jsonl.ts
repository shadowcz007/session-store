/**
 * JSONL reader — full file read + streaming line iterator.
 *
 * Vendored and simplified from cc-haha's `SessionService.readJsonlFile` and
 * `scanSessionListSummary`. Malformed lines are silently skipped so a corrupt
 * transcript does not break the scanner.
 */

import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import * as fs from 'node:fs/promises'

/**
 * Minimal shape that covers every observed JSONL entry type in the transcripts.
 * Additional unknown fields are preserved via the open index signature so
 * callers can read entry-specific data (`session-meta.workDir`, etc.).
 */
export interface RawEntry {
  type?: string
  subtype?: string
  content?: unknown
  uuid?: string
  messageId?: string
  parentUuid?: string | null
  parent_tool_use_id?: string | null
  isSidechain?: boolean
  isMeta?: boolean
  cwd?: string
  message?: {
    role?: string
    content?: unknown
    model?: string
    id?: string
    type?: string
    usage?: Record<string, unknown>
  }
  timestamp?: string
  version?: string
  snapshot?: {
    messageId?: string
    trackedFileBackups?: Record<string, unknown>
    timestamp?: string
  }
  customTitle?: string
  permissionMode?: string
  worktreeSession?: PersistedWorktreeSession | null
  title?: string
  [key: string]: unknown
}

export interface PersistedWorktreeSession {
  originalCwd: string
  worktreePath: string
  worktreeName: string
  worktreeBranch?: string
  originalBranch?: string
  originalHeadCommit?: string
  sessionId: string
  tmuxSessionName?: string
  hookBased?: boolean
}

/**
 * Read an entire JSONL file into memory. Missing files return an empty array.
 * Malformed lines are silently skipped.
 */
export async function readJsonlFile(filePath: string): Promise<RawEntry[]> {
  let content: string
  try {
    content = await fs.readFile(filePath, 'utf-8')
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    throw err
  }

  const entries: RawEntry[] = []
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      entries.push(JSON.parse(trimmed) as RawEntry)
    } catch {
      // skip malformed lines
    }
  }
  return entries
}

/**
 * Stream a JSONL file line-by-line. Each callback receives the parsed entry or
 * `null` if the line could not be parsed (the line is still counted by the
 * underlying readline iterator, so progress is never lost).
 *
 * Use this for the lightweight `scanSessionListSummary` path where we only
 * need to peek at a handful of fields.
 */
export async function streamJsonlEntries(
  filePath: string,
  onEntry: (entry: RawEntry | null, line: string) => Promise<void> | void,
): Promise<void> {
  const stream = createReadStream(filePath, { encoding: 'utf8' })
  const lines = createInterface({
    input: stream,
    crlfDelay: Infinity,
  })

  try {
    for await (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      let entry: RawEntry | null = null
      try {
        entry = JSON.parse(trimmed) as RawEntry
      } catch {
        // malformed line — emit null with the raw text
      }
      await onEntry(entry, trimmed)
    }
  } finally {
    lines.close()
    stream.destroy()
  }
}
