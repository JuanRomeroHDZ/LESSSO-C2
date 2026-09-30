import { describe, it, expect } from 'vitest'
import { detectCVEs } from '../utils/cve'

describe('detectCVEs', () => {
  it('detecta OpenSSH vulnerable (8.x / 9.0 / 9.1)', () => {
    expect(detectCVEs('ssh', 'OpenSSH 8.2p1')).toContainEqual(
      expect.objectContaining({ id: 'CVE-2023-38408', severity: 'critical' })
    )
  })

  it('detecta vsftpd 2.3.4 backdoor', () => {
    expect(detectCVEs('ftp', 'vsftpd 2.3.4')).toContainEqual(
      expect.objectContaining({ id: 'CVE-2011-2523', severity: 'high' })
    )
  })

  it('detecta MS17-010 (EternalBlue) en SMB + Windows antiguo', () => {
    expect(detectCVEs('microsoft-ds', 'Windows 7 Professional')).toContainEqual(
      expect.objectContaining({ id: 'MS17-010', severity: 'critical' })
    )
  })

  it('detecta Apache 2.4.49 path traversal', () => {
    expect(detectCVEs('http', 'Apache httpd 2.4.49')).toContainEqual(
      expect.objectContaining({ id: 'CVE-2021-41773', severity: 'high' })
    )
  })

  it('detecta ProFTPD 1.3.5', () => {
    expect(detectCVEs('ftp', 'ProFTPD 1.3.5')).toContainEqual(
      expect.objectContaining({ id: 'CVE-2015-3306', severity: 'high' })
    )
  })

  it('devuelve array vacío para servicio seguro', () => {
    expect(detectCVEs('ssh', 'OpenSSH 9.6')).toEqual([])
  })

  it('es case-insensitive', () => {
    expect(detectCVEs('SSH', 'OPENSSH 8.2')).toHaveLength(1)
  })

  it('maneja strings vacíos sin explotar', () => {
    expect(detectCVEs('', '')).toEqual([])
    expect(detectCVEs('ssh', '')).toEqual([])
  })
})
