/**
 * Subagent transcript loading and Agent-tool result linking.
 *
 * Vendored from cc-haha's `SessionService.subagentTranscriptPath`,
 * `loadSubagentToolMessages`, `appendSubagentToolMessages`,
 * `extractAgentToolUseIdsFromMessage`, `extractTextFromContent`,
 * `extractAgentIdFromResultText`, `extractAgentResultLinks`,
 * `namespaceSubagentContentIds`.
 *
 * The Agent tool in Claude Code spawns sidechain sub-sessions whose
 * transcripts are stored at:
 *
 *   <projectsRoot>/<sanitizedProject>/<sessionId>/subagents/agent-<agentId>.jsonl
 *
 * `appendSubagentToolMessages` finds every Agent tool_use in the main
 * transcript, looks up the agentId in the corresponding tool_result, and
 * inlines the sidechain messages so consumers see a flat transcript.
 */

import * as path from 'node:path'
import type { AgentId, MessageEntry } from '../types.js'
import { readJsonlFile, type PersistedWorktreeSession, type RawEntry } from './jsonl.js'
import { shouldHideTranscriptEntry } from './entryClassification.js'
import { entryToMessage } from './entryToMessage.js'

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
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Absolute path to a subagent's transcript file.
 */
export function subagentTranscriptPath(
  projectsRoot: string,
  projectDir: string,
  sessionId: string,
  agentId: string,
): string {
  const normalizedAgentId = agentId.startsWith('agent-') ? agentId : `agent-${agentId}`
  return path.join(projectsRoot, projectDir, sessionId, 'subagents', `${normalizedAgentId}.jsonl`)
}

// ---------------------------------------------------------------------------
// Agent tool_use discovery
// ---------------------------------------------------------------------------

export function extractAgentToolUseIdsFromMessage(message: MessageEntry): string[] {
  if (message.type !== 'tool_use' || !Array.isArray(message.content)) return []

  return (message.content as ContentBlock[])
    .filter((block) => block.type === 'tool_use' && block.name === 'Agent')
    .flatMap((block) => (typeof block.id === 'string' ? [block.id] : []))
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return (content as ContentBlock[])
    .flatMap((block) => (typeof block.text === 'string' ? [block.text] : []))
    .join('\n')
}

function extractAgentIdFromResultText(text: string): string | undefined {
  const match = text.match(/(?:^|\n)\s*agentId:\s*([A-Za-z0-9_-]+)/)
  return match?.[1]
}

/**
 * Build a map from `tool_use_id` (of an Agent tool_use) → `agentId`
 * extracted from the matching tool_result's text content.
 */
export function extractAgentResultLinks(messages: MessageEntry[]): Map<string, string> {
  const agentToolUseIds = new Set(messages.flatMap((m) => extractAgentToolUseIdsFromMessage(m)))
  const resultLinks = new Map<string, string>()

  for (const message of messages) {
    if (message.type !== 'tool_result' || !Array.isArray(message.content)) continue

    for (const block of message.content as ContentBlock[]) {
      if (block.type !== 'tool_result' || typeof block.tool_use_id !== 'string') continue
      if (!agentToolUseIds.has(block.tool_use_id)) continue

      const agentId = extractAgentIdFromResultText(extractTextFromContent(block.content))
      if (agentId) resultLinks.set(block.tool_use_id, agentId)
    }
  }

  return resultLinks
}

// ---------------------------------------------------------------------------
// Subagent transcript namespace transform
// ---------------------------------------------------------------------------

/**
 * Prefix every tool_use.id and tool_result.tool_use_id with `<parentToolUseId>/<agentId>/`
 * so the subagent messages don't collide with the main transcript's ids.
 */
export function namespaceSubagentContentIds(content: unknown, namespace: string): unknown {
  if (!Array.isArray(content)) return content

  return (content as ContentBlock[]).map((block) => {
    if (!block || typeof block !== 'object') return block
    if (block.type === 'tool_use' && typeof block.id === 'string') {
      return { ...block, id: `${namespace}/${block.id}` }
    }
    if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
      return { ...block, tool_use_id: `${namespace}/${block.tool_use_id}` }
    }
    return block
  })
}

// ---------------------------------------------------------------------------
// Load one subagent's transcript
// ---------------------------------------------------------------------------

async function loadSubagentToolMessages(
  projectsRoot: string,
  projectDir: string,
  sessionId: string,
  parentToolUseId: string,
  agentId: string,
): Promise<MessageEntry[]> {
  const filePath = subagentTranscriptPath(projectsRoot, projectDir, sessionId, agentId)
  const entries: RawEntry[] = await readJsonlFile(filePath)
  const namespace = `${parentToolUseId}/${agentId}`
  const messages: MessageEntry[] = []

  for (const entry of entries) {
    if (!entry.message?.role || entry.isMeta) continue
    if (shouldHideTranscriptEntry(entry)) continue
    if (entry.type !== 'user' && entry.type !== 'assistant' && entry.type !== 'system') {
      continue
    }

    const namespaced: RawEntry = {
      ...entry,
      message: {
        ...entry.message,
        content: namespaceSubagentContentIds(entry.message.content, namespace),
      },
    }
    const message = entryToMessage(namespaced, parentToolUseId)
    if (message && (message.type === 'tool_use' || message.type === 'tool_result')) {
      messages.push(message)
    }
  }

  return messages
}

// ---------------------------------------------------------------------------
// Append all subagent messages to the main transcript
// ---------------------------------------------------------------------------

/**
 * Inline every Agent tool_use's sidechain messages into the main transcript.
 * No-op when the transcript did not invoke the Agent tool.
 */
export async function appendSubagentToolMessages(
  projectsRoot: string,
  projectDir: string,
  sessionId: string,
  messages: MessageEntry[],
): Promise<MessageEntry[]> {
  const resultLinks = extractAgentResultLinks(messages)
  if (resultLinks.size === 0) return messages

  const childMessages = await Promise.all(
    [...resultLinks.entries()].map(([parentToolUseId, agentId]) =>
      loadSubagentToolMessages(projectsRoot, projectDir, sessionId, parentToolUseId, agentId),
    ),
  )
  return [...messages, ...childMessages.flat()]
}

// re-export for tests
export type { PersistedWorktreeSession, AgentId }
