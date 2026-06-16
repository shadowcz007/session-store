/**
 * getSessionLaunchInfo — aggregate launch-time metadata for a session.
 *
 * Reads `session-meta`, `worktree-state`, and `custom-title` entries. Returns
 * `null` if the session file is missing.
 */

import * as os from 'node:os'
import { resolveProjectsRoot } from '../internal/config.js'
import { findSessionFile } from '../internal/fileDiscovery.js'
import { readJsonlFile, type RawEntry } from '../internal/jsonl.js'
import {
  countTranscriptMessages,
  resolvePermissionModeFromEntries,
  resolveRepositoryFromEntries,
  resolveWorkDirFromEntries,
  resolveWorktreeSessionFromEntries,
} from '../internal/resolve.js'
import type { AccessorOptions, SessionId, SessionLaunchInfo } from '../types.js'

const VALID_SESSION_EFFORT_LEVELS = new Set(['low', 'medium', 'high', 'max'])

export async function getSessionLaunchInfo(
  sessionId: SessionId,
  options: AccessorOptions = {},
): Promise<SessionLaunchInfo | null> {
  const root = resolveProjectsRoot(options.configRoot)
  const found = await findSessionFile(root, sessionId)
  if (!found) return null

  const entries: RawEntry[] = await readJsonlFile(found.filePath)

  const workDir = resolveWorkDirFromEntries(entries, found.projectDir) || os.homedir()
  const repository = resolveRepositoryFromEntries(entries)
  const worktreeSession = resolveWorktreeSessionFromEntries(entries)
  const permissionMode = resolvePermissionModeFromEntries(entries)

  let customTitle: string | null = null
  let runtimeProviderId: string | null | undefined
  let runtimeModelId: string | undefined
  let effortLevel: string | undefined

  for (const entry of entries) {
    if (entry.type === 'custom-title' && typeof entry.customTitle === 'string') {
      customTitle = entry.customTitle
    }
    if (entry.type === 'session-meta') {
      const record = entry as Record<string, unknown>
      if (record.runtimeProviderId === null || typeof record.runtimeProviderId === 'string') {
        runtimeProviderId = record.runtimeProviderId as string | null
      }
      if (typeof record.runtimeModelId === 'string') {
        runtimeModelId = record.runtimeModelId
      }
      if (
        typeof record.effortLevel === 'string' &&
        VALID_SESSION_EFFORT_LEVELS.has(record.effortLevel)
      ) {
        effortLevel = record.effortLevel
      }
    }
  }

  const info: SessionLaunchInfo = {
    filePath: found.filePath,
    projectDir: found.projectDir,
    workDir,
    transcriptMessageCount: countTranscriptMessages(entries),
    customTitle,
  }
  if (repository) info.repository = repository
  if (worktreeSession !== undefined) info.worktreeSession = worktreeSession
  if (permissionMode) info.permissionMode = permissionMode
  if (runtimeProviderId !== undefined) info.runtimeProviderId = runtimeProviderId
  if (runtimeModelId) info.runtimeModelId = runtimeModelId
  if (effortLevel) info.effortLevel = effortLevel
  return info
}
