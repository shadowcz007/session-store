/**
 * Test helper: write a JSONL session file under the tmp config root.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sanitizePath } from '../../src/internal/pathUtils.js'

export interface WriteSessionFileOptions {
  /** Absolute path of the project (will be sanitized for the folder name). */
  projectPath: string
  sessionId: string
  entries: unknown[]
}

/**
 * Writes a JSONL file at `<root>/projects/<sanitized-project>/<sessionId>.jsonl`.
 * Creates intermediate directories as needed. Returns the absolute file path.
 */
export function writeSessionFile(
  root: string,
  options: WriteSessionFileOptions,
): string {
  const sanitized = sanitizePath(options.projectPath)
  const dir = join(root, 'projects', sanitized)
  mkdirSync(dir, { recursive: true })
  const filePath = join(dir, `${options.sessionId}.jsonl`)
  writeFileSync(filePath, options.entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf-8')
  return filePath
}

/**
 * Write a subagent transcript file at
 * `<root>/projects/<sanitized>/<sessionId>/subagents/agent-<id>.jsonl`.
 */
export function writeSubagentFile(
  root: string,
  options: WriteSessionFileOptions & { agentId: string },
): string {
  const sanitized = sanitizePath(options.projectPath)
  const dir = join(root, 'projects', sanitized, options.sessionId, 'subagents')
  mkdirSync(dir, { recursive: true })
  const normalizedAgentId = options.agentId.startsWith('agent-')
    ? options.agentId
    : `agent-${options.agentId}`
  const filePath = join(dir, `${normalizedAgentId}.jsonl`)
  writeFileSync(filePath, options.entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf-8')
  return filePath
}
