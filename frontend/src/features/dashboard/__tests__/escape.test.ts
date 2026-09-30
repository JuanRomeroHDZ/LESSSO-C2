import { describe, it, expect } from 'vitest'
import { escapeHtml, escapeMdCell, escapeMdCode, escapeMdInline } from '../utils/escape'

describe('escapeHtml', () => {
  it('escapa los 6 caracteres peligrosos', () => {
    expect(escapeHtml('<script>alert("x&y\'z`")</script>'))
      .toBe('&lt;script&gt;alert(&quot;x&amp;y&#39;z&#96;&quot;)&lt;/script&gt;')
  })
  it('maneja null y undefined', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })
  it('convierte números a string', () => {
    expect(escapeHtml(42)).toBe('42')
  })
})

describe('escapeMdCell', () => {
  it('escapa pipes', () => {
    expect(escapeMdCell('a|b|c')).toBe('a\\|b\\|c')
  })
  it('convierte saltos de línea a espacios', () => {
    expect(escapeMdCell('line1\nline2\r\nline3')).toBe('line1 line2 line3')
  })
  it('escapa backticks', () => {
    expect(escapeMdCell('a`b')).toBe("a'b")
  })
  it('null/undefined devuelven "-"', () => {
    expect(escapeMdCell(null)).toBe('-')
    expect(escapeMdCell(undefined)).toBe('-')
  })
})

describe('escapeMdCode', () => {
  it('neutraliza triple backtick', () => {
    expect(escapeMdCode('```bash\nls\n```')).toBe("'''bash\nls\n'''")
  })
  it('null/undefined devuelven ""', () => {
    expect(escapeMdCode(null)).toBe('')
    expect(escapeMdCode(undefined)).toBe('')
  })
})

describe('escapeMdInline', () => {
  it('escapa backtick simple', () => {
    expect(escapeMdInline('a`b`c')).toBe("a'b'c")
  })
  it('null/undefined devuelven "-"', () => {
    expect(escapeMdInline(null)).toBe('-')
    expect(escapeMdInline(undefined)).toBe('-')
  })
})
