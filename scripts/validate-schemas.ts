#!/usr/bin/env bun
/**
 * validate-schemas — compile every schema/*.json with ajv and assert that
 * at least one positive example validates. Exits non-zero on any failure.
 *
 * Used by the `bun run validate:schema` script and by CI.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Ajv2020Ns from 'ajv/dist/2020.js'

interface AjvLike {
  addSchema: (schema: unknown, id?: string) => AjvLike
  compile: (schema: unknown) => (data: unknown) => boolean
}
type AjvCtor = new (opts?: Record<string, unknown>) => AjvLike
const Ajv2020 = Ajv2020Ns as unknown as AjvCtor

const SCHEMA_DIR = join(import.meta.dir, '..', 'schema')

const SCHEMA_FILES = readdirSync(SCHEMA_DIR)
  .filter((f) => f.endsWith('.schema.json'))
  .sort()

interface SchemaFile {
  path: string
  name: string
  json: Record<string, unknown>
}

function loadSchemas(): SchemaFile[] {
  return SCHEMA_FILES.map((name) => ({
    path: join(SCHEMA_DIR, name),
    name,
    json: JSON.parse(readFileSync(join(SCHEMA_DIR, name), 'utf-8')),
  }))
}

function positiveExample(schema: Record<string, unknown>): unknown | null {
  const id = (schema['$id'] as string | undefined) ?? ''
  if (id.endsWith('/index.schema.json')) {
    return {
      version: '0.1.0',
      schemas: [
        { name: 'SessionListItem', $id: 'https://example/SessionListItem', path: './SessionListItem.schema.json' },
      ],
    }
  }
  if (id.endsWith('/SessionListItem.schema.json')) {
    return {
      id: '11111111-2222-3333-4444-555555555555',
      sanitizedProjectPath: '-Users-foo-bar',
      title: 'Example',
      createdAt: '2026-06-16T00:00:00.000Z',
      modifiedAt: '2026-06-16T00:00:00.000Z',
      messageCount: 3,
      sizeBytes: 1024,
      workDirExists: true,
    }
  }
  if (id.endsWith('/SessionDetail.schema.json')) {
    return {
      id: '11111111-2222-3333-4444-555555555555',
      sanitizedProjectPath: '-Users-foo-bar',
      title: 'Example',
      createdAt: '2026-06-16T00:00:00.000Z',
      modifiedAt: '2026-06-16T00:00:00.000Z',
      messageCount: 3,
      sizeBytes: 1024,
      workDirExists: true,
      messages: [
        { id: 'm1', type: 'user', content: 'hi', timestamp: '2026-06-16T00:00:00.000Z' },
      ],
      fileHistorySnapshots: [],
    }
  }
  if (id.endsWith('/SessionLaunchInfo.schema.json')) {
    return {
      filePath: '/tmp/foo.jsonl',
      projectDir: '-Users-foo',
      workDir: '/Users/foo',
      transcriptMessageCount: 1,
      customTitle: null,
    }
  }
  if (id.endsWith('/MessageEntry.schema.json')) {
    return { id: 'm1', type: 'user', content: 'hi', timestamp: '2026-06-16T00:00:00.000Z' }
  }
  if (id.endsWith('/RawEntry.schema.json')) {
    return {
      type: 'user',
      uuid: 'm1',
      message: { role: 'user', content: 'hi' },
      timestamp: '2026-06-16T00:00:00.000Z',
    }
  }
  if (id.endsWith('/FileHistorySnapshot.schema.json')) {
    return {
      messageId: 'm1',
      trackedFileBackups: {},
      timestamp: '2026-06-16T00:00:00.000Z',
    }
  }
  if (id.endsWith('/PersistedWorktreeSession.schema.json')) {
    return {
      originalCwd: '/Users/foo',
      worktreePath: '/Users/foo/.claude/worktrees/x',
      worktreeName: 'worktree-foo',
      sessionId: '11111111-2222-3333-4444-555555555555',
    }
  }
  if (id.endsWith('/TaskNotification.schema.json')) {
    return { taskId: 't1', toolUseId: 'tu1', status: 'completed' }
  }
  return null
}

function main(): void {
  const schemas = loadSchemas()
  let failed = 0

  for (const file of schemas) {
    // Pre-register every other schema so cross-file `$ref`s resolve by
    // relative filename.
    const ajv = new Ajv2020({ allErrors: true, strict: false })
    for (const other of schemas) {
      if (other.name === file.name) continue
      ajv.addSchema(other.json, other.name)
    }

    try {
      const validate = ajv.compile(file.json)
      const example = positiveExample(file.json)
      if (example !== null) {
        const ok = validate(example)
        if (!ok) {
          console.error(`✗ ${file.name} — positive example failed`)
          for (const err of (validate as unknown as { errors?: Array<{ instancePath: string; message: string }> }).errors ?? []) {
            console.error(`    ${err.instancePath} ${err.message}`)
          }
          failed += 1
          continue
        }
      }
      console.log(`✓ ${file.name}`)
    } catch (err) {
      console.error(`✗ ${file.name} — compile failed: ${err instanceof Error ? err.message : String(err)}`)
      failed += 1
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} schema(s) failed validation.`)
    process.exit(1)
  }
  console.log(`\nAll ${schemas.length} schema files compiled and validated.`)
}

main()
