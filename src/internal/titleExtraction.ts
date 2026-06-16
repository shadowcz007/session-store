/**
 * Title extraction helpers, vendored from cc-haha's `SessionService.extractTitle`,
 * `extractUserMessageTitle`, and `goalCreationCommandTitle`.
 *
 * Pure functions over an array of raw entries; no I/O.
 */

import type { RawEntry } from './jsonl.js'
import { cleanSessionTitleSource } from './titleText.js'
import { readXmlTag } from './entryClassification.js'

const TITLE_MAX_LENGTH = 80

function truncate(text: string): string {
  return text.length > TITLE_MAX_LENGTH ? `${text.slice(0, TITLE_MAX_LENGTH)}...` : text
}

function firstTextBlock(content: unknown): string | undefined {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return undefined
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const record = block as Record<string, unknown>
    if (record.type === 'text' && typeof record.text === 'string') {
      return record.text
    }
  }
  return undefined
}

/**
 * Title priority:
 *  1. `custom-title` (user rename)
 *  2. `/goal` command title
 *  3. `ai-title` (LLM-generated)
 *  4. First non-meta user message, cleaned and truncated
 *  5. "Untitled Session"
 */
export function extractTitle(entries: RawEntry[]): string {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e && e.type === 'custom-title' && e.customTitle) {
      return e.customTitle
    }
  }

  for (const e of entries) {
    const goalTitle = goalCreationCommandTitle(e)
    if (goalTitle) return goalTitle
  }

  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e && e.type === 'ai-title' && e.aiTitle) {
      const title = cleanSessionTitleSource(String(e.aiTitle))
      if (title) return title
    }
  }

  for (const e of entries) {
    if (e.type === 'user' && !e.isMeta && e.message?.role === 'user') {
      const text = firstTextBlock(e.message.content)
      if (text) {
        const title = cleanSessionTitleSource(text)
        if (title) return truncate(title)
      }
    }
  }

  return 'Untitled Session'
}

/**
 * Return the cleaned, truncated title for a single user message, or `null`
 * if the content has no extractable text.
 */
export function extractUserMessageTitle(content: unknown): string | null {
  const text = firstTextBlock(content)
  if (!text) return null

  const title = cleanSessionTitleSource(text)
  if (!title) return null
  return truncate(title)
}

/**
 * If the entry is a `/goal ...` local command, return a stable title from the
 * command arguments. Otherwise `null`.
 */
export function goalCreationCommandTitle(entry: RawEntry): string | null {
  if (entry.type !== 'system' || entry.subtype !== 'local_command') {
    return null
  }
  if (typeof entry.content !== 'string') return null

  const commandName = readXmlTag(entry.content, 'command-name')?.replace(/^\//, '')
  if (commandName !== 'goal') return null

  const args = readXmlTag(entry.content, 'command-args')?.trim()
  if (!args || /^clear\b/i.test(args)) return null

  const title = cleanSessionTitleSource(`/goal ${args}`)
  return title ? truncate(title) : null
}
