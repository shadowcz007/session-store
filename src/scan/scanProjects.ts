/**
 * scanProjects — list every session in every project under the config root.
 *
 * Lightweight: streams each JSONL file once to extract title/messageCount/
 * workDir. Cached in-memory for 5s; pass `useCache: false` to bypass.
 */

import * as fs from 'node:fs/promises'
import { resolveProjectsRoot } from '../internal/config.js'
import {
  clearSessionStoreCache,
  getCachedProjects,
  makeProjectsCacheKey,
  setCachedProjects,
} from '../internal/cache.js'
import { desanitizePath, sanitizePath } from '../internal/pathUtils.js'
import { discoverSessionFiles } from '../internal/fileDiscovery.js'
import { scanSessionListSummary } from '../internal/summary.js'
import type { SessionListItem, ScanProjectsOptions } from '../types.js'

/**
 * Lightweight list of every session on disk.
 *
 * Results are sorted newest-first (by file mtime). The 5s TTL cache is keyed
 * by `(configRoot, optionsKey)` so different `findGitRoot` callbacks won't
 * poison each other's results.
 */
export async function scanProjects(
  configRoot?: string,
  options: ScanProjectsOptions = {},
): Promise<SessionListItem[]> {
  const root = resolveProjectsRoot(configRoot)
  const optionsKey = options.findGitRoot ? 'git-root' : 'no-git-root'
  const cacheKey = makeProjectsCacheKey(root, optionsKey)
  const useCache = options.useCache !== false

  if (useCache) {
    const cached = getCachedProjects<SessionListItem[]>(cacheKey)
    if (cached) return cached
  }

  const sessionFiles = await discoverSessionFiles(root)

  const filesWithStats = (
    await Promise.all(
      sessionFiles.map(async (sessionFile) => {
        try {
          return { ...sessionFile, stat: await fs.stat(sessionFile.filePath) }
        } catch {
          return null
        }
      }),
    )
  ).filter((item): item is NonNullable<typeof item> => item !== null)

  filesWithStats.sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime())

  const items: SessionListItem[] = []
  for (const { filePath, projectDir, sessionId, stat } of filesWithStats) {
    try {
      const summary = await scanSessionListSummary(filePath, projectDir, stat.birthtime)
      const workDir = summary.workDir
      const workDirExists = workDir ? await pathExists(workDir) : false
      const projectPath = workDir ?? desanitizePath(projectDir)
      const sanitizedProjectPath = projectDir as SessionListItem['sanitizedProjectPath']

      let gitRoot: string | undefined
      if (options.findGitRoot && workDir) {
        try {
          const root = await options.findGitRoot(workDir)
          if (root) gitRoot = root
        } catch {
          // swallow — findGitRoot failures must never break the list
        }
      }

      const item: SessionListItem = {
        id: sessionId as SessionListItem['id'],
        sanitizedProjectPath,
        projectPath,
        title: summary.title,
        createdAt: summary.createdAt,
        modifiedAt: stat.mtime.toISOString(),
        messageCount: summary.messageCount,
        sizeBytes: stat.size,
        workDirExists,
      }
      if (summary.customTitle) item.customTitle = summary.customTitle
      if (summary.aiTitle) item.aiTitle = summary.aiTitle
      if (summary.firstUserMessage) item.firstUserMessage = summary.firstUserMessage
      if (gitRoot) item.gitRoot = gitRoot
      if (summary.worktreeSession !== undefined) {
        item.worktreeSession = summary.worktreeSession ?? undefined
      }
      if (summary.permissionMode) item.permissionMode = summary.permissionMode

      items.push(item)
    } catch {
      // Skip unreadable files
    }
  }

  if (useCache) setCachedProjects(cacheKey, items)
  return items
}

/** Re-exported for callers that want to wipe the cache after writes. */
export { clearSessionStoreCache }

/** Re-exported so consumers can build absolute project paths without leaking internals. */
export { sanitizePath }

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}
