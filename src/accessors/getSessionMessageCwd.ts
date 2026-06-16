/**
 * getSessionMessageCwd — return the `cwd` recorded on a specific message.
 *
 * Defaults to the first user message (`messageIndex = 0`).
 */

import { resolveProjectsRoot } from '../internal/config.js'
import { findSessionFile } from '../internal/fileDiscovery.js'
import { readJsonlFile } from '../internal/jsonl.js'
import type { CwdAccessorOptions, SessionId } from '../types.js'

export async function getSessionMessageCwd(
  sessionId: SessionId,
  options: CwdAccessorOptions = {},
): Promise<string | null> {
  const root = resolveProjectsRoot(options.configRoot)
  const found = await findSessionFile(root, sessionId)
  if (!found) return null

  const entries = await readJsonlFile(found.filePath)

  // Find the nth user/assistant message (default 0 = first user message).
  const messageIndex = options.messageIndex ?? 0
  let count = 0
  for (const entry of entries) {
    if (entry.type !== 'user' && entry.type !== 'assistant') continue
    if (entry.isMeta) continue
    if (count === messageIndex) {
      return typeof entry.cwd === 'string' && entry.cwd.trim() ? entry.cwd : null
    }
    count += 1
  }
  return null
}
