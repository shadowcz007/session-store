/**
 * Default `FindGitRoot` implementation — spawns `git rev-parse --show-toplevel`
 * via `node:child_process`. Returns `null` on any failure (git missing, not a
 * repo, timeout) without throwing.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { FindGitRoot } from '../types.js'

const execFileAsync = promisify(execFile)

export const defaultFindGitRoot: FindGitRoot = async (workDir: string) => {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
      cwd: workDir,
      timeout: 5_000,
      windowsHide: true,
    })
    const trimmed = stdout.trim()
    return trimmed || null
  } catch {
    return null
  }
}
