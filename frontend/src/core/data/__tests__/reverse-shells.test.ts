/**
 * Tests de los datasets de reverse shells.
 *
 * Cubre:
 *   - renderShell (sustitución de placeholders)
 *   - filterShellsByPlatform
 *   - groupShellsByPlatform
 *   - countShellsByPlatform
 *   - getPlatformMeta
 *   - Integridad de REVERSE_SHELLS (sin IDs duplicados, campos requeridos)
 */

import { describe, it, expect } from 'vitest'
import {
  REVERSE_SHELLS,
  renderShell,
  filterShellsByPlatform,
  groupShellsByPlatform,
  countShellsByPlatform,
  getPlatformMeta,
  PLATFORM_META,
  type ReverseShell,
} from '../reverse-shells'

// ==========================================================
// Helpers
// ==========================================================
function findByTags(tags: string[]): ReverseShell[] {
  return REVERSE_SHELLS.filter(s =>
    tags.every(t => (s.tags || []).includes(t))
  )
}

function findById(id: string): ReverseShell {
  const s = REVERSE_SHELLS.find(x => x.id === id)
  if (!s) throw new Error(`Shell no encontrado: ${id}`)
  return s
}

// ==========================================================
// Integridad del dataset
// ==========================================================
describe('REVERSE_SHELLS — integridad', () => {
  it('no está vacío', () => {
    expect(REVERSE_SHELLS.length).toBeGreaterThan(0)
  })

  it('todos los IDs son únicos', () => {
    const ids = REVERSE_SHELLS.map(s => s.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('todos los shells tienen campos requeridos', () => {
    for (const s of REVERSE_SHELLS) {
      expect(s.id, `id en ${JSON.stringify(s)}`).toBeTruthy()
      expect(s.name, `name en ${s.id}`).toBeTruthy()
      expect(s.platform, `platform en ${s.id}`).toBeTruthy()
      expect(s.type, `type en ${s.id}`).toBeTruthy()
      expect(s.payload, `payload en ${s.id}`).toBeTruthy()
    }
  })

  it('contiene al menos un shell de cada plataforma principal', () => {
    const platforms = new Set(REVERSE_SHELLS.map(s => s.platform))
    expect(platforms.has('linux')).toBe(true)
    expect(platforms.has('windows')).toBe(true)
    expect(platforms.has('macos')).toBe(true)
    expect(platforms.has('web')).toBe(true)
  })

  it('contiene payloads de Metasploit (type=msf)', () => {
    const msf = REVERSE_SHELLS.filter(s => s.type === 'msf')
    expect(msf.length).toBeGreaterThan(0)
  })
})

// ==========================================================
// renderShell
// ==========================================================
describe('renderShell', () => {
  it('sustituye {LHOST} y {LPORT}', () => {
    const shell = findById('bash-tcp')
    const out = renderShell(shell, '10.10.14.5', '4444')
    expect(out).toContain('10.10.14.5')
    expect(out).toContain('4444')
    expect(out).not.toContain('{LHOST}')
    expect(out).not.toContain('{LPORT}')
  })

  it('sustituye múltiples ocurrencias', () => {
    // socat usa {LHOST} y {LPORT} una vez cada uno, pero verifiquemos
    // con un payload sintético que tenga duplicados.
    const fake: ReverseShell = {
      id: 'test',
      name: 'Test',
      platform: 'linux',
      type: 'reverse',
      payload: 'connect {LHOST}:{LPORT} then {LHOST}:{LPORT} again',
    }
    const out = renderShell(fake, '1.2.3.4', '9999')
    expect(out).toBe('connect 1.2.3.4:9999 then 1.2.3.4:9999 again')
  })

  it('no sustituye si no hay placeholders', () => {
    const fake: ReverseShell = {
      id: 'test',
      name: 'Test',
      platform: 'linux',
      type: 'reverse',
      payload: 'echo hello',
    }
    expect(renderShell(fake, 'x', 'y')).toBe('echo hello')
  })

  it('renderiza correctamente el shell de Python3', () => {
    const shell = findById('python3')
    const out = renderShell(shell, '10.0.0.1', '1337')
    expect(out).toContain('"10.0.0.1"')
    expect(out).toContain('1337')
  })
})

// ==========================================================
// filterShellsByPlatform
// ==========================================================
describe('filterShellsByPlatform', () => {
  it('"all" devuelve todos', () => {
    expect(filterShellsByPlatform('all')).toHaveLength(REVERSE_SHELLS.length)
  })

  it('"msf" devuelve solo type=msf', () => {
    const out = filterShellsByPlatform('msf')
    expect(out.length).toBeGreaterThan(0)
    for (const s of out) {
      expect(s.type).toBe('msf')
    }
  })

  it('"linux" devuelve solo platform=linux y no msf', () => {
    const out = filterShellsByPlatform('linux')
    expect(out.length).toBeGreaterThan(0)
    for (const s of out) {
      expect(s.platform).toBe('linux')
      expect(s.type).not.toBe('msf')
    }
  })

  it('"windows" no incluye msf', () => {
    const out = filterShellsByPlatform('windows')
    for (const s of out) {
      expect(s.platform).toBe('windows')
      expect(s.type).not.toBe('msf')
    }
  })
})

// ==========================================================
// groupShellsByPlatform
// ==========================================================
describe('groupShellsByPlatform', () => {
  it('devuelve todas las keys esperadas', () => {
    const groups = groupShellsByPlatform()
    expect(groups).toHaveProperty('linux')
    expect(groups).toHaveProperty('windows')
    expect(groups).toHaveProperty('macos')
    expect(groups).toHaveProperty('web')
    expect(groups).toHaveProperty('other')
    expect(groups).toHaveProperty('msf')
  })

  it('la suma de grupos = total de shells', () => {
    const groups = groupShellsByPlatform()
    const total = Object.values(groups).reduce((acc, arr) => acc + arr.length, 0)
    expect(total).toBe(REVERSE_SHELLS.length)
  })

  it('los msf solo están en el grupo "msf"', () => {
    const groups = groupShellsByPlatform()
    for (const s of groups.msf) {
      expect(s.type).toBe('msf')
    }
    for (const key of ['linux', 'windows', 'macos', 'web', 'other'] as const) {
      for (const s of groups[key]) {
        expect(s.type).not.toBe('msf')
      }
    }
  })
})

// ==========================================================
// countShellsByPlatform
// ==========================================================
describe('countShellsByPlatform', () => {
  it('suma de conteos = total', () => {
    const counts = countShellsByPlatform()
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    expect(total).toBe(REVERSE_SHELLS.length)
  })

  it('tiene key "msf" con al menos 1', () => {
    const counts = countShellsByPlatform()
    expect(counts.msf).toBeGreaterThan(0)
  })
})

// ==========================================================
// getPlatformMeta
// ==========================================================
describe('getPlatformMeta', () => {
  it('devuelve la meta correcta para cada plataforma conocida', () => {
    for (const key of Object.keys(PLATFORM_META) as Array<keyof typeof PLATFORM_META>) {
      const meta = getPlatformMeta(key as any)
      expect(meta).toEqual(PLATFORM_META[key])
    }
  })

  it('fallback a "other" si la plataforma no existe', () => {
    const meta = getPlatformMeta('does-not-exist' as any)
    expect(meta).toEqual(PLATFORM_META.other)
  })

  it('PLATFORM_META tiene label, icon y color', () => {
    for (const key of Object.keys(PLATFORM_META) as Array<keyof typeof PLATFORM_META>) {
      expect(PLATFORM_META[key].label).toBeTruthy()
      expect(PLATFORM_META[key].icon).toBeTruthy()
      expect(PLATFORM_META[key].color).toBeTruthy()
    }
  })
})

// ==========================================================
// Sanity checks con tags comunes
// ==========================================================
describe('REVERSE_SHELLS — sanity por tags', () => {
  it('existe al menos un shell "bash"', () => {
    expect(findByTags(['bash']).length).toBeGreaterThan(0)
  })

  it('existe al menos un shell "powershell"', () => {
    expect(findByTags(['powershell']).length).toBeGreaterThan(0)
  })

  it('existe al menos un shell "nc" / "netcat"', () => {
    const nc = REVERSE_SHELLS.filter(s =>
      (s.tags || []).some(t => t === 'nc' || t === 'netcat' || t === 'ncat')
    )
    expect(nc.length).toBeGreaterThan(0)
  })

  it('existe "socat"', () => {
    expect(REVERSE_SHELLS.some(s => s.id === 'socat')).toBe(true)
  })
})
