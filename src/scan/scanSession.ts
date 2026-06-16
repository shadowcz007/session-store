/**
 * scanSession — full session payload including messages and file-history
 * snapshots, optionally with subagent messages inlined.
 */

import * as fs from 'node:fs/promises'
import { resolveProjectsRoot } from '../internal/config.js'
import { findSessionFile } from '../internal/fileDiscovery.js'
import { readJsonlFile } from '../internal/jsonl.js'
import { scanSessionListSummary } from '../internal/summary.js'
import { entriesToMessages } from '../internal/entryToMessage.js'
import { appendSubagentToolMessages } from '../internal/subagents.js'
import {
  desanitizePath,
  normalizeDriveRootPathForPlatform,
} from '../internal/pathUtils.js'
import {
  resolvePermissionModeFromEntries,
  resolveRepositoryFromEntries,
  resolveWorkDirFromEntries,
  resolveWorktreeSessionFromEntries,
  resolveProjectRootFromEntries,
} from '../internal/resolve.js'
import { extractTitle } from '../internal/titleExtraction.js'
import type {
  FileHistorySnapshot,
  MessageEntry,
  ScanSessionOptions,
  SessionDetail,
  SessionId,
  SessionLaunchInfo,
} from '../types.js'

/**
 * Read one session in full. Returns `null` if the session file is missing.
 *
 * By default this:
 *   - streams the JSONL once for metadata + message count
 *   - reads the file again for full messages
 *   - inlines Agent/Task tool_use messages from `subagents/*.jsonl`
 *
 * Pass `includeSubagentMessages: false` to skip the subagent read.
 */
export async function scanSession(
  sessionId: SessionId,
  options: ScanSessionOptions = {},
): Promise<SessionDetail | null> {
  const root = resolveProjectsRoot(options.configRoot)
  const includeSubagentMessages = options.includeSubagentMessages !== false

  const found = await findSessionFile(root, sessionId)
  if (!found) return null

  const { filePath, projectDir } = found
  const stat = await fs.stat(filePath)

  const summary = await scanSessionListSummary(filePath, projectDir, stat.birthtime)
  const entries = await readJsonlFile(filePath)
  const messages = entriesToMessages(entries)

  let finalMessages: MessageEntry[] = messages
  if (includeSubagentMessages) {
    finalMessages = await appendSubagentToolMessages(root, projectDir, sessionId, messages)
  }

  const snapshots = extractFileHistorySnapshots(entries)
  const workDir = resolveWorkDirFromEntries(entries, projectDir)
  const workDirExists = workDir ? await pathExists(workDir) : false

  let gitRoot: string | undefined
  if (options.findGitRoot && workDir) {
    try {
      const resolved = await options.findGitRoot(workDir)
      if (resolved) gitRoot = resolved
    } catch {
      // swallow
    }
  }
  if (!gitRoot && workDir) {
    const resolved = await resolveProjectRootFromEntries(
      entries,
      workDir,
      projectDir,
      undefined,
    )
    if (resolved) gitRoot = resolved
  }

  const launchInfo: SessionLaunchInfo = {
    filePath,
    projectDir,
    workDir: workDir ?? '',
    transcriptMessageCount: messages.length,
    customTitle: summary.customTitle ?? null,
    ...(summary.permissionMode ? { permissionMode: summary.permissionMode } : {}),
    ...(summary.runtimeProviderId !== undefined
      ? { runtimeProviderId: summary.runtimeProviderId }
      : {}),
    ...(summary.runtimeModelId ? { runtimeModelId: summary.runtimeModelId } : {}),
    ...(summary.effortLevel ? { effortLevel: summary.effortLevel } : {}),
  }
  if (summary.repository) launchInfo.repository = summary.repository
  if (summary.worktreeSession !== undefined) {
    launchInfo.worktreeSession = summary.worktreeSession
  }

  const sanitizedProjectPath = projectDir as SessionDetail['sanitizedProjectPath']
  const projectPath = workDir ?? desanitizePath(projectDir)

  const detail: SessionDetail = {
    id: sessionId,
    sanitizedProjectPath,
    projectPath,
    title: summary.title,
    createdAt: summary.createdAt,
    modifiedAt: stat.mtime.toISOString(),
    messageCount: summary.messageCount,
    sizeBytes: stat.size,
    workDirExists,
    messages: finalMessages,
    fileHistorySnapshots: snapshots,
    launchInfo,
  }
  if (summary.customTitle) detail.customTitle = summary.customTitle
  if (summary.aiTitle) detail.aiTitle = summary.aiTitle
  if (summary.firstUserMessage) detail.firstUserMessage = summary.firstUserMessage
  if (gitRoot) detail.gitRoot = gitRoot
  if (summary.worktreeSession !== undefined) {
    detail.worktreeSession = summary.worktreeSession ?? undefined
  }
  if (summary.permissionMode) detail.permissionMode = summary.permissionMode
  return detail
}

// ---------------------------------------------------------------------------
// File history snapshot extraction (from raw entries, no full-message work)
// ---------------------------------------------------------------------------

function extractFileHistorySnapshots(
  entries: import('../internal/jsonl.js').RawEntry[],
): FileHistorySnapshot[] {
  const snapshots: FileHistorySnapshot[] = []
  for (const entry of entries) {
    if (entry.type !== 'file-history-snapshot') continue
    const snap = entry.snapshot
    if (!snap) continue
    const snapshot: FileHistorySnapshot = {
      messageId: typeof snap.messageId === 'string' ? snap.messageId : '',
      trackedFileBackups: (snap.trackedFileBackups as Record<string, FileHistorySnapshot['trackedFileBackups'][string]>) ?? {},
      timestamp: typeof snap.timestamp === 'string' ? snap.timestamp : entry.timestamp ?? new Date().toISOString(),
    }
    snapshots.push(snapshot)
  }
  return snapshots
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

// Re-exports kept for advanced consumers
export { resolvePermissionModeFromEntries, resolveRepositoryFromEntries }
export { resolveWorkDirFromEntries, resolveWorktreeSessionFromEntries }
export { extractTitle, normalizeDriveRootPathForPlatform }
