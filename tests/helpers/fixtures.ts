/**
 * Factory functions that produce realistic JSONL entries for tests.
 */

import { randomUUID } from 'node:crypto'

export function sessionMetaEntry(opts: {
  workDir: string
  model?: string
  permissionMode?: string
}): Record<string, unknown> {
  return {
    type: 'session-meta',
    workDir: opts.workDir,
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.permissionMode ? { permissionMode: opts.permissionMode } : {}),
    timestamp: new Date().toISOString(),
  }
}

export function customTitleEntry(title: string): Record<string, unknown> {
  return { type: 'custom-title', customTitle: title, timestamp: new Date().toISOString() }
}

export function aiTitleEntry(title: string): Record<string, unknown> {
  return { type: 'ai-title', aiTitle: title, timestamp: new Date().toISOString() }
}

export function userMessageEntry(opts: {
  text: string
  uuid?: string
  parentUuid?: string | null
  cwd?: string
  isMeta?: boolean
}): Record<string, unknown> {
  return {
    type: 'user',
    isMeta: opts.isMeta ?? false,
    uuid: opts.uuid ?? randomUUID(),
    parentUuid: opts.parentUuid ?? null,
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
    message: { role: 'user', content: opts.text },
    timestamp: new Date().toISOString(),
  }
}

export function assistantMessageEntry(opts: {
  text: string
  uuid?: string
  parentUuid?: string | null
  model?: string
}): Record<string, unknown> {
  return {
    type: 'assistant',
    uuid: opts.uuid ?? randomUUID(),
    parentUuid: opts.parentUuid ?? null,
    ...(opts.model ? { message: { role: 'assistant', content: opts.text, model: opts.model } } : {
      message: { role: 'assistant', content: opts.text },
    }),
    timestamp: new Date().toISOString(),
  }
}

export function toolUseAssistantEntry(opts: {
  toolName: string
  input: Record<string, unknown>
  uuid?: string
  parentUuid?: string | null
  toolUseId?: string
  toolResultAgentId?: string
}): Record<string, unknown> {
  const toolUseId = opts.toolUseId ?? `tu_${randomUUID().slice(0, 8)}`
  return {
    type: 'assistant',
    uuid: opts.uuid ?? randomUUID(),
    parentUuid: opts.parentUuid ?? null,
    message: {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: toolUseId,
          name: opts.toolName,
          input: opts.input,
        },
      ],
    },
    timestamp: new Date().toISOString(),
  }
}

export function toolResultUserEntry(opts: {
  toolUseId: string
  content: unknown
  uuid?: string
  parentUuid?: string | null
}): Record<string, unknown> {
  return {
    type: 'user',
    uuid: opts.uuid ?? randomUUID(),
    parentUuid: opts.parentUuid ?? null,
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: opts.toolUseId,
          content: opts.content,
        },
      ],
    },
    timestamp: new Date().toISOString(),
  }
}

export function fileHistorySnapshotEntry(opts: {
  messageId?: string
  files?: Record<string, { version: number; backupFileName: string | null; backupTime?: string }>
}): Record<string, unknown> {
  return {
    type: 'file-history-snapshot',
    snapshot: {
      messageId: opts.messageId ?? randomUUID(),
      trackedFileBackups: opts.files ?? {},
      timestamp: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  }
}

export function worktreeStateEntry(opts: {
  originalCwd: string
  worktreePath: string
  worktreeName: string
  worktreeBranch?: string
}): Record<string, unknown> {
  return {
    type: 'worktree-state',
    worktreeSession: {
      originalCwd: opts.originalCwd,
      worktreePath: opts.worktreePath,
      worktreeName: opts.worktreeName,
      ...(opts.worktreeBranch ? { worktreeBranch: opts.worktreeBranch } : {}),
      sessionId: randomUUID(),
    },
    timestamp: new Date().toISOString(),
  }
}

export function taskNotificationUserEntry(opts: {
  toolUseId: string
  taskId: string
  status: 'completed' | 'failed' | 'stopped'
  summary?: string
}): Record<string, unknown> {
  const inner =
    `<task-notification>` +
    `<task-id>${opts.taskId}</task-id>` +
    `<tool-use-id>${opts.toolUseId}</tool-use-id>` +
    `<status>${opts.status}</status>` +
    (opts.summary ? `<summary>${opts.summary}</summary>` : '') +
    `</task-notification>`
  return {
    type: 'user',
    uuid: randomUUID(),
    message: { role: 'user', content: inner },
    timestamp: new Date().toISOString(),
  }
}
