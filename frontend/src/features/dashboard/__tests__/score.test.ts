import { describe, it, expect } from 'vitest'
import { calculateScore } from '../utils/score'
import type { HostInfo } from '../../../core/store/useScanStore'

function makeHost(partial: Partial<HostInfo>): HostInfo {
  return {
    ip: '10.0.0.1',
    mac: '',
    mac_vendor: '',
    status: 'up',
    os: '',
    ports: [],
    ...partial,
  }
}

describe('calculateScore', () => {
  it('host sin puertos = score 100, grade A', () => {
    const result = calculateScore(makeHost({}))
    expect(result.score).toBe(100)
    expect(result.grade).toBe('A')
    expect(result.vulns).toBe(0)
  })

  it('puerto crítico abierto baja el score', () => {
    const host = makeHost({
      ports: [{ portid: '22', protocol: 'tcp', state: 'open', reason: '', service: '', version: '' }],
    })
    const result = calculateScore(host)
    // -5 por puerto abierto, -15 por puerto crítico (22)
    expect(result.score).toBe(80)
    expect(result.grade).toBe('B')
  })

  it('CVE crítico baja 40 puntos extra', () => {
    const host = makeHost({
      ports: [{
        portid: '22', protocol: 'tcp', state: 'open', reason: '',
        service: 'ssh', version: 'OpenSSH 8.2p1',
      }],
    })
    const result = calculateScore(host)
    // -5 (open) -15 (port crítico) -40 (CVE-2023-38408) = 40
    expect(result.score).toBe(40)
    expect(result.grade).toBe('D')
    expect(result.vulns).toBe(1)
  })

  it('el score nunca baja de 0', () => {
    const host = makeHost({
      ports: Array.from({ length: 20 }, (_, i) => ({
        portid: String(22 + i),
        protocol: 'tcp',
        state: 'open',
        reason: '',
        service: 'ssh',
        version: 'OpenSSH 8.2p1',
      })),
    })
    expect(calculateScore(host).score).toBe(0)
    expect(calculateScore(host).grade).toBe('F')
  })

  it('puertos cerrados/filtrados no afectan el score', () => {
    const host = makeHost({
      ports: [
        { portid: '22', protocol: 'tcp', state: 'closed', reason: '', service: '', version: '' },
        { portid: '80', protocol: 'tcp', state: 'filtered', reason: '', service: '', version: '' },
      ],
    })
    expect(calculateScore(host).score).toBe(100)
  })
})
