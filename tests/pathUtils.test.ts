import { describe, expect, test } from 'bun:test'
import {
  desanitizePath,
  isSameOrInsidePathForPlatform,
  normalizeDriveRootPathForPlatform,
  sanitizePath,
} from '../src/internal/pathUtils.js'

describe('sanitizePath', () => {
  test('POSIX absolute path gets a leading hyphen per separator', () => {
    // Each non-alphanumeric char becomes a single hyphen — `/Users/foo/bar`
    // has two `/` separators plus the leading one, so we get three `-`s at
    // the start: `-Users-foo-bar`.
    expect(sanitizePath('/Users/foo/bar')).toBe('-Users-foo-bar')
  })

  test('replaces dots, underscores, slashes with hyphens', () => {
    expect(sanitizePath('/Users/foo.bar_baz/qux')).toBe('-Users-foo-bar-baz-qux')
  })

  test('preserves consecutive non-alphanumeric as multiple hyphens', () => {
    expect(sanitizePath('/a//b///c')).toBe('-a--b---c')
  })

  test('preserves alphanumeric characters', () => {
    expect(sanitizePath('abc123')).toBe('abc123')
  })

  test('colon becomes a hyphen', () => {
    expect(sanitizePath('C:')).toBe('C-')
  })
})

describe('desanitizePath', () => {
  test('POSIX round-trip', () => {
    expect(desanitizePath('-Users-foo-bar')).toBe('/Users/foo/bar')
  })

  test('Windows drive root reconstruction', () => {
    expect(desanitizePath('C--Users-foo')).toBe('C:\\Users\\foo')
  })

  test('Windows bare drive root', () => {
    expect(desanitizePath('C--')).toBe('C:\\')
  })
})

describe('normalizeDriveRootPathForPlatform', () => {
  test('no-op on POSIX', () => {
    expect(normalizeDriveRootPathForPlatform('C:', 'linux')).toBe('C:')
    expect(normalizeDriveRootPathForPlatform('/Users/foo', 'linux')).toBe('/Users/foo')
  })

  test('rewrites bare drive root on Windows', () => {
    expect(normalizeDriveRootPathForPlatform('C:', 'win32')).toBe('C:\\')
    expect(normalizeDriveRootPathForPlatform('Z:', 'win32')).toBe('Z:\\')
  })

  test('does not rewrite drive paths that already have a separator', () => {
    expect(normalizeDriveRootPathForPlatform('C:\\Users\\foo', 'win32')).toBe('C:\\Users\\foo')
  })
})

describe('isSameOrInsidePathForPlatform', () => {
  test('same path is true', () => {
    expect(isSameOrInsidePathForPlatform('/a/b', '/a/b', 'linux')).toBe(true)
  })

  test('child path is true', () => {
    expect(isSameOrInsidePathForPlatform('/a/b/c', '/a', 'linux')).toBe(true)
  })

  test('sibling path is false', () => {
    expect(isSameOrInsidePathForPlatform('/a/c', '/a/b', 'linux')).toBe(false)
  })

  test('Windows comparison is case-insensitive', () => {
    expect(isSameOrInsidePathForPlatform('C:\\Users\\Foo', 'c:\\users', 'win32')).toBe(true)
  })
})
