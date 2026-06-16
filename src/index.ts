/**
 * `@claude-code-local/session-store` — public API barrel.
 *
 * Re-exports the 10 read-only functions plus all related types and the
 * internal path helpers. Internal helpers under `./internal/*` are not
 * re-exported; consumers should import everything they need from this file.
 */

// ---------------------------------------------------------------------------
// Core scanning
// ---------------------------------------------------------------------------

export { scanProjects } from './scan/scanProjects.js'
export { scanSession } from './scan/scanSession.js'
export { scanSessionMessages } from './scan/scanSessionMessages.js'
export { scanSessionFileHistorySnapshots } from './scan/scanSessionFileHistorySnapshots.js'

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

export { getCustomTitle } from './accessors/getCustomTitle.js'
export { getSessionWorkDir } from './accessors/getSessionWorkDir.js'
export { getSessionMessageCwd } from './accessors/getSessionMessageCwd.js'
export { getSessionLaunchInfo } from './accessors/getSessionLaunchInfo.js'
export { getTranscriptMetadata } from './accessors/getTranscriptMetadata.js'
export { getSessionTaskNotifications } from './accessors/getSessionTaskNotifications.js'

// ---------------------------------------------------------------------------
// Path utilities
// ---------------------------------------------------------------------------

export {
  sanitizePath,
  desanitizePath,
  normalizeDriveRootPathForPlatform,
  isSameOrInsidePathForPlatform,
} from './internal/pathUtils.js'

// ---------------------------------------------------------------------------
// Cache control
// ---------------------------------------------------------------------------

export { clearSessionStoreCache } from './internal/cache.js'

// ---------------------------------------------------------------------------
// Git root injection
// ---------------------------------------------------------------------------

export { defaultFindGitRoot } from './internal/gitRoot.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type {
  AccessorOptions,
  AgentId,
  CwdAccessorOptions,
  FileHistoryBackup,
  FileHistorySnapshot,
  FindGitRoot,
  MessageEntry,
  PersistedWorktreeSession,
  RawEntry,
  SanitizedPath,
  ScanFileHistoryOptions,
  ScanMessagesOptions,
  ScanProjectsOptions,
  ScanSessionOptions,
  SessionDetail,
  SessionId,
  SessionLaunchInfo,
  SessionListItem,
  SessionRepositoryInfo,
  SubagentLink,
  TaskNotification,
  TranscriptMetadata,
} from './types.js'
