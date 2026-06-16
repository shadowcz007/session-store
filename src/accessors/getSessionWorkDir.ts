/**
 * getSessionWorkDir — return the working directory a session was launched in.
 *
 * Walks entries backwards to find the latest `session-meta.workDir`, falling
 * back to the latest non-empty `entry.cwd`, then to the desanitized project
 * directory.
 */

import { resolveProjectsRoot } from '../internal/config.js'
import { findSessionFile } from '../internal/fileDiscovery.js'
import { readJsonlFile } from '../internal/jsonl.js'
import { resolveWorkDirFromEntries } from '../internal/resolve.js'
import type { AccessorOptions, SessionId } from '../types.js'

export async function getSessionWorkDir(
  sessionId: SessionId,
  options: AccessorOptions = {},
): Promise<string | null> {
  const root = resolveProjectsRoot(options.configRoot)
  const found = await findSessionFile(root, sessionId)
  if (!found) return null

  const entries = await readJsonlFile(found.filePath)
  return resolveWorkDirFromEntries(entries, found.projectDir)
}
