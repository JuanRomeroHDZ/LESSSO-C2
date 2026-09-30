import { describe, it, expect } from 'vitest'

/**
 * Tests de las operaciones criptográficas de DecodersTool.
 *
 * NOTA ARQUITECTÓNICA:
 * `applyOp` vive dentro de DecodersTool.tsx porque es una función pura
 * pero no se exporta. Para testearla sin acoplarnos al componente, aquí
 * reimplementamos solo las ops que queremos verificar. Cuando en una
 * fase futura extraigamos `applyOp` a `utils/crypto.ts`, este archivo
 * cambiará de un import directo a un import desde el módulo.
 *
 * Regla: si tocas `applyOp` en DecodersTool.tsx, actualiza también
 * esta copia, o extrae la función a utils.
 */

type EncodeOp =
  | 'b64_encode' | 'b64_decode'
  | 'url_encode' | 'url_decode'
  | 'hex_encode' | 'hex_decode'
  | 'rot13'
  | 'html_encode' | 'html_decode'
  | 'binary_encode' | 'binary_decode'
  | 'base32_encode' | 'base32_decode'
  | 'unicode_encode' | 'unicode_decode'

function base32Encode(input: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bytes = new TextEncoder().encode(input)
  let bits = ''
  for (const b of bytes) bits += b.toString(2).padStart(8, '0')
  while (bits.length % 5 !== 0) bits += '0'
  let out = ''
  for (let i = 0; i < bits.length; i += 5) out += alphabet[parseInt(bits.slice(i, i + 5), 2)]
  while (out.length % 8 !== 0) out += '='
  return out
}

function base32Decode(input: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = input.replace(/=+$/, '').toUpperCase()
  let bits = ''
  for (const c of clean) {
    const idx = alphabet.indexOf(c)
    if (idx === -1) continue
    bits += idx.toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return new TextDecoder().decode(new Uint8Array(bytes))
}

function applyOp(input: string, op: EncodeOp): string {
  try {
    switch (op) {
      case 'b64_encode':     return btoa(unescape(encodeURIComponent(input)))
      case 'b64_decode':     return decodeURIComponent(escape(atob(input)))
      case 'url_encode':     return encodeURIComponent(input)
      case 'url_decode':     return decodeURIComponent(input)
      case 'hex_encode':     return Array.from(input).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
      case 'hex_decode':     return input.replace(/[^0-9a-fA-F]/g, '').match(/.{1,2}/g)?.map(b => String.fromCharCode(parseInt(b, 16))).join('') ?? ''
      case 'html_encode':    return input.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))
      case 'html_decode':    return input.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, m => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' }[m] || m))
      case 'binary_encode':  return Array.from(input).map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ')
      case 'binary_decode':  return input.split(/\s+/).filter(b => /^[01]+$/.test(b)).map(b => String.fromCharCode(parseInt(b, 2))).join('')
      case 'base32_encode':  return base32Encode(input)
      case 'base32_decode':  return base32Decode(input)
      case 'unicode_encode': return Array.from(input).map(c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join('')
      case 'unicode_decode': return input.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      case 'rot13':          return input.replace(/[a-zA-Z]/g, c => String.fromCharCode((c <= 'Z' ? 90 : 122) >= c.charCodeAt(0) + 13 ? c.charCodeAt(0) + 13 : c.charCodeAt(0) - 13))
    }
  } catch (err) {
    return `ERROR: ${err instanceof Error ? err.message : 'operación inválida'}`
  }
}

describe('DecodersTool — applyOp', () => {
  describe('Base64', () => {
    it('encode/decode ASCII', () => {
      const enc = applyOp('hello world', 'b64_encode')
      expect(enc).toBe('aGVsbG8gd29ybGQ=')
      expect(applyOp(enc, 'b64_decode')).toBe('hello world')
    })
    it('encode/decode UTF-8 con acentos', () => {
      const original = 'ñandú, José, 日本語'
      const enc = applyOp(original, 'b64_encode')
      expect(applyOp(enc, 'b64_decode')).toBe(original)
    })
    it('decode de input inválido devuelve ERROR', () => {
      expect(applyOp('!!!not-base64!!!', 'b64_decode')).toMatch(/^ERROR:/)
    })
  })

  describe('URL', () => {
    it('encode/decode', () => {
      const enc = applyOp('a b&c=d', 'url_encode')
      expect(enc).toBe('a%20b%26c%3Dd')
      expect(applyOp(enc, 'url_decode')).toBe('a b&c=d')
    })
  })

  describe('Hex', () => {
    it('encode/decode', () => {
      expect(applyOp('AB', 'hex_encode')).toBe('4142')
      expect(applyOp('4142', 'hex_decode')).toBe('AB')
    })
  })

  describe('HTML', () => {
    it('encode de los 5 caracteres peligrosos', () => {
      expect(applyOp('<script>alert("x&y")</script>', 'html_encode'))
        .toBe('&lt;script&gt;alert(&quot;x&amp;y&quot;)&lt;/script&gt;')
    })
    it('round-trip', () => {
      const original = '<a href="x">A & B</a>'
      expect(applyOp(applyOp(original, 'html_encode'), 'html_decode')).toBe(original)
    })
  })

  describe('Binario', () => {
    it('encode/decode', () => {
      expect(applyOp('A', 'binary_encode')).toBe('01000001')
      expect(applyOp('01000001', 'binary_decode')).toBe('A')
    })
  })

  describe('Base32', () => {
    it('encode/decode ASCII', () => {
      const enc = applyOp('hello', 'base32_encode')
      expect(enc).toBe('NBSWY3DP')
      expect(applyOp(enc, 'base32_decode')).toBe('hello')
    })
    it('round-trip con UTF-8', () => {
      const original = 'ñandú'
      expect(applyOp(applyOp(original, 'base32_encode'), 'base32_decode')).toBe(original)
    })
  })

  describe('Unicode escape', () => {
    it('encode/decode', () => {
      expect(applyOp('A', 'unicode_encode')).toBe('\\u0041')
      expect(applyOp('\\u0041\\u0042', 'unicode_decode')).toBe('AB')
    })
  })

  describe('ROT13', () => {
    it('rotación simétrica', () => {
      expect(applyOp('Hello', 'rot13')).toBe('Uryyb')
      expect(applyOp(applyOp('Hello, World!', 'rot13'), 'rot13')).toBe('Hello, World!')
    })
    it('no afecta números ni símbolos', () => {
      expect(applyOp('123!@#', 'rot13')).toBe('123!@#')
    })
  })
})
