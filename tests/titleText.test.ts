import { describe, expect, test } from 'bun:test'
import {
  cleanSessionTitleSource,
  hasSessionTitleMarkup,
} from '../src/internal/titleText.js'

describe('cleanSessionTitleSource', () => {
  test('joins slash command name and args', () => {
    const input = `<local-command-stdout>some intro</local-command-stdout>
<command-name>/compact</command-name>
<command-args>--no-output</command-args>
<command-message>compact hint</command-message>
<command-args></command-args>`
    expect(cleanSessionTitleSource(input)).toBe('/compact --no-output')
  })

  test('uses command-name when args missing', () => {
    const input = '<command-name>/help</command-name>'
    expect(cleanSessionTitleSource(input)).toBe('/help')
  })

  test('strips generic XML tags', () => {
    expect(cleanSessionTitleSource('<note>hello</note> world')).toBe('world')
  })

  test('normalizes whitespace', () => {
    expect(cleanSessionTitleSource('foo   bar\n\nbaz')).toBe('foo bar baz')
  })

  test('passes plain text through', () => {
    expect(cleanSessionTitleSource('refactor the auth flow')).toBe('refactor the auth flow')
  })
})

describe('hasSessionTitleMarkup', () => {
  test('detects XML blocks', () => {
    expect(hasSessionTitleMarkup('<note>x</note>')).toBe(true)
  })

  test('false on plain text', () => {
    expect(hasSessionTitleMarkup('hello world')).toBe(false)
  })
})
