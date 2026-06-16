/**
 * Public type surface for `@claude-code-local/session-store`.
 *
 * All consumers should import from `index.ts` rather than this file directly
 * (the barrel may add or remove exports without breaking internal callers).
 */

// ---------------------------------------------------------------------------
// Branded primitives
// ---------------------------------------------------------------------------

declare const __sessionIdBrand: unique symbol
declare const __agentIdBrand: unique symbol
declare const __sanitizedPathBrand: unique symbol

/** A UUID-shaped session ID. Always lower-case kebab hex. */
export type SessionId = string & { readonly [__sessionIdBrand]: 'SessionId' }

/** An Agent/Task tool subagent ID, e.g. `agent-abc123def`. */
export type AgentId = string & { readonly [__agentIdBrand]: 'AgentId' }

/**
 * A path that has been run through {@link sanitizePath}. The leading hyphen
 * on POSIX paths (`--Users-foo`) and doubled drive letters on Windows
 * (`C--Users-foo`) are intentional.
 */
export type SanitizedPath = string & { readonly [__sanitizedPathBrand]: 'SanitizedPath' }

// ---------------------------------------------------------------------------
// Persisted worktree session
// ---------------------------------------------------------------------------

/**
 * Worktree session metadata persisted in `worktree-state` JSONL entries.
 * When the worktree was torn down, `null` is recorded instead of an object.
 */
export interface PersistedWorktreeSession {
  originalCwd: string
  worktreePath: string
  worktreeName: string
  worktreeBranch?: string
  originalBranch?: string
  originalHeadCommit?: string
  sessionId: string
  tmuxSessionName?: string
  hookBased?: boolean
}

// ---------------------------------------------------------------------------
// File history snapshots
// ---------------------------------------------------------------------------

export interface FileHistoryBackup {
  /** Absolute path of the backup file on disk, or `null` if the file did not exist in this version. */
  backupFileName: string | null
  version: number
  backupTime: string
}

export interface FileHistorySnapshot {
  /** Message ID associated with this snapshot. */
  messageId: string
  trackedFileBackups: Record<string, FileHistoryBackup>
  timestamp: string
}

// ---------------------------------------------------------------------------
// Session list / detail types
// ---------------------------------------------------------------------------

/**
 * Lightweight summary returned by {@link scanProjects}.
 * Designed for the sidebar list view — does not include full messages.
 */
export interface SessionListItem {
  id: SessionId
  /** Sanitized project directory name (matches the on-disk folder name). */
  sanitizedProjectPath: SanitizedPath
  /** Best-effort desanitized absolute project path; `null` when ambiguous. */
  projectPath: string | null
  /** Session title (customTitle > goal > ai > firstUser; "Untitled Session" fallback). */
  title: string
  /** First timestamp found in the transcript; falls back to file birthtime. */
  createdAt: string
  /** File mtime. */
  modifiedAt: string
  /** Number of user/assistant/system messages in the transcript. */
  messageCount: number
  /** On-disk size in bytes. */
  sizeBytes: number
  /** Optional user-set title (distinct from AI-generated). */
  customTitle?: string
  /** Optional AI-generated title. */
  aiTitle?: string
  /** First non-meta user message text, truncated to 80 chars. */
  firstUserMessage?: string
  /** Git root of the working directory, if `findGitRoot` was provided. */
  gitRoot?: string
  /** Worktree metadata if the session ran inside an isolated worktree. */
  worktreeSession?: PersistedWorktreeSession
  /** Effective permission mode for the session. */
  permissionMode?: string
  /** True if the session's working directory no longer exists on disk. */
  workDirExists: boolean
}

/**
 * Full session payload returned by {@link scanSession}.
 */
export interface SessionDetail extends SessionListItem {
  /** Flattened messages; subagent tool_use/tool_result messages are inlined when present. */
  messages: MessageEntry[]
  /** Ordered list of file-history snapshots recorded during the session. */
  fileHistorySnapshots: FileHistorySnapshot[]
  /** Optional launch-time metadata (model, permission mode, cwd, repository). */
  launchInfo?: SessionLaunchInfo
}

// ---------------------------------------------------------------------------
// MessageEntry
// ---------------------------------------------------------------------------

/**
 * Normalized message shape used in {@link SessionDetail.messages}.
 *
 * `type` is one of:
 *  - `user`      — user message with text or content blocks
 *  - `assistant` — assistant message with text or content blocks
 *  - `system`    — system message (goal local commands etc.)
 *  - `tool_use`  — assistant message containing at least one tool_use block
 *  - `tool_result` — user message containing tool_result blocks
 */
