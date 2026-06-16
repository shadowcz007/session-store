/**
 * Convert raw JSONL entries into the public {@link MessageEntry} shape.
 *
 * Vendored from cc-haha's `SessionService.entryToMessage`,
 * `entriesToMessages`, `goalLocalCommandEntryToMessage`, and
 * `resolveParentToolUseId`.
 */

import { randomUUID } from 'node:crypto'
import type { MessageEntry } from '../types.js'
import type { RawEntry } from './jsonl.js'
import {
  isGoalLocalCommandEntry,
  isTaskNotificationContent,
  isToolResultContent,
  shouldHideTranscriptEntry,
} from './entryClassification.js'

interface ContentBlock {
  type?: string
  name?: string
  id?: string
  tool_use_id?: string
  text?: string
  content?: unknown
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Single entry → MessageEntry
// ---------------------------------------------------------------------------

/**
 * Convert one raw entry into a MessageEntry. Returns `null` when the entry
 * has no message role (i.e. it's a metadata-only entry).
 */
export function entryToMessage(entry: RawEntry, parentToolUseId?: string): MessageEntry | null {
  const msg = entry.message
  if (!msg || !msg.role) return null

  let type: MessageEntry['type']
  const role = msg.role

  if (role === 'user') {
    if (Array.isArray(msg.content)) {
      const hasToolResult = (msg.content as ContentBlock[]).some(
        (block) => block && block.type === 'tool_result',
      )
      type = hasToolResult ? 'tool_result' : 'user'
    } else {
      type = 'user'
    }
  } else if (role === 'assistant') {
    if (Array.isArray(msg.content)) {
      const hasToolUse = (msg.content as ContentBlock[]).some(
        (block) => block && block.type === 'tool_use',
      )
      type = hasToolUse ? 'tool_use' : 'assistant'
    } else {
      type = 'assistant'
    }
  } else {
    type = 'system'
  }

  const message: MessageEntry = {
    id: entry.uuid || randomUUID(),
    type,
    content: msg.content,
    timestamp: entry.timestamp || new Date().toISOString(),
  }
  if (entry.toolUseResult !== undefined) message.toolUseResult = entry.toolUseResult
  if (msg.model) message.model = msg.model
  if (entry.parentUuid !== undefined && entry.parentUuid !== null) {
    message.parentUuid = entry.parentUuid
  }
  if (parentToolUseId) message.parentToolUseId = parentToolUseId
  if (entry.isSidechain !== undefined) message.isSidechain = entry.isSidechain
  return message
}

/**
 * If the entry is a goal-related local command, convert it into a synthetic
 * system message. Returns `null` otherwise.
 */
export function goalLocalCommandEntryToMessage(entry: RawEntry): MessageEntry | null {
  if (!isGoalLocalCommandEntry(entry)) return null
  const message: MessageEntry = {
    id: entry.uuid || randomUUID(),
    type: 'system',
    content: entry.content,
    timestamp: entry.timestamp || new Date().toISOString(),
  }
  if (entry.parentUuid !== undefined && entry.parentUuid !== null) {
    message.parentUuid = entry.parentUuid
  }
  if (entry.isSidechain !== undefined) message.isSidechain = entry.isSidechain
  return message
}

// ---------------------------------------------------------------------------
// Parent tool_use_id resolver
// ---------------------------------------------------------------------------

/**
 * Walk up the parentUuid chain to find the Agent tool_use_id that spawned
 * this sidechain entry, caching results along the way.
 */
export function resolveParentToolUseId(
  entry: RawEntry,
  entriesByUuid: Map<string, RawEntry>,
  cache: Map<string, string | undefined>,
): string | undefined {
  if (typeof entry.parent_tool_use_id === 'string' && entry.parent_tool_use_id.length > 0) {
    return entry.parent_tool_use_id
  }

  if (entry.isSidechain !== true) return undefined

  const cacheKey = entry.uuid
  if (cacheKey && cache.has(cacheKey)) return cache.get(cacheKey)

  let resolved: string | undefined
  let currentParentUuid =
    typeof entry.parentUuid === 'string' ? entry.parentUuid : undefined
  const visited = new Set<string>()

  while (currentParentUuid && !visited.has(currentParentUuid)) {
    visited.add(currentParentUuid)
    const parentEntry = entriesByUuid.get(currentParentUuid)
    if (!parentEntry) break

    const directAgentToolUseId = extractAgentToolUseId(parentEntry)
    if (directAgentToolUseId) {
      resolved = directAgentToolUseId
      break
    }

    if (parentEntry.uuid && cache.has(parentEntry.uuid)) {
      resolved = cache.get(parentEntry.uuid)
      break
    }

    currentParentUuid =
      typeof parentEntry.parentUuid === 'string' ? parentEntry.parentUuid : undefined
  }

  if (cacheKey) cache.set(cacheKey, resolved)
  return resolved
}

function extractAgentToolUseId(entry: RawEntry): string | undefined {
  const content = entry.message?.content
  if (!Array.isArray(content)) return undefined

  for (const block of content as ContentBlock[]) {
    if (block.type === 'tool_use' && block.name === 'Agent' && typeof block.id === 'string') {
      return block.id
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Bulk entries → messages
// ---------------------------------------------------------------------------

/**
 * Convert a full transcript into the ordered, filtered message array.
 * Filters out meta entries, internal command breadcrumbs, synthetic
 * interruptions, task notifications, and "no response requested" placeholders.
 */
export function entriesToMessages(entries: RawEntry[]): MessageEntry[] {
  const messages: MessageEntry[] = []
  const entriesByUuid = new Map<string, RawEntry>()
  const parentToolUseIdCache = new Map<string, string | undefined>()
  let suppressTaskNotificationResponse = false

  for (const entry of entries) {
    if (typeof entry.uuid === 'string' && entry.uuid.length > 0) {
      entriesByUuid.set(entry.uuid, entry)
    }
  }

  for (const entry of entries) {
    const goalLocalCommandMessage = goalLocalCommandEntryToMessage(entry)
    if (goalLocalCommandMessage) {
      messages.push(goalLocalCommandMessage)
      continue
    }

    if (!entry.message?.role) continue
    if (entry.isMeta) continue

    const isTaskNotification =
      entry.message.role === 'user' && isTaskNotificationContent(entry.message.content)
    if (isTaskNotification) {
      suppressTaskNotificationResponse = true
      continue
    }

    if (entry.message.role === 'user' && !isToolResultContent(entry.message.content)) {
      suppressTaskNotificationResponse = false
    } else if (suppressTaskNotificationResponse) {
      continue
    }

    if (shouldHideTranscriptEntry(entry)) continue

    const entryType = entry.type
    if (entryType !== 'user' && entryType !== 'assistant' && entryType !== 'system') {
      continue
    }

    const parentToolUseId = resolveParentToolUseId(entry, entriesByUuid, parentToolUseIdCache)
    const msg = entryToMessage(entry, parentToolUseId)
    if (msg) messages.push(msg)
  }
  return messages
}
