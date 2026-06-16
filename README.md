# `@claude-code-local/session-store`

> Zero-dependency, read-only scanner for Claude Code session transcripts.
> Pure ESM, ships JSON Schema for offline Python/Rust analyzers.

A standalone TypeScript package that reads Claude Code session JSONL files from
`~/.claude/projects/<sanitized-path>/<sessionId>.jsonl`, extracts metadata, and
returns structured objects — without booting the cc-haha server, dragging in
provider pricing tables, or touching any mutation path.

## Use cases

1. **Web "session browser" (read-only)** — import this package, render a list of
   past sessions, drill into one to read its full transcript.
2. **Python / Rust offline analysis** — use the JSON Schema files in
   [`schema/`](./schema) to validate and parse transcripts in other languages.
3. **Desktop "export all sessions" feature** — iterate sessions, dump JSON,
   bulk archive.

## Install

```bash
bun add @claude-code-local/session-store
# or
npm install @claude-code-local/session-store
```

## Quickstart (TypeScript)

```ts
import {
  scanProjects,
  scanSession,
  scanSessionMessages,
  defaultFindGitRoot,
} from '@claude-code-local/session-store'

// List every session across every project
const items = await scanProjects(undefined, { findGitRoot: defaultFindGitRoot })
console.log(`Found ${items.length} sessions across multiple projects`)

// Read one session in full
const detail = await scanSession(items[0].sessionId)
if (detail) {
  console.log(`Title: ${detail.customTitle ?? detail.firstUserMessage}`)
  console.log(`Messages: ${detail.messages.length}`)
}
```

## API surface

### Core scanning

| Function | Returns | Notes |
|----------|---------|-------|
| `scanProjects(configRoot?, options?)` | `SessionListItem[]` | Lightweight; paginates internally. Cached 5s. |
| `scanSession(sessionId, options?)` | `SessionDetail \| null` | Full transcript + subagent merging by default. |
| `scanSessionMessages(sessionId, options?)` | `MessageEntry[] \| null` | Same as `scanSession.messages`. |
| `scanSessionFileHistorySnapshots(sessionId, options?)` | `FileHistorySnapshot[]` | For diff viewer. |

### Accessors

| Function | Returns |
|----------|---------|
| `getCustomTitle(sessionId, options?)` | `string \| undefined` |
| `getSessionWorkDir(sessionId, options?)` | `string \| undefined` |
| `getSessionMessageCwd(sessionId, options?)` | `string \| undefined` |
| `getSessionLaunchInfo(sessionId, options?)` | `SessionLaunchInfo \| undefined` |
| `getTranscriptMetadata(sessionId, options?)` | `TranscriptMetadata \| undefined` |
| `getSessionTaskNotifications(sessionId, options?)` | `TaskNotification[]` |

### Path utilities

| Function | Returns | Notes |
|----------|---------|-------|
| `sanitizePath(absPath)` | `SanitizedPath` | e.g. `/Users/foo` → `--Users-foo`. |
| `desanitizePath(sanitized)` | `string \| null` | Best-effort reverse; may be null. |
| `normalizeDriveRootPathForPlatform(p, platform?)` | `string` | `C:` → `C:\` on Windows. |
| `isSameOrInsidePathForPlatform(target, root, platform?)` | `boolean` | Case-insensitive on Windows. |

### Injection / utility

- `FindGitRoot` type — inject your own `git rev-parse` implementation.
- `defaultFindGitRoot` — built-in implementation via `node:child_process`.
- `clearSessionStoreCache()` — clear the 5-second `scanProjects` cache.

## CLI smoke test

A smoke CLI ships in the package for verifying the scanner against real data:

```bash
bun run build
node packages/session-store/dist/cli/smoke.js                 # list projects/sessions
node packages/session-store/dist/cli/smoke.js --session <id>  # dump one session
```

## JSON Schema (Python / Rust)

The `schema/` directory contains Draft 2020-12 JSON Schemas for every public
type. They are intentionally verbose with `description` fields so consumers can
use them as documentation.

```python
import json
import jsonschema

schema = json.load(open('node_modules/@claude-code-local/session-store/schema/SessionListItem.schema.json'))
jsonschema.validate(my_session, schema)
```

```rust
// Cargo.toml:
// [dependencies]
// jsonschema = "0.17"
// url = "2"

use jsonschema::JSONSchema;
use std::fs;

let schema_text = fs::read_to_string("node_modules/@claude-code-local/session-store/schema/SessionListItem.schema.json")?;
let schema = JSONSchema::compile(&serde_json::from_str(&schema_text)?)?;
let result = schema.validate(&serde_json::from_str(&session_json)?);
```

The `schema/index.json` file lists every schema with its `$id` and path.

## Design constraints

- **Zero runtime dependencies.** Only `node:fs`, `node:readline`, `node:path`,
  `node:os`, `node:child_process`, `node:crypto` are imported at runtime.
- **No mutations.** This package never writes to the JSONL files.
- **Read-only by default.** `getTranscriptUsage` and `getTranscriptContextEstimate`
  (which need provider pricing tables) are intentionally NOT included. Consumers
  compute their own cost / context.
- **Subagent merging by default.** `scanSession` inlines Agent/Task tool
  messages from sibling `subagents/agent-<id>.jsonl` files, matching cc-haha's
  `getSession` behavior. Pass `includeSubagentMessages: false` to opt out.

## Layout

```
packages/session-store/
├── src/
│   ├── index.ts                  # public API barrel
│   ├── types.ts                  # exported types
│   ├── scan/                     # scanProjects / scanSession / ...
│   ├── accessors/                # getCustomTitle / getSessionWorkDir / ...
│   ├── internal/                 # private helpers (not re-exported)
│   └── cli/smoke.ts              # bin: session-store-smoke
├── schema/                       # JSON Schema files (cross-language)
├── tests/                        # bun test files
├── examples/                     # consumer reference code
│   ├── typescript/
│   ├── python/
│   └── rust/
└── scripts/validate-schemas.ts   # ajv compile check
```

## Examples

The `examples/` directory has self-contained snippets for each intended
consumer:

| File | Use case |
|------|----------|
| `examples/typescript/web-browser.ts` | Web "session browser" — minimal Bun.serve HTTP API |
| `examples/typescript/dump-all-sessions.ts` | Desktop "export all sessions" — bulk JSON archive |
| `examples/python/analyze_sessions.py` | Python offline analyzer — validates JSONL via `jsonschema` |
| `examples/rust/src/main.rs` | Rust offline analyzer — validates JSONL via `jsonschema` crate |

See [`examples/README.md`](./examples/README.md) for runnable commands.

## License

MIT — see [LICENSE](./LICENSE).
