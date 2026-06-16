/**
 * Streaming summary extraction — walks a JSONL file once and pulls out the
 * handful of fields needed by {@link scanProjects}.
 *
 * Avoids loading the entire file into memory (large sessions can be hundreds
 * of MB) and intentionally leaves full message reconstruction to
 * {@link entriesToMessages}.
 */

import { streamJsonlEntries } from './jsonl.js'
import { cleanSessionTitleSource } from './titleText.js'
import { extractUserMessageTitle, goalCreationCommandTitle } from './titleExtraction.js'
import { normalizeDriveRootPathForPlatform } from './pathUtils.js'
import { desanitizePath } from './pathUtils.js'
import type {
  PersistedWorktreeSession,
  SessionRepositoryInfo,
} from '../types.js'

const VALID_SESSION_PERMISSION_MODES = new Set([
  'default',
  'acceptEdits',
  'plan',
  'bypassPermissions',
  'dontAsk',
])

const VALID_SESSION_EFFORT_LEVELS = new Set(['low', 'medium', 'high', 'max'])

export interface SessionListSummary {
  title: string
  createdAt: string
  messageCount: number
  workDir: string | null
  customTitle?: string
  aiTitle?: string
  firstUserMessage?: string
  permissionMode?: string
  runtimeProviderId?: string | null
  runtimeModelId?: string
  effortLevel?: string
  repository?: SessionRepositoryInfo
  worktreeSession?: PersistedWorktreeSession | null
}

/**
 * Stream-parse a JSONL file and return lightweight summary data.
 *
 * `birthtime` is used as the fallback `createdAt` when no entry carries a
 * `timestamp` field.
 */
export async function scanSessionListSummary(
  filePath: string,
  projectDir: string,
  birthtime: Date,
): Promise<SessionListSummary> {
  let createdAt = birthtime.toISOString()
  let hasCreatedAt = false
  let messageCount = 0
  let firstUserTitle: string | null = null
  let goalTitle: string | null = null
  let aiTitle: string | null = null
  let customTitle: string | null = null
  let latestWorkDir: string | null = null
  let latestCwd: string | null = null
  let permissionMode: string | undefined
  let runtimeProviderId: string | null | undefined
  let runtimeModelId: string | undefined
  let effortLevel: string | undefined
  let repository: SessionRepositoryInfo | undefined
  let worktreeSession: PersistedWorktreeSession | null | undefined

  await streamJsonlEntries(filePath, (entry) => {
    if (!entry) return

    if (!hasCreatedAt && entry.timestamp) {
      createdAt = entry.timestamp
      hasCreatedAt = true
    }

    if (
      (entry.type === 'user' || entry.type === 'assistant') &&
      entry.message?.role
    ) {
      messageCount += 1
    }

    if (entry.type === 'session-meta') {
      const record = entry as Record<string, unknown>
      if (typeof record.workDir === 'string') {
        latestWorkDir = normalizeDriveRootPathForPlatform(record.workDir)
      }
      if (
        typeof entry.permissionMode === 'string' &&
        VALID_SESSION_PERMISSION_MODES.has(entry.permissionMode)
      ) {
        permissionMode = entry.permissionMode
      }
      if (
        record.runtimeProviderId === null ||
        typeof record.runtimeProviderId === 'string'
      ) {
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

    if (typeof entry.cwd === 'string' && entry.cwd.trim()) {
      latestCwd = normalizeDriveRootPathForPlatform(entry.cwd)
    }

    const candidateRepository = (entry as Record<string, unknown>)?.repository
    if (candidateRepository && typeof candidateRepository === 'object') {
      repository = candidateRepository as SessionRepositoryInfo
    }

    if (entry.type === 'worktree-state') {
      if (entry.worktreeSession === null) {
        worktreeSession = null
      } else if (
        entry.worktreeSession &&
        typeof entry.worktreeSession === 'object' &&
        typeof entry.worktreeSession.worktreePath === 'string' &&
        typeof entry.worktreeSession.worktreeName === 'string'
      ) {
        worktreeSession = entry.worktreeSession as PersistedWorktreeSession
      }
    }

    if (entry.type === 'custom-title' && entry.customTitle) {
      customTitle = String(entry.customTitle)
    }

    if (!goalTitle) {
      goalTitle = goalCreationCommandTitle(entry)
    }

    if (entry.type === 'ai-title' && entry.aiTitle) {
      const title = cleanSessionTitleSource(String(entry.aiTitle))
      if (title) aiTitle = title
    }

    if (
      !firstUserTitle &&
      entry.type === 'user' &&
      !entry.isMeta &&
      entry.message?.role === 'user'
    ) {
      firstUserTitle = extractUserMessageTitle(entry.message.content)
    }
  })

  const summary: SessionListSummary = {
    title: customTitle || goalTitle || aiTitle || firstUserTitle || 'Untitled Session',
    createdAt,
    messageCount,
    workDir: latestWorkDir || latestCwd || desanitizePath(projectDir),
  }
  if (customTitle) summary.customTitle = customTitle
  if (aiTitle) summary.aiTitle = aiTitle
  if (firstUserTitle) summary.firstUserMessage = firstUserTitle
  if (permissionMode) summary.permissionMode = permissionMode
  if (runtimeProviderId !== undefined) summary.runtimeProviderId = runtimeProviderId
  if (runtimeModelId) summary.runtimeModelId = runtimeModelId
  if (effortLevel) summary.effortLevel = effortLevel
  if (repository) summary.repository = repository
  if (worktreeSession !== undefined) summary.worktreeSession = worktreeSession
  return summary
}
