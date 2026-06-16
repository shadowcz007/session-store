/**
 * Example: minimal "session browser" HTTP server.
 *
 * Wires the public scan API to a tiny read-only REST surface. Run with:
 *
 *     bun run examples/typescript/web-browser.ts
 *     curl http://localhost:3000/sessions
 *     curl http://localhost:3000/sessions/<id>
 *
 * No external deps beyond `@claude-code-local/session-store`. Uses Bun's
 * built-in HTTP server, but the handler body works equally well under
 * Node's `http`, Express, Hono, etc.
 */

import {
  scanProjects,
  scanSession,
  defaultFindGitRoot,
  type SessionId,
} from '@claude-code-local/session-store'

const PORT = Number(process.env.PORT ?? 3000)

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const server = Bun.serve({
  port: PORT,
  async fetch(req): Promise<Response> {
    const url = new URL(req.url)

    // GET /sessions — lightweight list
    if (url.pathname === '/sessions' && req.method === 'GET') {
      const items = await scanProjects(undefined, { findGitRoot: defaultFindGitRoot })
      return json({
        total: items.length,
        sessions: items.map((s) => ({
          id: s.id,
          title: s.title,
          projectPath: s.projectPath,
          messageCount: s.messageCount,
          modifiedAt: s.modifiedAt,
          gitRoot: s.gitRoot ?? null,
        })),
      })
    }

    // GET /sessions/:id — full transcript
    const match = url.pathname.match(/^\/sessions\/([0-9a-f-]{36})$/)
    if (match && req.method === 'GET') {
      const sessionId = match[1] as SessionId
      const detail = await scanSession(sessionId)
      if (!detail) return json({ error: 'not_found' }, 404)
      return json({
        id: detail.id,
        title: detail.title,
        projectPath: detail.projectPath,
        messageCount: detail.messageCount,
        messages: detail.messages,
        fileHistorySnapshots: detail.fileHistorySnapshots,
        launchInfo: detail.launchInfo,
      })
    }

    return json({ error: 'not_found', path: url.pathname }, 404)
  },
})

console.log(`Session browser listening on http://localhost:${server.port}`)
console.log(`  GET /sessions           — list all sessions`)
console.log(`  GET /sessions/:id       — full transcript`)
