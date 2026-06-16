/**
 * Entry-level resolvers — walk raw entries backwards to find workDir,
 * permissionMode, worktree, repository, project root, message count.
 *
 * Vendored from cc-haha's `SessionService.resolveWorkDirFromEntries`,
 * `resolveRepositoryFromEntries`, `resolvePermissionModeFromEntries`,
 * `resolveWorktreeSessionFromEntries`, `resolveProjectRootFromEntries`,
 * `resolveProjectRootFromSessionMetadata`, `canonicalizeProjectPath`,
 * `countTranscriptMessages`.
 *
 * Pure: no I/O except the optional `findGitRoot` callback.
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { FindGitRoot, PersistedWorktreeSession, SessionRepositoryInfo } from '../types.js'
import type { RawEntry } from './jsonl.js'
import {
  desanitizePath,
  normalizeDriveRootPathForPlatform,
} from './pathUtils.js'

const VALID_SESSION_PERMISSION_MODES = new Set([
  'default',
  'acceptEdits',
  'plan',
  'bypassPermissions',
  'dontAsk',
])

export function resolveWorkDirFromEntries(
  entries: RawEntry[],
  fallbackProjectDir?: string,
): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]
    if (
      entry &&
      entry.type === 'session-meta' &&
      typeof (entry as Record<string, unknown>).workDir === 'string'
    ) {
      return normalizeDriveRootPathForPlatform(
        (entry as Record<string, unknown>).workDir as string,
      )
    }
  }

  for (let i = entries.length - 1; i >= 0; i--) {
    const cwd = entries[i]?.cwd
    if (typeof cwd === 'string' && cwd.trim()) {
      return normalizeDriveRootPathForPlatform(cwd)
    }
  }

  return fallbackProjectDir ? desanitizePath(fallbackProjectDir) : null
}

export function resolveRepositoryFromEntries(
  entries: RawEntry[],
): SessionRepositoryInfo | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const repository = (entries[i] as Record<string, unknown>)?.repository
    if (repository && typeof repository === 'object') {
      return repository as SessionRepositoryInfo
    }
  }
  return undefined
}

export function resolvePermissionModeFromEntries(entries: RawEntry[]): string | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]
    if (entry?.type !== 'session-meta') continue
    const permissionMode = entry.permissionMode
    if (
      typeof permissionMode === 'string' &&
      VALID_SESSION_PERMISSION_MODES.has(permissionMode)
    ) {
      return permissionMode
    }
  }
  return undefined
}

export function resolveWorktreeSessionFromEntries(
  entries: RawEntry[],
): PersistedWorktreeSession | null | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]
    if (entry?.type !== 'worktree-state') continue

    const worktreeSession = entry.worktreeSession
    if (worktreeSession === null) return null
    if (
      worktreeSession &&
      typeof worktreeSession === 'object' &&
      typeof (worktreeSession as PersistedWorktreeSession).worktreePath === 'string' &&
      typeof (worktreeSession as PersistedWorktreeSession).worktreeName === 'string'
    ) {
      return worktreeSession as PersistedWorktreeSession
    }
  }
  return undefined
}

export function resolveProjectRootFromEntries(
  entries: RawEntry[],
  workDir: string | null,
  fallbackProjectDir?: string,
  findGitRoot?: FindGitRoot,
): Promise<string | null> {
  const worktreeSession = resolveWorktreeSessionFromEntries(entries)
  const repository = resolveRepositoryFromEntries(entries)
  return resolveProjectRootFromSessionMetadata(
    { worktreeSession, repository, workDir, fallbackProjectDir },
    findGitRoot,
  )
}

async function resolveProjectRootFromSessionMetadata(
  params: {
    worktreeSession?: PersistedWorktreeSession | null
    repository?: SessionRepositoryInfo
    workDir: string | null
    fallbackProjectDir?: string
  },
  findGitRoot?: FindGitRoot,
): Promise<string | null> {
  const { worktreeSession, repository, workDir, fallbackProjectDir } = params

  const candidate =
    worktreeSession?.originalCwd ||
    repository?.repoRoot ||
    workDir ||
    (fallbackProjectDir ? desanitizePath(fallbackProjectDir) : null)

  if (!candidate) return null

  const canonicalCandidate = await canonicalizeProjectPath(candidate)

  // Prefer git root when available; the caller can opt out by not supplying
  // findGitRoot (in which case we fall through to the canonical path).
  if (findGitRoot) {
    const gitRoot = await findGitRoot(canonicalCandidate)
    if (gitRoot) return gitRoot
  }

  if (workDir) {
    const marker = `${path.sep}.claude${path.sep}worktrees${path.sep}`
    const markerIndex = canonicalCandidate.indexOf(marker)
    if (markerIndex > 0) return canonicalCandidate.slice(0, markerIndex)
  }

  return canonicalCandidate
}

async function canonicalizeProjectPath(projectPath: string): Promise<string> {
  try {
    return normalizeDriveRootPathForPlatform(await fs.realpath(projectPath)).normalize('NFC')
  } catch {
    return projectPath.normalize('NFC')
  }
}

export function countTranscriptMessages(entries: RawEntry[]): number {
  return entries.filter(
    (entry) =>
      !entry.isMeta &&
      !!entry.message?.role &&
      (entry.type === 'user' || entry.type === 'assistant' || entry.type === 'system'),
  ).length
}
