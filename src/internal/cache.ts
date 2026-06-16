/**
 * Tiny TTL cache for {@link scanProjects} results.
 *
 * The cache is module-scoped, which is fine for short-lived CLI / web processes
 * but surprising for long-lived servers. Callers that need deterministic
 * behaviour should pass `useCache: false` or call {@link clearSessionStoreCache}
 * after writes.
 */

interface CacheEntry<T> {
  expiresAt: number
  result: T
}

const DEFAULT_TTL_MS = 5_000

const projectsCache = new Map<string, CacheEntry<unknown>>()

/** Generate a stable cache key from the inputs that affect the result. */
export function makeProjectsCacheKey(
  configRoot: string,
  optionsKey: string,
): string {
  return JSON.stringify({ root: configRoot, options: optionsKey })
}

export function getCachedProjects<T>(cacheKey: string): T | null {
  const entry = projectsCache.get(cacheKey) as CacheEntry<T> | undefined
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    projectsCache.delete(cacheKey)
    return null
  }
  // Clone to avoid callers mutating cached entries
  return structuredClone(entry.result) as T
}

export function setCachedProjects<T>(
  cacheKey: string,
  result: T,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  projectsCache.set(cacheKey, {
    expiresAt: Date.now() + ttlMs,
    result: structuredClone(result),
  })
}

/** Drop every cached entry. Useful after writes that mutate the JSONL files. */
export function clearSessionStoreCache(): void {
  projectsCache.clear()
}
