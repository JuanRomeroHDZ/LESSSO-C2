/**
 * Tests del scanStore.
 *
 * Cubre:
 *   - normalizeTarget
 *   - sanitizeHosts (a través de las acciones del store)
 *   - buildNmapArgs (a través de getNmapArgs y syncCommandString)
 *   - Acciones del store: setTarget, setScanType, toggleOSDetection,
 *     applyProfile, saveCustomProfile, setParsedData, updateHost,
 *     importWorkspace, setPortCves, setHostCves, clearOutput, clearHistory
 *   - onRehydrateStorage (saneamiento de localStorage corrupto)
 *   - getNmapArgs (diferencia entre nmap y rustscan)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useScanStoreLocal } from '../scanStore'
import type { HostInfo } from '../scanStore'

// ==========================================================
// Helpers
// ==========================================================
function resetStore() {
  useScanStoreLocal.setState({
    target: '',
    scanType: 'syn',
    timing: 4,
    excludeTargets: '',
    topPorts: '',
    customPorts: '',
    fastMode: false,
    discoveryMode: '',
    minRate: '',
    maxRetries: '',
    networkInterface: '',
    aggressiveMode: false,
    traceroute: false,
    reason: false,
    packetTrace: false,
    minParallelism: '',
    maxParallelism: '',
    dnsResolution: '',
    hostTimeout: '',
    scanDelay: '',
    useOSDetection: false,
    maxOsTries: '',
    useServiceDetection: false,
    versionIntensity: '',
    useIPv6: false,
    scanAllPorts: false,
    nseCategory: '',
    nseArgs: '',
    isVerbose: false,
    evasionFrag: false,
    evasionMTU: '',
    evasionDecoy: '',
    evasionMac: '',
    evasionSourcePort: '',
    evasionSpoofIp: '',
    badsum: false,
    randomizeHosts: false,
    zombieIp: '',
    ftpBounce: '',
    customTcpFlags: '',
    proxies: '',
    customDns: '',
    dataString: '',
    dataHex: '',
    dataLength: '',
    commandString: 'nmap -sS -T4',
    isScanning: false,
    output: [],
    parsedData: [],
    historyData: [],
    progressText: '',
    scanDuration: '0s',
    savedProfiles: [],
    autoScanInterval: 0,
    onlyOpenPorts: false,
    osScanGuess: false,
    scriptDefault: false,
    minHostgroup: '',
    maxHostgroup: '',
    nmapOutputFormat: '',
    nmapOutputPrefix: 'lessso_scan',
    nmapOutputDir: '',
    useRustScan: false,
  })
}

beforeEach(() => {
  resetStore()
})

// ==========================================================
// Estado inicial
// ==========================================================
describe('scanStore — estado inicial', () => {
  it('arranca con target vacío', () => {
    expect(useScanStoreLocal.getState().target).toBe('')
  })

  it('arranca con scanType syn', () => {
    expect(useScanStoreLocal.getState().scanType).toBe('syn')
  })

  it('arranca con timing 4', () => {
    expect(useScanStoreLocal.getState().timing).toBe(4)
  })

  it('arranca sin parsedData', () => {
    expect(useScanStoreLocal.getState().parsedData).toEqual([])
  })
})

// ==========================================================
// setTarget / normalizeTarget
// ==========================================================
describe('setTarget', () => {
  it('normaliza espacios múltiples', () => {
    useScanStoreLocal.getState().setTarget('  10.10.10.1    10.10.10.2  ')
    expect(useScanStoreLocal.getState().target).toBe('10.10.10.1 10.10.10.2')
  })

  it('quita espacios al inicio/fin', () => {
    useScanStoreLocal.getState().setTarget('   10.0.0.1   ')
    expect(useScanStoreLocal.getState().target).toBe('10.0.0.1')
  })

  it('actualiza commandString', () => {
    useScanStoreLocal.getState().setTarget('10.10.10.1')
    expect(useScanStoreLocal.getState().commandString).toContain('10.10.10.1')
  })

  it('target vacío no rompe', () => {
    useScanStoreLocal.getState().setTarget('')
    expect(useScanStoreLocal.getState().target).toBe('')
  })
})

// ==========================================================
// setScanType
// ==========================================================
describe('setScanType', () => {
  it('cambia a tcp', () => {
    useScanStoreLocal.getState().setScanType('tcp')
    expect(useScanStoreLocal.getState().scanType).toBe('tcp')
  })

  it('cambia a ping y limpia flags incompatibles', () => {
    useScanStoreLocal.setState({
      useOSDetection: true,
      useServiceDetection: true,
      scanAllPorts: true,
      customPorts: '80,443',
      aggressiveMode: true,
    })
    useScanStoreLocal.getState().setScanType('ping')
    const s = useScanStoreLocal.getState()
    expect(s.scanType).toBe('ping')
    expect(s.useOSDetection).toBe(false)
    expect(s.useServiceDetection).toBe(false)
    expect(s.scanAllPorts).toBe(false)
    expect(s.customPorts).toBe('')
    expect(s.aggressiveMode).toBe(false)
  })

  it('ping actualiza commandString con -sn', () => {
    useScanStoreLocal.getState().setScanType('ping')
    expect(useScanStoreLocal.getState().commandString).toContain('-sn')
  })
})

// ==========================================================
// getNmapArgs (buildNmapArgs)
// ==========================================================
describe('getNmapArgs', () => {
  it('incluye -sS por defecto', () => {
    const args = useScanStoreLocal.getState().getNmapArgs()
    expect(args).toContain('-sS')
  })

  it('incluye -T4 por defecto', () => {
    const args = useScanStoreLocal.getState().getNmapArgs()
    expect(args).toContain('-T4')
  })

  it('incluye --stats-every=5s por defecto', () => {
    const args = useScanStoreLocal.getState().getNmapArgs()
    expect(args).toContain('--stats-every=5s')
  })

  it('añade -sV si useServiceDetection', () => {
    useScanStoreLocal.setState({ useServiceDetection: true })
    const args = useScanStoreLocal.getState().getNmapArgs()
    expect(args).toContain('-sV')
  })

  it('añade -O si useOSDetection y no aggressiveMode', () => {
    useScanStoreLocal.setState({ useOSDetection: true })
    const args = useScanStoreLocal.getState().getNmapArgs()
    expect(args).toContain('-O')
  })

  it('no añade -O si aggressiveMode (ya incluye -A)', () => {
    useScanStoreLocal.setState({ useOSDetection: true, aggressiveMode: true })
    const args = useScanStoreLocal.getState().getNmapArgs()
    expect(args).not.toContain('-O')
    expect(args).toContain('-A')
  })

  it('añade -6 si useIPv6', () => {
    useScanStoreLocal.setState({ useIPv6: true })
    const args = useScanStoreLocal.getState().getNmapArgs()
    expect(args).toContain('-6')
  })

  it('añade --top-ports si topPorts', () => {
    useScanStoreLocal.setState({ topPorts: '1000' })
    const args = useScanStoreLocal.getState().getNmapArgs()
    expect(args).toContain('--top-ports')
    expect(args).toContain('1000')
  })

  it('añade -p si customPorts', () => {
    useScanStoreLocal.setState({ customPorts: '80,443' })
    const args = useScanStoreLocal.getState().getNmapArgs()
    expect(args).toContain('-p')
    expect(args).toContain('80,443')
  })

  it('quita --stats-every=5s si useRustScan', () => {
    useScanStoreLocal.setState({ useRustScan: true })
    const args = useScanStoreLocal.getState().getNmapArgs()
    expect(args).not.toContain('--stats-every=5s')
  })

  it('scanAllPorts usa -p-', () => {
    useScanStoreLocal.setState({ scanAllPorts: true, fastMode: false, topPorts: '', customPorts: '' })
    const args = useScanStoreLocal.getState().getNmapArgs()
    expect(args).toContain('-p-')
  })

  it('fastMode usa -F', () => {
    useScanStoreLocal.setState({ fastMode: true, topPorts: '', customPorts: '', scanAllPorts: false })
    const args = useScanStoreLocal.getState().getNmapArgs()
    expect(args).toContain('-F')
  })
})

// ==========================================================
// applyProfile
// ==========================================================
describe('applyProfile', () => {
  it('evasive aplica timing 1 y evasionFrag', () => {
    useScanStoreLocal.getState().applyProfile('evasive')
    const s = useScanStoreLocal.getState()
    expect(s.timing).toBe(1)
    expect(s.evasionFrag).toBe(true)
    expect(s.evasionDecoy).toContain('ME')
    expect(s.scanDelay).toBe('500ms')
  })

  it('balanced aplica -O, -sV, -sC', () => {
    useScanStoreLocal.getState().applyProfile('balanced')
    const s = useScanStoreLocal.getState()
    expect(s.timing).toBe(4)
    expect(s.useOSDetection).toBe(true)
    expect(s.useServiceDetection).toBe(true)
    expect(s.scriptDefault).toBe(true)
  })

  it('aggressive aplica timing 5 y scanAllPorts', () => {
    useScanStoreLocal.getState().applyProfile('aggressive')
    const s = useScanStoreLocal.getState()
    expect(s.timing).toBe(5)
    expect(s.aggressiveMode).toBe(true)
    expect(s.scanAllPorts).toBe(true)
    expect(s.isVerbose).toBe(true)
  })

  it('discovery usa -sn', () => {
    useScanStoreLocal.getState().applyProfile('discovery')
    const s = useScanStoreLocal.getState()
    expect(s.scanType).toBe('ping')
    expect(s.isVerbose).toBe(true)
  })

  it('fast usa -F y timing 5', () => {
    useScanStoreLocal.getState().applyProfile('fast')
    const s = useScanStoreLocal.getState()
    expect(s.timing).toBe(5)
    expect(s.fastMode).toBe(true)
    expect(s.topPorts).toBe('1000')
  })

  it('limpia perfiles previos antes de aplicar uno nuevo', () => {
    useScanStoreLocal.getState().applyProfile('aggressive')
    useScanStoreLocal.getState().applyProfile('balanced')
    const s = useScanStoreLocal.getState()
    // aggressive dejó scanAllPorts=true, balanced lo debe resetear
    expect(s.scanAllPorts).toBe(false)
  })
})

// ==========================================================
// saveCustomProfile / loadCustomProfile / deleteCustomProfile
// ==========================================================
describe('perfiles custom', () => {
  it('guarda un perfil', () => {
    useScanStoreLocal.getState().saveCustomProfile('Mi perfil')
    const profiles = useScanStoreLocal.getState().savedProfiles
    expect(profiles).toHaveLength(1)
    expect(profiles[0].name).toBe('Mi perfil')
  })

  it('guarda múltiples perfiles', () => {
    useScanStoreLocal.getState().saveCustomProfile('A')
    useScanStoreLocal.getState().saveCustomProfile('B')
    expect(useScanStoreLocal.getState().savedProfiles).toHaveLength(2)
  })

  it('carga un perfil por id', () => {
    useScanStoreLocal.setState({ timing: 1 })
    useScanStoreLocal.getState().saveCustomProfile('Guardado')
    const id = useScanStoreLocal.getState().savedProfiles[0].id

    useScanStoreLocal.setState({ timing: 5 })
    useScanStoreLocal.getState().loadCustomProfile(id)
    expect(useScanStoreLocal.getState().timing).toBe(1)
  })

  it('elimina un perfil', () => {
    useScanStoreLocal.getState().saveCustomProfile('X')
    const id = useScanStoreLocal.getState().savedProfiles[0].id
    useScanStoreLocal.getState().deleteCustomProfile(id)
    expect(useScanStoreLocal.getState().savedProfiles).toHaveLength(0)
  })
})

// ==========================================================
// setParsedData / sanitizeHosts
// ==========================================================
describe('setParsedData', () => {
  it('guarda hosts y mueve previos a historyData', () => {
    const h1: HostInfo = { ip: '10.0.0.1', mac: '', mac_vendor: '', status: 'up', os: '', ports: [] }
    const h2: HostInfo = { ip: '10.0.0.2', mac: '', mac_vendor: '', status: 'up', os: '', ports: [] }

    useScanStoreLocal.getState().setParsedData([h1])
    useScanStoreLocal.getState().setParsedData([h2])

    const s = useScanStoreLocal.getState()
    expect(s.parsedData).toEqual([h2])
    expect(s.historyData).toEqual([h1])
  })

  it('sanea input no-array → []', () => {
    useScanStoreLocal.getState().setParsedData('not an array' as any)
    expect(useScanStoreLocal.getState().parsedData).toEqual([])
  })

  it('sanea hosts sin ports → ports=[]', () => {
    const broken: any = [{ ip: '1.1.1.1', status: 'up' }] // sin ports
    useScanStoreLocal.getState().setParsedData(broken)
    const s = useScanStoreLocal.getState()
    expect(s.parsedData).toHaveLength(1)
    expect(Array.isArray(s.parsedData[0].ports)).toBe(true)
    expect(s.parsedData[0].ports).toEqual([])
  })

  it('filtra nulls y no-objetos', () => {
    const broken: any = [null, undefined, 'str', 42, { ip: '1.1.1.1', ports: [] }]
    useScanStoreLocal.getState().setParsedData(broken)
    const s = useScanStoreLocal.getState()
    expect(s.parsedData).toHaveLength(1)
    expect(s.parsedData[0].ip).toBe('1.1.1.1')
  })
})

// ==========================================================
// updateHost
// ==========================================================
describe('updateHost', () => {
  it('actualiza un host existente', () => {
    const h: HostInfo = { ip: '10.0.0.1', mac: '', mac_vendor: '', status: 'up', os: '', ports: [] }
    useScanStoreLocal.getState().setParsedData([h])
    useScanStoreLocal.getState().updateHost('10.0.0.1', { os: 'Linux' })
    expect(useScanStoreLocal.getState().parsedData[0].os).toBe('Linux')
  })

  it('no toca otros hosts', () => {
    const h1: HostInfo = { ip: '10.0.0.1', mac: '', mac_vendor: '', status: 'up', os: '', ports: [] }
    const h2: HostInfo = { ip: '10.0.0.2', mac: '', mac_vendor: '', status: 'up', os: '', ports: [] }
    useScanStoreLocal.getState().setParsedData([h1, h2])
    useScanStoreLocal.getState().updateHost('10.0.0.1', { os: 'Linux' })
    expect(useScanStoreLocal.getState().parsedData[1].os).toBe('')
  })

  it('sobrevive a parsedData corrupto', () => {
    useScanStoreLocal.setState({ parsedData: 'garbage' as any })
    useScanStoreLocal.getState().updateHost('10.0.0.1', { os: 'Linux' })
    expect(useScanStoreLocal.getState().parsedData).toEqual([])
  })
})

// ==========================================================
// importWorkspace
// ==========================================================
describe('importWorkspace', () => {
  it('reemplaza parsedData y limpia historyData', () => {
    useScanStoreLocal.getState().setParsedData([
      { ip: '1.1.1.1', mac: '', mac_vendor: '', status: 'up', os: '', ports: [] },
    ])
    const imported: HostInfo[] = [
      { ip: '2.2.2.2', mac: '', mac_vendor: '', status: 'up', os: '', ports: [] },
    ]
    useScanStoreLocal.getState().importWorkspace(imported)
    const s = useScanStoreLocal.getState()
    expect(s.parsedData).toEqual(imported)
    expect(s.historyData).toEqual([])
  })
})

// ==========================================================
// setPortCves / setHostCves
// ==========================================================
describe('setPortCves', () => {
  it('añade CVEs a un puerto concreto', () => {
    const h: HostInfo = {
      ip: '10.0.0.1', mac: '', mac_vendor: '', status: 'up', os: '',
      ports: [
        { portid: '22', protocol: 'tcp', state: 'open', reason: 'syn-ack', service: 'ssh', version: '9.6' },
      ],
    }
    useScanStoreLocal.getState().setParsedData([h])
    useScanStoreLocal.getState().setPortCves('10.0.0.1', '22', 'tcp', [
      { id: 'CVE-X', severity: 'high', cvss: 7.5, source: 'cpe', description: 'test' },
    ])
    const ports = useScanStoreLocal.getState().parsedData[0].ports
    expect(ports[0].cves).toHaveLength(1)
    expect(ports[0].cves![0].id).toBe('CVE-X')
  })

  it('no toca otros puertos', () => {
    const h: HostInfo = {
      ip: '10.0.0.1', mac: '', mac_vendor: '', status: 'up', os: '',
      ports: [
        { portid: '22', protocol: 'tcp', state: 'open', reason: 'syn-ack', service: 'ssh', version: '9.6' },
        { portid: '80', protocol: 'tcp', state: 'open', reason: 'syn-ack', service: 'http', version: '1.24' },
      ],
    }
    useScanStoreLocal.getState().setParsedData([h])
    useScanStoreLocal.getState().setPortCves('10.0.0.1', '22', 'tcp', [
      { id: 'CVE-X', severity: 'high', cvss: 7.5, source: 'cpe', description: 'test' },
    ])
    expect(useScanStoreLocal.getState().parsedData[0].ports[1].cves).toBeUndefined()
  })
})

describe('setHostCves', () => {
  it('añade CVEs a múltiples puertos a la vez', () => {
    const h: HostInfo = {
      ip: '10.0.0.1', mac: '', mac_vendor: '', status: 'up', os: '',
      ports: [
        { portid: '22', protocol: 'tcp', state: 'open', reason: 'syn-ack', service: 'ssh', version: '9.6' },
        { portid: '80', protocol: 'tcp', state: 'open', reason: 'syn-ack', service: 'http', version: '1.24' },
      ],
    }
    useScanStoreLocal.getState().setParsedData([h])
    useScanStoreLocal.getState().setHostCves('10.0.0.1', {
      'tcp/22': [{ id: 'CVE-A', severity: 'high', cvss: 7.5, source: 'cpe', description: 'a' }],
      'tcp/80': [{ id: 'CVE-B', severity: 'low', cvss: 3.1, source: 'cpe', description: 'b' }],
    })
    const ports = useScanStoreLocal.getState().parsedData[0].ports
    expect(ports[0].cves![0].id).toBe('CVE-A')
    expect(ports[1].cves![0].id).toBe('CVE-B')
  })
})

// ==========================================================
// clearOutput / clearHistory
// ==========================================================
describe('clearOutput', () => {
  it('limpia output, progressText y scanDuration', () => {
    useScanStoreLocal.setState({
      output: ['line1', 'line2'],
      progressText: 'scanning',
      scanDuration: '5s',
    })
    useScanStoreLocal.getState().clearOutput()
    const s = useScanStoreLocal.getState()
    expect(s.output).toEqual([])
    expect(s.progressText).toBe('')
    expect(s.scanDuration).toBe('0s')
  })
})

describe('clearHistory', () => {
  it('limpia historyData y parsedData', () => {
    useScanStoreLocal.setState({
      historyData: [{ ip: '1.1.1.1', mac: '', mac_vendor: '', status: 'up', os: '', ports: [] }],
      parsedData: [{ ip: '2.2.2.2', mac: '', mac_vendor: '', status: 'up', os: '', ports: [] }],
    })
    useScanStoreLocal.getState().clearHistory()
    const s = useScanStoreLocal.getState()
    expect(s.historyData).toEqual([])
    expect(s.parsedData).toEqual([])
  })
})

// ==========================================================
// sanitizeParsedData
// ==========================================================
describe('sanitizeParsedData', () => {
  it('repara parsedData y historyData corruptos', () => {
    useScanStoreLocal.setState({
      parsedData: 'garbage' as any,
      historyData: null as any,
    })
    useScanStoreLocal.getState().sanitizeParsedData()
    const s = useScanStoreLocal.getState()
    expect(s.parsedData).toEqual([])
    expect(s.historyData).toEqual([])
  })
})

// ==========================================================
// appendOutput
// ==========================================================
describe('appendOutput', () => {
  it('añade línea al output', () => {
    useScanStoreLocal.getState().appendOutput('hello')
    expect(useScanStoreLocal.getState().output).toEqual(['hello'])
  })

  it('acumula múltiples líneas', () => {
    useScanStoreLocal.getState().appendOutput('a')
    useScanStoreLocal.getState().appendOutput('b')
    expect(useScanStoreLocal.getState().output).toEqual(['a', 'b'])
  })
})

// ==========================================================
// syncCommandString
// ==========================================================
describe('syncCommandString', () => {
  it('genera comando nmap por defecto', () => {
    useScanStoreLocal.getState().syncCommandString()
    expect(useScanStoreLocal.getState().commandString).toMatch(/^nmap /)
  })

  it('usa rustscan si useRustScan', () => {
    useScanStoreLocal.setState({ useRustScan: true })
    useScanStoreLocal.getState().syncCommandString()
    expect(useScanStoreLocal.getState().commandString).toMatch(/^rustscan /)
  })

  it('incluye el target en el comando', () => {
    useScanStoreLocal.setState({ target: '10.10.10.1' })
    useScanStoreLocal.getState().syncCommandString()
    expect(useScanStoreLocal.getState().commandString).toContain('10.10.10.1')
  })
})
