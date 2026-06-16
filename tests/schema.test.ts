import { describe, expect, test } from 'bun:test'
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

const SCHEMA_FILES = readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.schema.json'))

/** Build an ajv instance that pre-registers every schema EXCEPT the one being
 *  compiled, so its `$id` isn't double-registered. */
function makeAjvExcluding(exclude: string): AjvLike {
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  for (const name of SCHEMA_FILES) {
    if (name === exclude) continue
    const json = JSON.parse(readFileSync(join(SCHEMA_DIR, name), 'utf-8'))
    ajv.addSchema(json, name)
  }
  return ajv
}

describe('JSON Schema files', () => {
  test('every schema compiles', () => {
    for (const name of SCHEMA_FILES) {
      const ajv = makeAjvExcluding(name)
      const json = JSON.parse(readFileSync(join(SCHEMA_DIR, name), 'utf-8'))
      expect(() => ajv.compile(json)).not.toThrow()
    }
  })

  test('index.json is valid JSON manifest', () => {
    const json = JSON.parse(readFileSync(join(SCHEMA_DIR, 'index.json'), 'utf-8'))
    expect(json.version).toBe('0.1.0')
    expect(Array.isArray(json.schemas)).toBe(true)
    expect(json.schemas.length).toBeGreaterThan(0)
  })

  test('SessionListItem schema accepts a minimal valid example', () => {
    const ajv = makeAjvExcluding('SessionListItem.schema.json')
    const schema = JSON.parse(
      readFileSync(join(SCHEMA_DIR, 'SessionListItem.schema.json'), 'utf-8'),
    )
    const validate = ajv.compile(schema)
    const valid = validate({
      id: '11111111-2222-3333-4444-555555555555',
      sanitizedProjectPath: '-Users-foo',
      title: 'Example',
      createdAt: '2026-06-16T00:00:00.000Z',
      modifiedAt: '2026-06-16T00:00:00.000Z',
      messageCount: 1,
      sizeBytes: 100,
      workDirExists: true,
    })
    expect(valid).toBe(true)
  })

  test('MessageEntry schema rejects content of wrong shape', () => {
    const ajv = makeAjvExcluding('MessageEntry.schema.json')
    const schema = JSON.parse(
      readFileSync(join(SCHEMA_DIR, 'MessageEntry.schema.json'), 'utf-8'),
    )
    const validate = ajv.compile(schema)
    const valid = validate({
      id: 'x',
      type: 'user',
      content: 42,
      timestamp: '2026-06-16T00:00:00.000Z',
    })
    expect(valid).toBe(false)
  })

  test('RawEntry schema allows additional properties', () => {
    const ajv = makeAjvExcluding('RawEntry.schema.json')
    const schema = JSON.parse(
      readFileSync(join(SCHEMA_DIR, 'RawEntry.schema.json'), 'utf-8'),
    )
    const validate = ajv.compile(schema)
    const valid = validate({
      type: 'user',
      uuid: 'm1',
      message: { role: 'user', content: 'hi' },
      timestamp: '2026-06-16T00:00:00.000Z',
      futureField: 'allowed',
    })
    expect(valid).toBe(true)
  })

  test('SessionDetail schema accepts a full example', () => {
    const ajv = makeAjvExcluding('SessionDetail.schema.json')
    const schema = JSON.parse(
      readFileSync(join(SCHEMA_DIR, 'SessionDetail.schema.json'), 'utf-8'),
    )
    const validate = ajv.compile(schema)
    const valid = validate({
      id: '11111111-2222-3333-4444-555555555555',
      sanitizedProjectPath: '-Users-foo',
      title: 'Example',
      createdAt: '2026-06-16T00:00:00.000Z',
      modifiedAt: '2026-06-16T00:00:00.000Z',
      messageCount: 1,
      sizeBytes: 100,
      workDirExists: true,
      messages: [
        { id: 'm1', type: 'user', content: 'hi', timestamp: '2026-06-16T00:00:00.000Z' },
      ],
      fileHistorySnapshots: [],
      launchInfo: {
        filePath: '/tmp/foo.jsonl',
        projectDir: '-Users-foo',
        workDir: '/Users/foo',
        transcriptMessageCount: 1,
        customTitle: null,
      },
    })
    expect(valid).toBe(true)
  })
})
