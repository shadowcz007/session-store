/**
 * Test helper: create an isolated temp CLAUDE_CONFIG_DIR for the lifetime of
 * a test, and clean it up on teardown.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach } from 'bun:test'

let activeRoot: string | null = null
let previousEnv: string | undefined

export function useTmpConfigDir(): { root: string } {
  beforeEach(() => {
    activeRoot = mkdtempSync(join(tmpdir(), 'session-store-'))
    previousEnv = process.env.CLAUDE_CONFIG_DIR
    process.env.CLAUDE_CONFIG_DIR = activeRoot
  })

  afterEach(() => {
    if (previousEnv === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = previousEnv
    }
    if (activeRoot) {
      rmSync(activeRoot, { recursive: true, force: true })
      activeRoot = null
    }
  })

  return {
    get root(): string {
      if (!activeRoot) throw new Error('useTmpConfigDir() before beforeEach ran')
      return activeRoot
    },
  } as { root: string }
}

/** Convenience accessor for the current tmp root (must be called inside a test). */
export function tmpRoot(): string {
  if (!activeRoot) throw new Error('tmpRoot() called outside of useTmpConfigDir()')
  return activeRoot
}
