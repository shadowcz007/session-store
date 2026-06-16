/**
 * getTranscriptMetadata — light-weight metadata bundle for transcript list views.
 */

import { resolveProjectsRoot } from '../internal/config.js'
import { findSessionFile } from '../internal/fileDiscovery.js'
import { readJsonlFile, type RawEntry } from '../internal/jsonl.js'
import {
  countTranscriptMessages,
  resolvePermissionModeFromEntries,
  resolveWorkDirFromEntries,
} from '../internal/resolve.js'
import { extractUserMessageTitle } from '../internal/titleExtraction.js'
import type { ScanFileHistoryOptions, SessionId, TranscriptMetadata } from '../types.js'

const VALID_SESSION_EFFORT_LEVELS = new Set(['low', 'medium', 'high', 'max'])

export async function getTranscriptMetadata(
  sessionId: SessionId,
  options: ScanFileHistoryOptions = {},
): Promise<TranscriptMetadata | null> {
  const root = resolveProjectsRoot(options.configRoot)
  const found = await findSessionFile(root, sessionId)
  if (!found) return null

  const entries: RawEntry[] = await readJsonlFile(found.filePath)

  const metadata: TranscriptMetadata = {
    messageCount: countTranscriptMessages(entries),
  }

  // Walk from the end so the most recent wins (custom-title / ai-title can
  // be appended multiple times; user wants the last one).
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]
    if (!entry) continue

    if (!metadata.customTitle && entry.type === 'custom-title' && typeof entry.customTitle === 'string') {
      metadata.customTitle = entry.customTitle
    }
    if (!metadata.aiTitle && entry.type === 'ai-title' && typeof entry.aiTitle === 'string') {
      metadata.aiTitle = entry.aiTitle
    }
    if (entry.type === 'session-meta') {
      const record = entry as Record<string, unknown>
      if (
        !metadata.runtimeProviderId &&
        (record.runtimeProviderId === null || typeof record.runtimeProviderId === 'string')
      ) {
        metadata.runtimeProviderId = record.runtimeProviderId as string | null
      }
      if (!metadata.runtimeModelId && typeof record.runtimeModelId === 'string') {
        metadata.runtimeModelId = record.runtimeModelId
      }
      if (
        !metadata.effortLevel &&
        typeof record.effortLevel === 'string' &&
        VALID_SESSION_EFFORT_LEVELS.has(record.effortLevel)
      ) {
        metadata.effortLevel = record.effortLevel
      }
      if (!metadata.permissionMode) {
        const mode = resolvePermissionModeFromEntries(entries.slice(0, i + 1))
        if (mode) metadata.permissionMode = mode
      }
    }
  }

  if (!metadata.firstUserMessage) {
    for (const entry of entries) {
      if (entry.type === 'user' && !entry.isMeta && entry.message?.role === 'user') {
        const title = extractUserMessageTitle(entry.message.content)
        if (title) {
          metadata.firstUserMessage = title
          break
        }
      }
    }
  }

  if (!metadata.workDir) {
    const workDir = resolveWorkDirFromEntries(entries, found.projectDir)
    if (workDir) metadata.workDir = workDir
  }

  return metadata
}
