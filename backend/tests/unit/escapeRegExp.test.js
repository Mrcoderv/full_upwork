import { describe, it, expect, vi, beforeEach } from 'vitest'
import { escapeRegExp } from '../../src/utils/escapeRegExp.js'

describe('escapeRegExp', () => {
  it('escapes dots', () => {
    expect(escapeRegExp('a.b')).toBe('a\\.b')
  })

  it('escapes asterisks', () => {
    expect(escapeRegExp('a*b')).toBe('a\\*b')
  })

  it('escapes plus signs', () => {
    expect(escapeRegExp('a+b')).toBe('a\\+b')
  })

  it('escapes question marks', () => {
    expect(escapeRegExp('a?b')).toBe('a\\?b')
  })

  it('escapes caret', () => {
    expect(escapeRegExp('a^b')).toBe('a\\^b')
  })

  it('escapes dollar signs', () => {
    expect(escapeRegExp('a$b')).toBe('a\\$b')
  })

  it('escapes curly braces', () => {
    expect(escapeRegExp('a{b}')).toBe('a\\{b\\}')
  })

  it('escapes parentheses', () => {
    expect(escapeRegExp('a(b)c')).toBe('a\\(b\\)c')
  })

  it('escapes pipe', () => {
    expect(escapeRegExp('a|b')).toBe('a\\|b')
  })

  it('escapes square brackets', () => {
    expect(escapeRegExp('a[b]')).toBe('a\\[b\\]')
  })

  it('escapes backslash', () => {
    expect(escapeRegExp('a\\b')).toBe('a\\\\b')
  })

  it('leaves normal text unescaped', () => {
    expect(escapeRegExp('hello world')).toBe('hello world')
  })

  it('leaves alphanumerics unescaped', () => {
    expect(escapeRegExp('abc123')).toBe('abc123')
  })

  it('handles empty string', () => {
    expect(escapeRegExp('')).toBe('')
  })

  it('handles ReDoS payload safely', () => {
    const malicious = '(a+)+b'
    const escaped = escapeRegExp(malicious)
    const regex = new RegExp(escaped)
    expect(regex.test('(a+)+b')).toBe(true)
    expect(regex.test('aaab')).toBe(false)
  })

  it('coerces non-string input', () => {
    expect(escapeRegExp(123)).toBe('123')
    expect(escapeRegExp(null)).toBe('null')
    expect(escapeRegExp(undefined)).toBe('undefined')
  })
})
