/**
 * Resolve the config root and projects directory from an optional override or
 * the `CLAUDE_CONFIG_DIR` env var (falling back to `~/.claude`).
 *
 * Pulled out of the larger sessionService class so it can be reused by every
 * entry point without injecting state.
 */

import * as os from 'node:os'
import * as path from 'node:path'

const DEFAULT_CONFIG_ROOT = path.join(os.homedir(), '.claude')

/**
 * Resolve the config root. Precedence:
 *   1. Explicit `configRoot` argument
 *   2. `process.env.CLAUDE_CONFIG_DIR`
 *   3. `~/.claude`
 */
export function resolveConfigRoot(configRoot?: string): string {
  if (configRoot) return configRoot
  if (process.env.CLAUDE_CONFIG_DIR) return process.env.CLAUDE_CONFIG_DIR
  return DEFAULT_CONFIG_ROOT
}

/** Absolute path to the projects directory: `<configRoot>/projects`. */
export function resolveProjectsRoot(configRoot?: string): string {
  return path.join(resolveConfigRoot(configRoot), 'projects')
}
