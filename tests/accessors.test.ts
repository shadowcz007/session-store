import { describe, expect, test } from 'bun:test'
import {
  getCustomTitle,
  getSessionLaunchInfo,
  getSessionMessageCwd,
  getSessionTaskNotifications,
  getSessionWorkDir,
  getTranscriptMetadata,
} from '../src/index.js'
import { writeSessionFile } from './helpers/writeSessionFile.js'
import {
  sessionMetaEntry,
  taskNotificationUserEntry,
  userMessageEntry,
  worktreeStateEntry,
  customTitleEntry,
} from './helpers/fixtures.js'
import { tmpRoot, useTmpConfigDir } from './helpers/tmpConfigDir.js'

useTmpConfigDir()

const SID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

describe('getCustomTitle', () => {
  test('returns null when not set', async () => {
    const root = tmpRoot()
    writeSessionFile(root, {
      projectPath: '/Users/foo/no-title',
      sessionId: SID,
      entries: [userMessageEntry({ text: 'hi' })],
    })
    expect(await getCustomTitle(SID as never)).toBeNull()
  })

  test('returns the last custom-title value', async () => {
    const root = tmpRoot()
    writeSessionFile(root, {
      projectPath: '/Users/foo/title',
      sessionId: SID,
      entries: [customTitleEntry('first'), customTitleEntry('second')],
    })
    expect(await getCustomTitle(SID as never)).toBe('second')
  })
})

describe('getSessionWorkDir', () => {
  test('resolves session-meta.workDir', async () => {
    const root = tmpRoot()
    writeSessionFile(root, {
      projectPath: '/Users/foo/wd',
      sessionId: SID,
      entries: [sessionMetaEntry({ workDir: '/Users/foo/wd' })],
    })
    expect(await getSessionWorkDir(SID as never)).toBe('/Users/foo/wd')
  })

  test('falls back to desanitized project dir', async () => {
    const root = tmpRoot()
    writeSessionFile(root, {
      projectPath: '/Users/foo/fallback',
      sessionId: SID,
      entries: [],
    })
    expect(await getSessionWorkDir(SID as never)).toBe('/Users/foo/fallback')
  })

  test('returns null when session missing', async () => {
    expect(await getSessionWorkDir('00000000-0000-0000-0000-000000000000' as never)).toBeNull()
  })
})

describe('getSessionMessageCwd', () => {
  test('returns the cwd of the first user message', async () => {
    const root = tmpRoot()
    writeSessionFile(root, {
      projectPath: '/Users/foo/cwd',
      sessionId: SID,
      entries: [
        userMessageEntry({ text: 'hi', cwd: '/Users/foo/cwd' }),
        userMessageEntry({ text: 'second', cwd: '/Users/foo/elsewhere' }),
      ],
    })
    expect(await getSessionMessageCwd(SID as never)).toBe('/Users/foo/cwd')
  })

  test('honors messageIndex option', async () => {
    const root = tmpRoot()
    writeSessionFile(root, {
      projectPath: '/Users/foo/cwd2',
      sessionId: SID,
      entries: [
        userMessageEntry({ text: 'first', cwd: '/Users/foo/first' }),
        userMessageEntry({ text: 'second', cwd: '/Users/foo/second' }),
      ],
    })
    expect(await getSessionMessageCwd(SID as never, { messageIndex: 1 })).toBe('/Users/foo/second')
  })
})

describe('getSessionLaunchInfo', () => {
  test('returns null for missing session', async () => {
    expect(await getSessionLaunchInfo('00000000-0000-0000-0000-000000000000' as never)).toBeNull()
  })

  test('aggregates session-meta + worktree + custom-title', async () => {
    const root = tmpRoot()
    writeSessionFile(root, {
      projectPath: '/Users/foo/launch',
      sessionId: SID,
      entries: [
        sessionMetaEntry({ workDir: '/Users/foo/launch', model: 'claude-opus-4-8', permissionMode: 'acceptEdits' }),
        customTitleEntry('My session'),
        worktreeStateEntry({
          originalCwd: '/Users/foo/launch',
          worktreePath: '/Users/foo/launch/.claude/worktrees/x',
          worktreeName: 'x',
          worktreeBranch: 'feat/x',
        }),
      ],
    })
    const info = await getSessionLaunchInfo(SID as never)
    expect(info?.customTitle).toBe('My session')
    expect(info?.worktreeSession?.worktreeName).toBe('x')
  })
})

describe('getTranscriptMetadata', () => {
  test('returns null for missing session', async () => {
    expect(await getTranscriptMetadata('00000000-0000-0000-0000-000000000000' as never)).toBeNull()
  })

  test('returns firstUserMessage and counts', async () => {
    const root = tmpRoot()
    writeSessionFile(root, {
      projectPath: '/Users/foo/meta',
      sessionId: SID,
      entries: [
        sessionMetaEntry({ workDir: '/Users/foo/meta' }),
        userMessageEntry({ text: 'first message' }),
      ],
    })
    const meta = await getTranscriptMetadata(SID as never)
    expect(meta?.firstUserMessage).toBe('first message')
    expect(meta?.messageCount).toBe(1)
  })
})

describe('getSessionTaskNotifications', () => {
  test('returns empty array for missing session', async () => {
    expect(await getSessionTaskNotifications('00000000-0000-0000-0000-000000000000' as never)).toEqual([])
  })

  test('parses task notifications', async () => {
    const root = tmpRoot()
    writeSessionFile(root, {
      projectPath: '/Users/foo/task',
      sessionId: SID,
      entries: [
        taskNotificationUserEntry({
          toolUseId: 'tu1',
          taskId: 't1',
          status: 'completed',
          summary: 'finished',
        }),
      ],
    })
    const list = await getSessionTaskNotifications(SID as never)
    expect(list.length).toBe(1)
    expect(list[0]?.taskId).toBe('t1')
    expect(list[0]?.status).toBe('completed')
    expect(list[0]?.summary).toBe('finished')
  })
})
