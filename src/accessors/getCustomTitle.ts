/**
 * getCustomTitle — return the last `custom-title` entry's title for a session,
 * or `null` if not set.
 */

import { resolveProjectsRoot } from '../internal/config.js'
import { findSessionFile } from '../internal/fileDiscovery.js'
import { readJsonlFile } from '../internal/jsonl.js'
import type { ScanFileHistoryOptions, SessionId } from '../types.js'

export async function getCustomTitle(
  sessionId: SessionId,
  options: ScanFileHistoryOptions = {},
): Promise<string | null> {
  const root = resolveProjectsRoot(options.configRoot)
  const found = await findSessionFile(root, sessionId)
  if (!found) return null

  const entries = await readJsonlFile(found.filePath)
  let customTitle: string | null = null
  for (const entry of entries) {
    if (
      entry.type === 'custom-title' &&
      typeof entry.customTitle === 'string' &&
      entry.customTitle.trim()
    ) {
      customTitle = entry.customTitle
    }
  }
  return customTitle
}
