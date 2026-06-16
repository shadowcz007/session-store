/**
 * Entry classification helpers — decide whether a raw entry should be hidden
 * from the public transcript, and detect goal / task-notification local
 * commands.
 *
 * Vendored from cc-haha's `SessionService.shouldHideTranscriptEntry`,
 * `isInternalCommandBreadcrumb`, `isSyntheticUserInterruption`,
 * `isSyntheticNoResponseAssistant`, `isToolResultContent`,
 * `isTaskNotificationContent`, `extractTaskNotificationXml`, `parseTaskNotificationContent`,
 * and helpers used by the title extractor.
 */

import type { RawEntry } from './jsonl.js'
import type { TaskNotification } from '../types.js'

const USER_INTERRUPTION_TEXTS = new Set([
  '[Request interrupted by user]',
  '[Request interrupted by user for tool use]',
])

const NO_RESPONSE_REQUESTED_TEXT = 'No response requested.'
const TASK_NOTIFICATION_RE = /^<task-notification>\s*[\s\S]*<\/task-notification>$/i
const TASK_NOTIFICATION_BLOCK_RE = /<task-notification>\s*[\s\S]*?<\/task-notification>/i

const VALID_STATUSES = new Set(['completed', 'failed', 'stopped'])

// ---------------------------------------------------------------------------
// Low-level content helpers
// ---------------------------------------------------------------------------

export function readXmlTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return match?.[1] ? decodeXmlText(match[1].trim()) : undefined
}

function decodeXmlText(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * Pull the trimmed text blocks out of a message content. Supports both plain
 * string content and structured `[{type:'text', text:'...'}]` blocks.
 */
export function extractTextBlocks(content: unknown): string[] {
  if (typeof content === 'string') return [content]
  if (!Array.isArray(content)) return []

  return content
    .flatMap((block) => {
      if (!block || typeof block !== 'object') return []
      const record = block as Record<string, unknown>
      return record.type === 'text' && typeof record.text === 'string'
        ? [record.text as string]
        : []
    })
    .map((text) => text.trim())
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// Classification predicates
// ---------------------------------------------------------------------------

export function isInternalCommandBreadcrumb(content: unknown): boolean {
  if (typeof content !== 'string') return false

  return (
    content.includes('<command-name>') ||
    content.includes('<command-message>') ||
    content.includes('<command-args>') ||
    content.includes('<local-command-caveat>')
  )
}

export function isSyntheticUserInterruption(content: unknown): boolean {
  const textBlocks = extractTextBlocks(content)
  return textBlocks.length > 0 && textBlocks.every((text) => USER_INTERRUPTION_TEXTS.has(text))
}

export function isSyntheticNoResponseAssistant(content: unknown): boolean {
  const textBlocks = extractTextBlocks(content)
  return textBlocks.length > 0 && textBlocks.every((text) => text === NO_RESPONSE_REQUESTED_TEXT)
}

export function isToolResultContent(content: unknown): boolean {
  return (
    Array.isArray(content) &&
    content.some(
      (block) =>
        block &&
        typeof block === 'object' &&
        (block as Record<string, unknown>).type === 'tool_result',
    )
  )
}

export function isTaskNotificationContent(content: unknown): boolean {
  const textBlocks = extractTextBlocks(content)
  return textBlocks.length > 0 && textBlocks.every((text) => extractTaskNotificationXml(text) !== null)
}

function extractTaskNotificationXml(text: string): string | null {
  const trimmed = text.trim()
  if (TASK_NOTIFICATION_RE.test(trimmed)) return trimmed
  return trimmed.match(TASK_NOTIFICATION_BLOCK_RE)?.[0] ?? null
}

// ---------------------------------------------------------------------------
// Task notification parser
// ---------------------------------------------------------------------------

/**
 * Parse a task-notification tool result content into a structured
 * {@link TaskNotification}. Returns `null` when the content does not match.
 */
export function parseTaskNotificationContent(
  content: unknown,
  timestamp?: string,
): TaskNotification | null {
  const xml = extractTextBlocks(content)
    .map((text) => extractTaskNotificationXml(text))
    .find((value): value is string => value !== null)
  if (!xml) return null

  const toolUseId = readXmlTag(xml, 'tool-use-id')
  const status = readXmlTag(xml, 'status')
  if (!toolUseId || !status || !VALID_STATUSES.has(status)) {
    return null
  }

  const taskId = readXmlTag(xml, 'task-id') || toolUseId
  const summary = readXmlTag(xml, 'summary')
  const result = readXmlTag(xml, 'result')
  const outputFile = readXmlTag(xml, 'output-file')

  const notification: TaskNotification = {
    taskId,
    toolUseId,
    status: status as TaskNotification['status'],
  }
  if (summary) notification.summary = summary
  if (result) notification.result = result
  if (outputFile) notification.outputFile = outputFile
  if (timestamp) notification.timestamp = timestamp
  return notification
}

// ---------------------------------------------------------------------------
// shouldHideTranscriptEntry
// ---------------------------------------------------------------------------

/**
 * True when the entry should be filtered out of the public transcript view.
 * Hides:
 *  - internal command breadcrumbs (`<command-name>` etc.)
 *  - synthetic `[Request interrupted by user]` placeholders
 *  - task-notification tool results
 *  - assistant "No response requested." placeholders
 */
export function shouldHideTranscriptEntry(entry: RawEntry): boolean {
  const role = entry.message?.role
  const content = entry.message?.content

  if (role === 'user') {
    return (
      isInternalCommandBreadcrumb(content) ||
      isSyntheticUserInterruption(content) ||
      isTaskNotificationContent(content)
    )
  }

  if (role === 'assistant') {
    return isSyntheticNoResponseAssistant(content)
  }

  return false
}

// ---------------------------------------------------------------------------
// Goal local command detection (used by messages and titles)
// ---------------------------------------------------------------------------

function isGoalLocalCommandOutput(output: string): boolean {
  const trimmed = output.trim()
  return (
    trimmed.startsWith('Goal set:') ||
    trimmed.startsWith('Goal cleared:') ||
    trimmed === 'Goal cleared.' ||
    trimmed === 'Goal marked complete.' ||
    trimmed === 'No active goal.'
  )
}

export function isGoalLocalCommandEntry(entry: RawEntry): boolean {
  if (
    entry.type !== 'system' ||
    entry.subtype !== 'local_command' ||
    typeof entry.content !== 'string'
  ) {
    return false
  }

  const commandName = readXmlTag(entry.content, 'command-name')?.replace(/^\//, '')
  if (commandName) return commandName === 'goal'

  const output =
    readXmlTag(entry.content, 'local-command-stdout') ??
    readXmlTag(entry.content, 'local-command-stderr')
  return output ? isGoalLocalCommandOutput(output) : false
}
