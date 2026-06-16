import { describe, expect, test } from 'bun:test'
import { scanSession } from '../src/scan/scanSession.js'
import { writeSessionFile, writeSubagentFile } from './helpers/writeSessionFile.js'
import {
  assistantMessageEntry,
  customTitleEntry,
  fileHistorySnapshotEntry,
  sessionMetaEntry,
  taskNotificationUserEntry,
  toolResultUserEntry,
  toolUseAssistantEntry,
  userMessageEntry,
} from './helpers/fixtures.js'
import { tmpRoot, useTmpConfigDir } from './helpers/tmpConfigDir.js'
import { clearSessionStoreCache } from '../src/scan/scanProjects.js'

useTmpConfigDir()

const SESSION_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SESSION_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

describe('scanSession', () => {
  test('returns null when the session does not exist', async () => {
    expect(await scanSession('00000000-0000-0000-0000-000000000000' as never)).toBeNull()
  })

  test('returns full SessionDetail with messages', async () => {
    const root = tmpRoot()
    // Use a projectPath that actually exists so workDirExists resolves true.
    const projectPath = root
    writeSessionFile(root, {
      projectPath,
      sessionId: SESSION_A,
      entries: [
        sessionMetaEntry({ workDir: projectPath }),
        userMessageEntry({ text: 'hi' }),
        assistantMessageEntry({ text: 'hello there' }),
        fileHistorySnapshotEntry({ files: { 'a.ts': { version: 1, backupFileName: 'a.ts.bak' } } }),
      ],
    })

    const detail = await scanSession(SESSION_A as never)
    expect(detail).not.toBeNull()
    expect(detail!.title).toBe('hi')
    expect(detail!.firstUserMessage).toBe('hi')
    expect(detail!.messages.length).toBe(2)
    expect(detail!.fileHistorySnapshots.length).toBe(1)
    expect(detail!.workDirExists).toBe(true)
  })

  test('custom-title overrides first user message', async () => {
    const root = tmpRoot()
    writeSessionFile(root, {
      projectPath: '/Users/foo/c',
      sessionId: SESSION_A,
      entries: [
        userMessageEntry({ text: 'original message' }),
        customTitleEntry('Renamed by user'),
      ],
    })
    const detail = await scanSession(SESSION_A as never)
    expect(detail?.title).toBe('Renamed by user')
    expect(detail?.customTitle).toBe('Renamed by user')
  })

  test('hides synthetic interruptions and task notifications', async () => {
    const root = tmpRoot()
    const tuId = 'tu_interrupt'
    writeSessionFile(root, {
      projectPath: '/Users/foo/hide',
      sessionId: SESSION_A,
      entries: [
        userMessageEntry({ text: 'real question' }),
        taskNotificationUserEntry({
          toolUseId: tuId,
          taskId: 't1',
          status: 'completed',
          summary: 'done',
        }),
      ],
    })
    const detail = await scanSession(SESSION_A as never)
    // Only the real user question is kept; the task notification is filtered.
    const real = detail?.messages.filter((m) => m.content !== tuId)
    expect(real?.length).toBeGreaterThanOrEqual(1)
    expect(detail?.messages.some((m) => String(m.content).includes('real question'))).toBe(true)
  })

  test('inlines Agent subagent messages by default', async () => {
    const root = tmpRoot()
    const agentToolUseId = 'tu_agent_1'
    const agentId = 'agent-xyz'
    writeSessionFile(root, {
      projectPath: '/Users/foo/subagent',
      sessionId: SESSION_B,
      entries: [
        userMessageEntry({ text: 'please run an agent' }),
        toolUseAssistantEntry({
          toolName: 'Agent',
          input: { prompt: 'inspect' },
          toolUseId: agentToolUseId,
          toolResultAgentId: agentId,
        }),
        toolResultUserEntry({
          toolUseId: agentToolUseId,
          content: `agentId: ${agentId}`,
        }),
      ],
    })
    writeSubagentFile(root, {
      projectPath: '/Users/foo/subagent',
      sessionId: SESSION_B,
      agentId,
      entries: [
        {
          type: 'user',
          message: { role: 'user', content: 'sub-question' },
          timestamp: new Date().toISOString(),
        },
        {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'inner_tu', name: 'Bash', input: { cmd: 'ls' } }],
          },
          timestamp: new Date().toISOString(),
        },
        {
          type: 'user',
          message: {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'inner_tu', content: 'output' }],
          },
          timestamp: new Date().toISOString(),
        },
      ],
    })

    const detail = await scanSession(SESSION_B as never)
    expect(detail).not.toBeNull()
    // Main transcript contributes 3 (user, tool_use, tool_result);
    // subagent contributes 2 (tool_use + tool_result, the user entry is
    // dropped by loadSubagentToolMessages which only keeps tool_use/tool_result).
    expect(detail!.messages.length).toBe(5)
  })

  test('includeSubagentMessages: false skips subagent inlining', async () => {
    const root = tmpRoot()
    const agentToolUseId = 'tu_agent_2'
    const agentId = 'agent-abc'
    writeSessionFile(root, {
      projectPath: '/Users/foo/no-sub',
      sessionId: SESSION_A,
      entries: [
        userMessageEntry({ text: 'hi' }),
        toolUseAssistantEntry({
          toolName: 'Agent',
          input: {},
          toolUseId: agentToolUseId,
        }),
        toolResultUserEntry({ toolUseId: agentToolUseId, content: `agentId: ${agentId}` }),
      ],
    })
    writeSubagentFile(root, {
      projectPath: '/Users/foo/no-sub',
      sessionId: SESSION_A,
      agentId,
      entries: [userMessageEntry({ text: 'sub' })],
    })

    const detail = await scanSession(SESSION_A as never, { includeSubagentMessages: false })
    expect(detail!.messages.length).toBe(3)
  })
})

describe('scanSession cache invalidation', () => {
  test('cache does not affect scanSession', async () => {
    const root = tmpRoot()
    writeSessionFile(root, {
      projectPath: '/Users/foo/scan-no-cache',
      sessionId: SESSION_B,
      entries: [userMessageEntry({ text: 'first' })],
    })
    clearSessionStoreCache()
    const a = await scanSession(SESSION_B as never)
    const b = await scanSession(SESSION_B as never)
    expect(a?.messages.length).toBe(b?.messages.length)
  })
})
