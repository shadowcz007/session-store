/**
 * File discovery — locate session JSONL files under the projects root.
 *
 * Vendored from cc-haha's `SessionService.discoverSessionFiles` /
 * `findSessionFiles` / `findSessionFile` / `pathExists` / `isValidSessionId`.
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { sanitizePath } from './pathUtils.js'

const SESSION_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * True when the input looks like a UUID; used to avoid scanning non-session
 * files when resolving a session by ID.
 */
export function isValidSessionId(id: string): boolean {
  return SESSION_ID_REGEX.test(id)
}

/**
 * True when the path exists on disk (file or directory).
 */
export async function pathExists(targetPath: string | null): Promise<boolean> {
  if (!targetPath) return false
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

/**
 * Discover every `.jsonl` file under `<projectsRoot>/<sanitized>/`.
 *
 * Returns an array of `{ filePath, projectDir, sessionId }` where:
 *  - `projectDir` is the sanitized directory name (not the original absolute path)
 *  - `sessionId` is the filename without the `.jsonl` extension
 *
 * If `projectFilter` is provided, only that sanitized directory is scanned.
 */
export async function discoverSessionFiles(
  projectsRoot: string,
  projectFilter?: string,
): Promise<Array<{ filePath: string; projectDir: string; sessionId: string }>> {
  let projectDirs: string[]
  try {
    projectDirs = await fs.readdir(projectsRoot)
  } catch {
    return []
  }

  // Optionally filter to a single project (matched by sanitized name)
  if (projectFilter) {
    const sanitized = sanitizePath(projectFilter)
    projectDirs = projectDirs.filter((d) => d === sanitized)
  }

  const results: Array<{ filePath: string; projectDir: string; sessionId: string }> = []

  for (const dir of projectDirs) {
    const dirPath = path.join(projectsRoot, dir)

    try {
      const stat = await fs.stat(dirPath)
      if (!stat.isDirectory()) continue
    } catch {
      continue
    }

    let files: string[]
    try {
      files = await fs.readdir(dirPath)
    } catch {
      continue
    }

    for (const file of files) {
      // Skip non-jsonl files (including the session's sibling subagent dir)
      if (!file.endsWith('.jsonl')) continue
      const sessionId = file.replace('.jsonl', '')
      results.push({
        filePath: path.join(dirPath, file),
        projectDir: dir,
        sessionId,
      })
    }
  }

  return results
}

/**
 * Find every JSONL file matching `sessionId` across all project directories.
 * Returns them sorted by mtime descending so the most recently modified wins.
 */
export async function findSessionFiles(
  projectsRoot: string,
  sessionId: string,
): Promise<Array<{ filePath: string; projectDir: string }>> {
  if (!isValidSessionId(sessionId)) {
    return []
  }

  let projectDirs: string[]
  try {
    projectDirs = await fs.readdir(projectsRoot)
  } catch {
    return []
  }

  const matches: Array<{ filePath: string; projectDir: string; mtimeMs: number }> = []
  for (const dir of projectDirs) {
    const filePath = path.join(projectsRoot, dir, `${sessionId}.jsonl`)
    try {
      const stat = await fs.stat(filePath)
      matches.push({ filePath, projectDir: dir, mtimeMs: stat.mtimeMs })
    } catch {
      continue
    }
  }

  return matches
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map(({ filePath, projectDir }) => ({ filePath, projectDir }))
}

/**
 * Find the most recently modified JSONL file for a given sessionId, or null.
 */
export async function findSessionFile(
  projectsRoot: string,
  sessionId: string,
): Promise<{ filePath: string; projectDir: string } | null> {
  const matches = await findSessionFiles(projectsRoot, sessionId)
  return matches[0] ?? null
}
