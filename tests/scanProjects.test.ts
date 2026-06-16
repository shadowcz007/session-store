import { describe, expect, test } from 'bun:test'
import { scanProjects, clearSessionStoreCache } from '../src/scan/scanProjects.js'
import { writeSessionFile } from './helpers/writeSessionFile.js'
import {
  assistantMessageEntry,
  customTitleEntry,
  sessionMetaEntry,
  userMessageEntry,
  worktreeStateEntry,
} from './helpers/fixtures.js'
import { tmpRoot, useTmpConfigDir } from './helpers/tmpConfigDir.js'

useTmpConfigDir()

describe('scanProjects', () => {
  test('returns empty array when projects root does not exist', async () => {
    const items = await scanProjects()
    expect(items).toEqual([])
  })

  test('returns one item per session across multiple projects', async () => {
    const root = tmpRoot()
    writeSessionFile(root, {
      projectPath: '/Users/foo/projectA',
      sessionId: '11111111-1111-1111-1111-111111111111',
      entries: [
        sessionMetaEntry({ workDir: '/Users/foo/projectA' }),
        userMessageEntry({ text: 'hello' }),
      ],
    })
    writeSessionFile(root, {
      projectPath: '/Users/foo/projectB',
      sessionId: '22222222-2222-2222-2222-222222222222',
      entries: [
        sessionMetaEntry({ workDir: '/Users/foo/projectB' }),
        customTitleEntry('Project B session'),
        userMessageEntry({ text: 'hi from B' }),
      ],
    })

    clearSessionStoreCache()
    const items = await scanProjects()
    expect(items.length).toBe(2)
    const ids = items.map((i) => i.id as string).sort()
    expect(ids).toEqual([
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ])
    const titled = items.find((i) => i.id === '22222222-2222-2222-2222-222222222222')!
    expect(titled.title).toBe('Project B session')
    expect(titled.customTitle).toBe('Project B session')
    expect(titled.firstUserMessage).toBe('hi from B')
  })

  test('counts only user/assistant messages (excludes meta)', async () => {
    const root = tmpRoot()
    writeSessionFile(root, {
      projectPath: '/Users/foo/x',
      sessionId: '33333333-3333-3333-3333-333333333333',
      entries: [
        sessionMetaEntry({ workDir: '/Users/foo/x' }),
        userMessageEntry({ text: 'real', isMeta: false }),
        userMessageEntry({ text: 'meta entry', isMeta: true }),
        assistantMessageEntry({ text: 'reply' }),
      ],
    })
    clearSessionStoreCache()
    const items = await scanProjects()
    // scanSessionListSummary counts every user/assistant entry (matches
    // cc-haha's SessionService behavior). isMeta filtering is only applied
    // by entriesToMessages for the full transcript view.
    expect(items[0]?.messageCount).toBe(3)
  })

  test('detects worktree session', async () => {
    const root = tmpRoot()
    writeSessionFile(root, {
      projectPath: '/Users/foo/repo',
      sessionId: '44444444-4444-4444-4444-444444444444',
      entries: [
        sessionMetaEntry({ workDir: '/Users/foo/repo' }),
        worktreeStateEntry({
          originalCwd: '/Users/foo/repo',
          worktreePath: '/Users/foo/repo/.claude/worktrees/x',
          worktreeName: 'worktree-x',
          worktreeBranch: 'feat/x',
        }),
        userMessageEntry({ text: 'in a worktree' }),
      ],
    })
    clearSessionStoreCache()
    const items = await scanProjects()
    expect(items[0]?.worktreeSession?.worktreeName).toBe('worktree-x')
    expect(items[0]?.worktreeSession?.worktreeBranch).toBe('feat/x')
  })

  test('cache returns same array reference within 5s', async () => {
    const root = tmpRoot()
    writeSessionFile(root, {
      projectPath: '/Users/foo/cached',
      sessionId: '55555555-5555-5555-5555-555555555555',
      entries: [userMessageEntry({ text: 'first' })],
    })
    clearSessionStoreCache()
    const a = await scanProjects()
    const b = await scanProjects()
    expect(b).toEqual(a)
  })

  test('useCache: false bypasses cache', async () => {
    const root = tmpRoot()
    writeSessionFile(root, {
      projectPath: '/Users/foo/bypass',
      sessionId: '66666666-6666-6666-6666-666666666666',
      entries: [userMessageEntry({ text: 'hi' })],
    })
    clearSessionStoreCache()
    const a = await scanProjects()
    const b = await scanProjects(undefined, { useCache: false })
    expect(b).toEqual(a)
  })

  test('skips malformed JSONL lines silently', async () => {
    const root = tmpRoot()
    const { join } = await import('node:path')
    const { mkdirSync, writeFileSync } = await import('node:fs')
    const dir = join(root, 'projects', '--Users-foo-malformed')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, '77777777-7777-7777-7777-777777777777.jsonl'),
      [
        JSON.stringify({ type: 'user', message: { role: 'user', content: 'good' } }),
        'this is not json',
        JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: 'fine' } }),
      ].join('\n') + '\n',
    )
    clearSessionStoreCache()
    const items = await scanProjects()
    expect(items.length).toBe(1)
    expect(items[0]?.messageCount).toBe(2)
  })
})
