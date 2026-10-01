/**
 * Tests del dataset de payloads por vulnerabilidad.
 *
 * Cubre:
 *   - Integridad de VULN_PAYLOADS
 *   - filterByCategory
 *   - filterByNoise
 *   - searchVulnPayloads
 *   - renderVulnPayload
 *   - VULN_CATEGORIES (metadata)
 */

import { describe, it, expect } from 'vitest'
import {
  VULN_PAYLOADS,
  VULN_CATEGORIES,
  filterByCategory,
  filterByNoise,
  searchVulnPayloads,
  renderVulnPayload,
  type VulnPayload,
} from '../vuln-payloads'

// ==========================================================
// Integridad del dataset
// ==========================================================
describe('VULN_PAYLOADS — integridad', () => {
  it('no está vacío', () => {
    expect(VULN_PAYLOADS.length).toBeGreaterThan(0)
  })

  it('todos los IDs son únicos', () => {
    const ids = VULN_PAYLOADS.map(p => p.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('todos tienen campos requeridos', () => {
    for (const p of VULN_PAYLOADS) {
      expect(p.id, `id en ${JSON.stringify(p)}`).toBeTruthy()
      expect(p.name, `name en ${p.id}`).toBeTruthy()
      expect(p.category, `category en ${p.id}`).toBeTruthy()
      expect(p.noise, `noise en ${p.id}`).toBeTruthy()
      expect(p.payload, `payload en ${p.id}`).toBeTruthy()
    }
  })

  it('noise solo puede ser stealth/normal/noisy', () => {
    const allowed = new Set(['stealth', 'normal', 'noisy'])
    for (const p of VULN_PAYLOADS) {
      expect(allowed.has(p.noise), `noise inválido en ${p.id}: ${p.noise}`).toBe(true)
    }
  })

  it('cada category declarada en VULN_CATEGORIES tiene al menos 1 payload', () => {
    for (const cat of Object.keys(VULN_CATEGORIES)) {
      const count = VULN_PAYLOADS.filter(p => p.category === cat).length
      expect(count, `categoría sin payloads: ${cat}`).toBeGreaterThan(0)
    }
  })
})

// ==========================================================
// filterByCategory
// ==========================================================
describe('filterByCategory', () => {
  it('"all" devuelve todo', () => {
    expect(filterByCategory('all')).toHaveLength(VULN_PAYLOADS.length)
  })

  it('"sqli" devuelve solo SQLi', () => {
    const out = filterByCategory('sqli')
    expect(out.length).toBeGreaterThan(0)
    for (const p of out) expect(p.category).toBe('sqli')
  })

  it('"xss" devuelve solo XSS', () => {
    const out = filterByCategory('xss')
    expect(out.length).toBeGreaterThan(0)
    for (const p of out) expect(p.category).toBe('xss')
  })

  it('"lfi" devuelve solo LFI', () => {
    const out = filterByCategory('lfi')
    expect(out.length).toBeGreaterThan(0)
    for (const p of out) expect(p.category).toBe('lfi')
  })

  it('"ssti" devuelve solo SSTI', () => {
    const out = filterByCategory('ssti')
    expect(out.length).toBeGreaterThan(0)
    for (const p of out) expect(p.category).toBe('ssti')
  })
})

// ==========================================================
// filterByNoise
// ==========================================================
describe('filterByNoise', () => {
  it('"all" devuelve todo', () => {
    expect(filterByNoise('all')).toHaveLength(VULN_PAYLOADS.length)
  })

  it('"stealth" solo devuelve stealth', () => {
    const out = filterByNoise('stealth')
    for (const p of out) expect(p.noise).toBe('stealth')
  })

  it('"noisy" solo devuelve noisy', () => {
    const out = filterByNoise('noisy')
    for (const p of out) expect(p.noise).toBe('noisy')
  })

  it('"normal" solo devuelve normal', () => {
    const out = filterByNoise('normal')
    for (const p of out) expect(p.noise).toBe('normal')
  })
})

// ==========================================================
// searchVulnPayloads
// ==========================================================
describe('searchVulnPayloads', () => {
  it('búsqueda vacía devuelve todo', () => {
    expect(searchVulnPayloads('')).toHaveLength(VULN_PAYLOADS.length)
  })

  it('encuentra por nombre (case-insensitive)', () => {
    const out = searchVulnPayloads('UNION')
    expect(out.length).toBeGreaterThan(0)
    for (const p of out) {
      const hay = [
        p.name,
        p.payload,
        ...(p.tags || []),
        p.description || '',
      ].join(' ').toLowerCase()
      expect(hay).toContain('union')
    }
  })

  it('encuentra por tag', () => {
    const out = searchVulnPayloads('log4shell')
    expect(out.length).toBeGreaterThan(0)
  })

  it('búsqueda sin resultados devuelve []', () => {
    const out = searchVulnPayloads('zzzzzz_no_existe_zzzzzz')
    expect(out).toEqual([])
  })

  it('búsqueda por payload (fragmento)', () => {
    const out = searchVulnPayloads('SLEEP(5)')
    expect(out.length).toBeGreaterThan(0)
  })
})

// ==========================================================
// renderVulnPayload
// ==========================================================
describe('renderVulnPayload', () => {
  it('sustituye {COLLAB}', () => {
    const p: VulnPayload = {
      id: 'test',
      name: 'Test',
      category: 'xss',
      noise: 'normal',
      payload: 'http://{COLLAB}/x',
    }
    expect(renderVulnPayload(p, { COLLAB: 'abc.oastify.com' })).toBe(
      'http://abc.oastify.com/x'
    )
  })

  it('sustituye múltiples placeholders', () => {
    const p: VulnPayload = {
      id: 'test',
      name: 'Test',
      category: 'sqli',
      noise: 'noisy',
      payload: '{PARAM} = {TARGET} & {COLLAB}',
    }
    const out = renderVulnPayload(p, {
      PARAM: 'id',
      TARGET: 'http://x.com',
      COLLAB: 'y.oastify.com',
    })
    expect(out).toBe('id = http://x.com & y.oastify.com')
  })

  it('sustituye múltiples ocurrencias del mismo placeholder', () => {
    const p: VulnPayload = {
      id: 'test',
      name: 'Test',
      category: 'ssrf',
      noise: 'normal',
      payload: '{COLLAB}/{COLLAB}',
    }
    expect(renderVulnPayload(p, { COLLAB: 'z' })).toBe('z/z')
  })

  it('no falla si falta una variable', () => {
    const p: VulnPayload = {
      id: 'test',
      name: 'Test',
      category: 'xss',
      noise: 'normal',
      payload: '{COLLAB}/x',
    }
    // Sin COLLAB en vars → se queda tal cual
    expect(renderVulnPayload(p, {})).toBe('{COLLAB}/x')
  })
})

// ==========================================================
// VULN_CATEGORIES — metadata
// ==========================================================
describe('VULN_CATEGORIES — metadata', () => {
  it('todas las categorías tienen label/icon/color', () => {
    for (const key of Object.keys(VULN_CATEGORIES) as Array<keyof typeof VULN_CATEGORIES>) {
      const meta = VULN_CATEGORIES[key]
      expect(meta.label).toBeTruthy()
      expect(meta.icon).toBeTruthy()
      expect(meta.color).toBeTruthy()
    }
  })

  it('contiene las categorías principales', () => {
    expect(VULN_CATEGORIES).toHaveProperty('sqli')
    expect(VULN_CATEGORIES).toHaveProperty('xss')
    expect(VULN_CATEGORIES).toHaveProperty('lfi')
    expect(VULN_CATEGORIES).toHaveProperty('rfi')
    expect(VULN_CATEGORIES).toHaveProperty('ssti')
    expect(VULN_CATEGORIES).toHaveProperty('xxe')
    expect(VULN_CATEGORIES).toHaveProperty('ssrf')
    expect(VULN_CATEGORIES).toHaveProperty('cmdi')
    expect(VULN_CATEGORIES).toHaveProperty('nosqli')
    expect(VULN_CATEGORIES).toHaveProperty('ldapi')
    expect(VULN_CATEGORIES).toHaveProperty('crlf')
    expect(VULN_CATEGORIES).toHaveProperty('openredirect')
    expect(VULN_CATEGORIES).toHaveProperty('prototype')
    expect(VULN_CATEGORIES).toHaveProperty('deserialization')
  })
})

// ==========================================================
// Sanity: payloads concretos que sabemos que existen
// ==========================================================
describe('VULN_PAYLOADS — sanity', () => {
  it('contiene al menos un auth-bypass SQLi', () => {
    const out = VULN_PAYLOADS.filter(
      p => p.category === 'sqli' && (p.tags || []).includes('auth')
    )
    expect(out.length).toBeGreaterThan(0)
  })

  it('contiene al menos un Jinja2 RCE', () => {
    expect(
      VULN_PAYLOADS.some(
        p => p.category === 'ssti' && (p.tags || []).includes('jinja2')
      )
    ).toBe(true)
  })

  it('contiene al menos un Log4Shell / JNDI', () => {
    expect(
      VULN_PAYLOADS.some(p =>
        (p.tags || []).some(t => t === 'log4shell' || t === 'jndi')
      )
    ).toBe(true)
  })

  it('contiene payloads OOB (out-of-band)', () => {
    const oob = VULN_PAYLOADS.filter(p => (p.tags || []).includes('oob'))
    expect(oob.length).toBeGreaterThan(0)
  })
})
