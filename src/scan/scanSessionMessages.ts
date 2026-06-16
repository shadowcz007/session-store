/**
 * scanSessionMessages — return only the messages array for a session.
 */

import { resolveProjectsRoot } from '../internal/config.js'
import { findSessionFile } from '../internal/fileDiscovery.js'
import { readJsonlFile } from '../internal/jsonl.js'
import { entriesToMessages } from '../internal/entryToMessage.js'
import { appendSubagentToolMessages } from '../internal/subagents.js'
import type { MessageEntry, ScanMessagesOptions, SessionId } from '../types.js'

export async function scanSessionMessages(
  sessionId: SessionId,
  options: ScanMessagesOptions = {},
): Promise<MessageEntry[] | null> {
  const root = resolveProjectsRoot(options.configRoot)
  const includeSubagentMessages = options.includeSubagentMessages !== false

  const found = await findSessionFile(root, sessionId)
  if (!found) return null

  const entries = await readJsonlFile(found.filePath)
  const messages = entriesToMessages(entries)

  if (!includeSubagentMessages) return messages
  return appendSubagentToolMessages(root, found.projectDir, sessionId, messages)
}
