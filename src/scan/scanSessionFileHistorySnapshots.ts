/**
 * scanSessionFileHistorySnapshots — return every file-history-snapshot entry
 * in a session, in file order.
 */

import { resolveProjectsRoot } from '../internal/config.js'
import { findSessionFile } from '../internal/fileDiscovery.js'
import { readJsonlFile, type RawEntry } from '../internal/jsonl.js'
import type { FileHistorySnapshot, ScanFileHistoryOptions, SessionId } from '../types.js'

export async function scanSessionFileHistorySnapshots(
  sessionId: SessionId,
  options: ScanFileHistoryOptions = {},
): Promise<FileHistorySnapshot[]> {
  const root = resolveProjectsRoot(options.configRoot)
  const found = await findSessionFile(root, sessionId)
  if (!found) return []

  const entries = await readJsonlFile(found.filePath)
  return extractSnapshots(entries)
}

function extractSnapshots(entries: RawEntry[]): FileHistorySnapshot[] {
  const snapshots: FileHistorySnapshot[] = []
  for (const entry of entries) {
    if (entry.type !== 'file-history-snapshot') continue
    const snap = entry.snapshot
    if (!snap) continue
    snapshots.push({
      messageId: typeof snap.messageId === 'string' ? snap.messageId : '',
      trackedFileBackups: (snap.trackedFileBackups as FileHistorySnapshot['trackedFileBackups']) ?? {},
      timestamp: typeof snap.timestamp === 'string' ? snap.timestamp : entry.timestamp ?? new Date().toISOString(),
    })
  }
  return snapshots
}
