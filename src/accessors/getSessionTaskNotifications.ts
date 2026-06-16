/**
 * getSessionTaskNotifications — every parsed task-notification tool result
 * embedded in a session.
 */

import { resolveProjectsRoot } from '../internal/config.js'
import { findSessionFile } from '../internal/fileDiscovery.js'
import { readJsonlFile } from '../internal/jsonl.js'
import { parseTaskNotificationContent } from '../internal/entryClassification.js'
import type { ScanFileHistoryOptions, SessionId, TaskNotification } from '../types.js'

export async function getSessionTaskNotifications(
  sessionId: SessionId,
  options: ScanFileHistoryOptions = {},
): Promise<TaskNotification[]> {
  const root = resolveProjectsRoot(options.configRoot)
  const found = await findSessionFile(root, sessionId)
  if (!found) return []

  const entries = await readJsonlFile(found.filePath)
  const notifications: TaskNotification[] = []
  for (const entry of entries) {
    if (entry.message?.role !== 'user') continue
    const notification = parseTaskNotificationContent(entry.message.content, entry.timestamp)
    if (notification) notifications.push(notification)
  }
  return notifications
}
