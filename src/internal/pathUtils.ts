/**
 * Path utilities vendored from cc-haha's src/server/services/windowsDrivePath.ts
 * and src/utils/sessionStoragePortable.ts (sanitizePath only).
 *
 * Kept dependency-free so the package can run with zero npm deps.
 */

import * as path from 'node:path'

// ---------------------------------------------------------------------------
// sanitizePath / desanitizePath
// ---------------------------------------------------------------------------

/** Maximum sanitized length before a hash suffix is appended. */
export const MAX_SANITIZED_LENGTH = 200

/**
 * djb2 string hash — fast non-cryptographic 32-bit hash. Deterministic across
 * runtimes, used here to disambiguate truncated sanitized paths.
 */
export function djb2Hash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return hash
}

/**
 * Replace every non-alphanumeric character with a hyphen, so the result is
 * safe to use as a directory name on all platforms (including Windows where
 * `:` and other characters are reserved).
 *
 * For inputs that exceed {@link MAX_SANITIZED_LENGTH}, truncates and appends a
 * hash suffix. Uses Bun.hash if available (Bun runtime), otherwise djb2Hash.
 *
 * POSIX absolute paths start with `/` which becomes `-`, so `/Users/foo`
 * sanitizes to `--Users-foo`. Windows drive roots like `C:` double to `C--`
 * (the colon and following backslash both become hyphens).
 */
export function sanitizePath(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9]/g, '-')
  if (sanitized.length <= MAX_SANITIZED_LENGTH) {
    return sanitized
  }
  const hash =
    typeof Bun !== 'undefined' ? Bun.hash(name).toString(36) : djb2Hash(name).toString(36)
  return `${sanitized.slice(0, MAX_SANITIZED_LENGTH)}-${hash}`
}

/**
 * Best-effort reverse of {@link sanitizePath}.
 *
 * On POSIX, replaces every hyphen with `path.sep`. On Windows, recognizes a
 * leading `X--` (drive letter doubled) and reconstructs `X:\` followed by
 * the rest with hyphens → backslashes.
 *
 * This is necessarily lossy when the original path itself contained hyphens
 * or other non-alphanumeric characters. Callers that need exact recovery
 * should track original paths externally.
 */
export function desanitizePath(sanitized: string): string {
  const windowsDrivePath = sanitized.match(/^([a-zA-Z])--(.+)$/)
  if (windowsDrivePath && windowsDrivePath[1] && windowsDrivePath[2]) {
    return `${windowsDrivePath[1]}:${path.win32.sep}${windowsDrivePath[2].replace(/-/g, path.win32.sep)}`
  }

  const windowsDriveRoot = sanitized.match(/^([a-zA-Z])--$/)
  if (windowsDriveRoot && windowsDriveRoot[1]) {
    return `${windowsDriveRoot[1]}:${path.win32.sep}`
  }

  return sanitized.replace(/-/g, path.sep)
}

// ---------------------------------------------------------------------------
// Platform-aware path normalization
// ---------------------------------------------------------------------------

/**
 * On Windows, rewrite a bare drive-root like `C:` to `C:\`. No-op elsewhere.
 */
export function normalizeDriveRootPathForPlatform(
  filePath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform !== 'win32') return filePath

  const driveRootMatch = filePath.match(/^([a-zA-Z]):$/)
  if (!driveRootMatch) return filePath

  return `${driveRootMatch[1]}:\\`
}

/**
 * True if `targetPath` is the same as or nested under `rootPath`. Comparison is
 * case-insensitive on Windows.
 */
export function isSameOrInsidePathForPlatform(
  targetPath: string,
  rootPath: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const pathApi = platform === 'win32' ? path.win32 : path
  const normalize = (filePath: string) => {
    const resolved = pathApi.resolve(normalizeDriveRootPathForPlatform(filePath, platform))
    return platform === 'win32' ? resolved.toLowerCase() : resolved
  }
  const target = normalize(targetPath)
  const root = normalize(rootPath)
  const relative = pathApi.relative(root, target)

  return relative === '' || (!!relative && !relative.startsWith('..') && !pathApi.isAbsolute(relative))
}
