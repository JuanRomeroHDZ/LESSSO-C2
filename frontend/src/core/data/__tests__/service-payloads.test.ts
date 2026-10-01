/**
 * Tests del dataset de payloads por servicio.
 *
 * Cubre:
 *   - Integridad de SERVICE_PAYLOADS
 *   - filterByService
 *   - searchServicePayloads
 *   - renderServicePayload
 *   - SERVICE_CATEGORIES (metadata)
 */

import { describe, it, expect } from 'vitest'
import {
  SERVICE_PAYLOADS,
  SERVICE_CATEGORIES,
  filterByService,
  searchServicePayloads,
  renderServicePayload,
  type ServicePayload,
} from '../service-payloads'

// ==========================================================
// Integridad del dataset
// ==========================================================
describe('SERVICE_PAYLOADS — integridad', () => {
  it('no está vacío', () => {
    expect(SERVICE_PAYLOADS.length).toBeGreaterThan(0)
  })

  it('todos los IDs son únicos', () => {
    const ids = SERVICE_PAYLOADS.map(p => p.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('todos tienen campos requeridos', () => {
    for (const p of SERVICE_PAYLOADS) {
      expect(p.id, `id en ${JSON.stringify(p)}`).toBeTruthy()
      expect(p.name, `name en ${p.id}`).toBeTruthy()
      expect(p.category, `category en ${p.id}`).toBeTruthy()
      expect(p.tool, `tool en ${p.id}`).toBeTruthy()
      expect(p.command, `command en ${p.id}`).toBeTruthy()
    }
  })

  it('cada category en SERVICE_CATEGORIES tiene al menos 1 payload', () => {
    for (const cat of Object.keys(SERVICE_CATEGORIES)) {
      const count = SERVICE_PAYLOADS.filter(p => p.category === cat).length
      expect(count, `categoría sin payloads: ${cat}`).toBeGreaterThan(0)
    }
  })
})

// ==========================================================
// filterByService
// ==========================================================
describe('filterByService', () => {
  it('"all" devuelve todo', () => {
    expect(filterByService('all')).toHaveLength(SERVICE_PAYLOADS.length)
  })

  it('"smb" devuelve solo SMB', () => {
    const out = filterByService('smb')
    expect(out.length).toBeGreaterThan(0)
    for (const p of out) expect(p.category).toBe('smb')
  })

  it('"ldap" devuelve solo LDAP', () => {
    const out = filterByService('ldap')
    expect(out.length).toBeGreaterThan(0)
    for (const p of out) expect(p.category).toBe('ldap')
  })

  it('"sql" devuelve solo SQL', () => {
    const out = filterByService('sql')
    expect(out.length).toBeGreaterThan(0)
    for (const p of out) expect(p.category).toBe('sql')
  })

  it('"redis" devuelve solo Redis', () => {
    const out = filterByService('redis')
    expect(out.length).toBeGreaterThan(0)
    for (const p of out) expect(p.category).toBe('redis')
  })

  it('"docker" devuelve solo Docker', () => {
    const out = filterByService('docker')
    expect(out.length).toBeGreaterThan(0)
    for (const p of out) expect(p.category).toBe('docker')
  })
})

// ==========================================================
// searchServicePayloads
// ==========================================================
describe('searchServicePayloads', () => {
  it('búsqueda vacía devuelve todo', () => {
    // Ojo: searchServicePayloads no filtra por "" como los otros.
    // Devuelve los que contienen "" → todos.
    const out = searchServicePayloads('')
    expect(out).toHaveLength(SERVICE_PAYLOADS.length)
  })

  it('encuentra por tool (crackmapexec)', () => {
    const out = searchServicePayloads('crackmapexec')
    expect(out.length).toBeGreaterThan(0)
  })

  it('encuentra por tag (kerberoast)', () => {
    const out = searchServicePayloads('kerberoast')
    expect(out.length).toBeGreaterThan(0)
  })

  it('encuentra por nombre (Pass-the-Hash)', () => {
    const out = searchServicePayloads('pass-the-hash')
    expect(out.length).toBeGreaterThan(0)
  })

  it('búsqueda sin resultados devuelve []', () => {
    expect(searchServicePayloads('zzzzzz_no_existe_zzzzzz')).toEqual([])
  })

  it('case-insensitive', () => {
    const a = searchServicePayloads('IMPAcket')
    const b = searchServicePayloads('impacket')
    expect(a.length).toBe(b.length)
    expect(a.length).toBeGreaterThan(0)
  })
})

// ==========================================================
// renderServicePayload
// ==========================================================
describe('renderServicePayload', () => {
  it('sustituye {TARGET}', () => {
    const p: ServicePayload = {
      id: 'test',
      name: 'Test',
      category: 'smb',
      tool: 'smbclient',
      command: 'smbclient -L //{TARGET}',
    }
    expect(renderServicePayload(p, { TARGET: '10.10.10.5' })).toBe(
      'smbclient -L //10.10.10.5'
    )
  })

  it('sustituye múltiples variables', () => {
    const p: ServicePayload = {
      id: 'test',
      name: 'Test',
      category: 'smb',
      tool: 'impacket-psexec',
      command: 'impacket-psexec {DOMAIN}/{USER}:{PASS}@{TARGET}',
    }
    const out = renderServicePayload(p, {
      DOMAIN: 'CORP',
      USER: 'admin',
      PASS: 'P@ssw0rd',
      TARGET: '10.0.0.1',
    })
    expect(out).toBe('impacket-psexec CORP/admin:P@ssw0rd@10.0.0.1')
  })

  it('sustituye múltiples ocurrencias del mismo placeholder', () => {
    const p: ServicePayload = {
      id: 'test',
      name: 'Test',
      category: 'smb',
      tool: 'x',
      command: '{TARGET}/{TARGET}',
    }
    expect(renderServicePayload(p, { TARGET: 'a' })).toBe('a/a')
  })

  it('no falla si falta una variable', () => {
    const p: ServicePayload = {
      id: 'test',
      name: 'Test',
      category: 'smb',
      tool: 'x',
      command: '{TARGET}/{MISSING}',
    }
    expect(renderServicePayload(p, { TARGET: 'x' })).toBe('x/{MISSING}')
  })

  it('renderiza comando multilínea', () => {
    const p: ServicePayload = {
      id: 'test',
      name: 'Test',
      category: 'redis',
      tool: 'redis-cli',
      command: 'redis-cli -h {TARGET}\nconfig set dir /var/www\nsave',
    }
    const out = renderServicePayload(p, { TARGET: '10.0.0.5' })
    expect(out).toContain('redis-cli -h 10.0.0.5')
    expect(out).toContain('config set dir /var/www')
    expect(out).toContain('save')
  })
})

// ==========================================================
// SERVICE_CATEGORIES — metadata
// ==========================================================
describe('SERVICE_CATEGORIES — metadata', () => {
  it('todas tienen label/icon/color', () => {
    for (const key of Object.keys(SERVICE_CATEGORIES) as Array<keyof typeof SERVICE_CATEGORIES>) {
      const meta = SERVICE_CATEGORIES[key]
      expect(meta.label).toBeTruthy()
      expect(meta.icon).toBeTruthy()
      expect(meta.color).toBeTruthy()
    }
  })

  it('contiene las categorías principales', () => {
    expect(SERVICE_CATEGORIES).toHaveProperty('smb')
    expect(SERVICE_CATEGORIES).toHaveProperty('ldap')
    expect(SERVICE_CATEGORIES).toHaveProperty('sql')
    expect(SERVICE_CATEGORIES).toHaveProperty('redis')
    expect(SERVICE_CATEGORIES).toHaveProperty('elastic')
    expect(SERVICE_CATEGORIES).toHaveProperty('docker')
    expect(SERVICE_CATEGORIES).toHaveProperty('kubernetes')
    expect(SERVICE_CATEGORIES).toHaveProperty('ssh')
    expect(SERVICE_CATEGORIES).toHaveProperty('ftp')
    expect(SERVICE_CATEGORIES).toHaveProperty('winrm')
    expect(SERVICE_CATEGORIES).toHaveProperty('jndi')
    expect(SERVICE_CATEGORIES).toHaveProperty('graphql')
    expect(SERVICE_CATEGORIES).toHaveProperty('cloud')
    expect(SERVICE_CATEGORIES).toHaveProperty('mongodb')
    expect(SERVICE_CATEGORIES).toHaveProperty('rmi')
    expect(SERVICE_CATEGORIES).toHaveProperty('jenkins')
    expect(SERVICE_CATEGORIES).toHaveProperty('tomcat')
  })
})

// ==========================================================
// Sanity checks
// ==========================================================
describe('SERVICE_PAYLOADS — sanity', () => {
  it('contiene impacket-psexec', () => {
    expect(SERVICE_PAYLOADS.some(p => p.tool === 'impacket-psexec')).toBe(true)
  })

  it('contiene al menos un payload de BloodHound', () => {
    expect(
      SERVICE_PAYLOADS.some(
        p => p.tool === 'bloodhound-python' || p.tool === 'sharphound.exe'
      )
    ).toBe(true)
  })

  it('contiene AWS metadata', () => {
    expect(
      SERVICE_PAYLOADS.some(
        p => p.category === 'cloud' && p.command.includes('169.254.169.254')
      )
    ).toBe(true)
  })

  it('contiene Docker escape', () => {
    expect(
      SERVICE_PAYLOADS.some(
        p => p.category === 'docker' && (p.tags || []).includes('escape')
      )
    ).toBe(true)
  })

  it('contiene al menos un payload de Jenkins', () => {
    expect(
      SERVICE_PAYLOADS.some(p => p.category === 'jenkins')
    ).toBe(true)
  })
})