export interface MessageEntry {
  id: string
  type: 'user' | 'assistant' | 'system' | 'tool_use' | 'tool_result'
  /** Original message content (string for plain text, structured blocks otherwise). */
  content: unknown
  /** Optional result payload for tool_use messages. */
  toolUseResult?: unknown
  timestamp: string
  model?: string
  parentUuid?: string
  parentToolUseId?: string
  isSidechain?: boolean
}

// ---------------------------------------------------------------------------
// Launch info
// ---------------------------------------------------------------------------

/**
 * Launch-time metadata recorded in `session-meta` JSONL entries.
 */
export interface SessionLaunchInfo {
  filePath: string
  projectDir: string
  workDir: string
  repository?: SessionRepositoryInfo
  worktreeSession?: PersistedWorktreeSession | null
  transcriptMessageCount: number
  customTitle: string | null
  permissionMode?: string
  runtimeProviderId?: string | null
  runtimeModelId?: string
  effortLevel?: string
}

export interface SessionRepositoryInfo {
  repoRoot: string
  requestedWorkDir?: string
  branch?: string | null
  worktree?: boolean
  worktreeSlug?: string | null
  worktreeBranch?: string | null
  worktreePath?: string | null
}

// ---------------------------------------------------------------------------
// Transcript metadata (lightweight summary)
// ---------------------------------------------------------------------------

export interface TranscriptMetadata {
  customTitle?: string
  aiTitle?: string
  firstUserMessage?: string
  messageCount: number
  workDir?: string
  permissionMode?: string
  runtimeProviderId?: string | null
  runtimeModelId?: string
  effortLevel?: string
}

// ---------------------------------------------------------------------------
// Task notifications
// ---------------------------------------------------------------------------

export interface TaskNotification {
  taskId: string
  toolUseId: string
  status: 'completed' | 'failed' | 'stopped'
  summary?: string
  result?: string
  outputFile?: string
  timestamp?: string
}

// ---------------------------------------------------------------------------
// Subagent transcript link (attached to tool_use messages)
// ---------------------------------------------------------------------------

export interface SubagentLink {
  agentId: AgentId
  transcriptPath: string
  messages: MessageEntry[]
}

// ---------------------------------------------------------------------------
// Raw entry shape (for advanced consumers)
// ---------------------------------------------------------------------------

/**
 * Raw entry shape as parsed from a JSONL line. `additionalProperties: true` in
 * the upstream JSONL format; the open index signature preserves unknowns.
 */
export interface RawEntry {
  type?: string
  subtype?: string
  content?: unknown
  uuid?: string
  messageId?: string
  parentUuid?: string | null
  parent_tool_use_id?: string | null
  isSidechain?: boolean
  isMeta?: boolean
  cwd?: string
  message?: {
    role?: string
    content?: unknown
    model?: string
    id?: string
    type?: string
    usage?: Record<string, unknown>
  }
  timestamp?: string
  version?: string
  snapshot?: {
    messageId?: string
    trackedFileBackups?: Record<string, unknown>
    timestamp?: string
  }
  customTitle?: string
  permissionMode?: string
  worktreeSession?: PersistedWorktreeSession | null
  title?: string
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Injection callback
// ---------------------------------------------------------------------------

/**
 * Optional callback consumers can supply to override the default git-root
 * lookup. Should return the canonical git root for `workDir`, or `null` when
 * the directory is not inside a git repo (or git is unavailable).
 */
export type FindGitRoot = (workDir: string) => Promise<string | null>

// ---------------------------------------------------------------------------
// Options bags
// ---------------------------------------------------------------------------

export interface ScanProjectsOptions {
  findGitRoot?: FindGitRoot
  /** When `false`, bypasses the 5s in-memory cache. Defaults to `true`. */
  useCache?: boolean
}

export interface ScanSessionOptions {
  configRoot?: string
  findGitRoot?: FindGitRoot
  /**
   * When `true` (default), inlines Agent/Task tool_use and tool_result messages
   * from sibling `subagents/*.jsonl` files. Pass `false` for a flat transcript
   * view.
   */
  includeSubagentMessages?: boolean
}

export interface ScanMessagesOptions {
  configRoot?: string
  includeSubagentMessages?: boolean
}

export interface ScanFileHistoryOptions {
  configRoot?: string
}

export interface AccessorOptions {
  configRoot?: string
  findGitRoot?: FindGitRoot
}

export interface CwdAccessorOptions {
  configRoot?: string
  messageIndex?: number
}
