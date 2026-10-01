import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { invoke } from '@tauri-apps/api/core'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { useUiStore } from './uiStore'
import type { CveMatch } from '../../features/dashboard/utils/cve'

// ==========================================================
// TIPOS DE DATOS DEL SCAN
// ==========================================================

export interface ScriptInfo {
  id: string;
  output: string;
}

export interface ExtraPorts {
  state: string;
  count: number;
  reasons: string[];
}

export interface PortInfo {
  portid: string;
  protocol: string;
  state: string;
  reason: string;
  service: string;
  version: string;
  // --- Campos extendidos (Bloque 1) ---
  product?: string;
  extrainfo?: string;
  ostype?: string;
  devicetype?: string;
  tunnel?: string;
  cpe?: string[];
  servicefp?: string;
  scripts?: ScriptInfo[];
  // --- Enriquecimiento CVE (Bloque 2) ---
  cves?: CveMatch[];
}

export interface HostInfo {
  ip: string;
  hostname?: string;
  alias?: string;
  mac: string;
  mac_vendor: string;
  status: string;
  os: string;
  ports: PortInfo[];
  tags?: string[];
  notes?: string;
  scripts?: ScriptInfo[];
  // --- Campos extendidos (Bloque 1) ---
  status_reason?: string;
  os_accuracy?: string;
  uptime_seconds?: number;
  uptime_lastboot?: string;
  distance?: number;
  extraports?: ExtraPorts[];
  start_time?: string;
  end_time?: string;
}

export interface ScanResult {
  hosts: HostInfo[];
  scanner?: string;
  scanner_version?: string;
  scan_args?: string;
  start_time?: string;
  start_time_str?: string;
  end_time?: string;
  end_time_str?: string;
  elapsed?: string;
}

export interface SavedProfile {
  id: string;
  name: string;
  config: Partial<ScanState>;
}

export interface VaultCred {
  id: string;
  target: string;
  type: 'hash' | 'password' | 'key';
  username: string;
  secret: string;
  notes: string;
}

// ==========================================================
// ESTADO DEL SCAN
// ==========================================================

interface ScanState {
  target: string; scanType: 'syn' | 'tcp' | 'udp' | 'sctp' | 'ping'; timing: number;
  excludeTargets: string; topPorts: string; customPorts: string; fastMode: boolean;
  discoveryMode: string; minRate: string; maxRetries: string; networkInterface: string;
  aggressiveMode: boolean; traceroute: boolean; reason: boolean; packetTrace: boolean; minParallelism: string; maxParallelism: string; dnsResolution: string; hostTimeout: string; scanDelay: string;
  useOSDetection: boolean; maxOsTries: string; useServiceDetection: boolean; versionIntensity: string;
  useIPv6: boolean; scanAllPorts: boolean; nseCategory: string; nseArgs: string; isVerbose: boolean;
  evasionFrag: boolean; evasionMTU: string; evasionDecoy: string; evasionMac: string; evasionSourcePort: string; evasionSpoofIp: string; badsum: boolean; randomizeHosts: boolean; zombieIp: string; ftpBounce: string;
  customTcpFlags: string; proxies: string; customDns: string; dataString: string; dataHex: string; dataLength: string;
  commandString: string; isScanning: boolean; output: string[]; parsedData: HostInfo[]; historyData: HostInfo[]; progressText: string; scanDuration: string;
  savedProfiles: SavedProfile[]; autoScanInterval: number;
  onlyOpenPorts: boolean; osScanGuess: boolean; scriptDefault: boolean; minHostgroup: string; maxHostgroup: string;
  nmapOutputFormat: string; nmapOutputPrefix: string; nmapOutputDir: string;
  useRustScan: boolean;

  setTarget: (t: string) => void; setScanType: (t: 'syn' | 'tcp' | 'udp' | 'sctp' | 'ping') => void; setTiming: (t: number) => void; setDiscoveryMode: (m: string) => void; setField: (f: keyof ScanState, v: any) => void;
  toggleOSDetection: () => void; toggleServiceDetection: () => void; toggleIPv6: () => void; toggleAllPorts: () => void; toggleVerbose: () => void; setNseCategory: (c: string) => void; setNseArgs: (a: string) => void; setCommandString: (c: string) => void;
  applyProfile: (p: 'evasive' | 'balanced' | 'aggressive' | 'discovery' | 'fast') => void;
  saveCustomProfile: (name: string) => void; loadCustomProfile: (id: string) => void; deleteCustomProfile: (id: string) => void;
  syncCommandString: () => void; setIsScanning: (s: boolean) => void; appendOutput: (l: string) => void; clearOutput: () => void; clearHistory: () => void; setParsedData: (d: HostInfo[]) => void; updateHost: (ip: string, u: Partial<HostInfo>) => void; setProgressText: (t: string) => void; setScanDuration: (d: string) => void; getNmapArgs: () => string[]; cancelScan: () => Promise<void>; notifyCompletion: () => Promise<void>; playAudioAlert: () => void; importWorkspace: (data: HostInfo[]) => void; copyMasterConfig: () => void;
  // --- Enriquecimiento CVE (Bloque 2) ---
  setPortCves: (ip: string, portid: string, protocol: string, cves: CveMatch[]) => void;
  setHostCves: (ip: string, mapping: Record<string, CveMatch[]>) => void;
  // --- Saneamiento (defensa contra localStorage corrupto) ---
  sanitizeParsedData: () => void;
}

// ==========================================================
// HELPERS
// ==========================================================

function normalizeTarget(raw: string): string {
  return raw.trim().split(/\s+/).filter(Boolean).join(' ');
}

/**
 * Sanea `parsedData` / `historyData` para que SIEMPRE sea un array
 * de hosts con `ports` array.
 *
 * ¿Por qué?
 * ---------
 * Si localStorage trae basura (versión antigua del esquema, un
 * workspace importado mal formado, un `{}` por un bug previo...),
 * `parsedData.map(...)` explota. Esta función garantiza la forma.
 *
 * - No valida campos a fondo: solo estructura mínima.
 * - No filtra hosts sin `ip` (algunos pueden tenerla vacía pero
 *   seguir siendo válidos tras el parseo).
 */
function sanitizeHosts(input: unknown): HostInfo[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((h): h is HostInfo => !!h && typeof h === 'object')
    .map((h) => {
      const ports = Array.isArray((h as HostInfo).ports)
        ? (h as HostInfo).ports
        : []
      return { ...(h as HostInfo), ports }
    })
}

function buildNmapArgs(s: ScanState): string[] {
  const args: string[] = [];

  if (s.useIPv6) args.push('-6');

  if (s.scanType === 'syn') args.push('-sS');
  else if (s.scanType === 'tcp') args.push('-sT');
  else if (s.scanType === 'udp') args.push('-sU');
  else if (s.scanType === 'sctp') args.push('-sY');
  else if (s.scanType === 'ping') args.push('-sn');

  args.push(`-T${s.timing}`);

  if (s.onlyOpenPorts) args.push('--open');
  if (s.excludeTargets) args.push('--exclude', s.excludeTargets);

  if (s.scanType !== 'ping') {
    if (s.fastMode) args.push('-F');
    else if (s.topPorts) args.push('--top-ports', s.topPorts);
    else if (s.customPorts) args.push('-p', s.customPorts.replace(/\s/g, ''));
    else if (s.scanAllPorts) args.push('-p-');
  }

  if (s.discoveryMode) args.push(s.discoveryMode);
  if (s.minRate) args.push('--min-rate', s.minRate);
  if (s.maxRetries) args.push('--max-retries', s.maxRetries);
  if (s.minParallelism) args.push('--min-parallelism', s.minParallelism);
  if (s.maxParallelism) args.push('--max-parallelism', s.maxParallelism);
  if (s.minHostgroup) args.push('--min-hostgroup', s.minHostgroup);
  if (s.maxHostgroup) args.push('--max-hostgroup', s.maxHostgroup);
  if (s.hostTimeout) args.push('--host-timeout', s.hostTimeout);
  if (s.scanDelay) args.push('--scan-delay', s.scanDelay);

  if (s.networkInterface) args.push('-e', s.networkInterface);
  if (s.aggressiveMode) args.push('-A');
  if (s.traceroute) args.push('--traceroute');
  if (s.reason) args.push('--reason');
  if (s.packetTrace) args.push('--packet-trace');
  if (s.dnsResolution) args.push(s.dnsResolution);
  if (s.proxies) args.push('--proxies', s.proxies);
  if (s.customDns) args.push('--dns-servers', s.customDns);

  if (s.scanType !== 'ping') {
    if (s.customTcpFlags) args.push('--scanflags', s.customTcpFlags.toUpperCase());
    if (s.dataString) args.push('--data-string', s.dataString);
    if (s.dataHex) args.push('--data', s.dataHex);
    if (s.dataLength) args.push('--data-length', s.dataLength);

    if (s.useOSDetection && !s.aggressiveMode) args.push('-O');
    if (s.osScanGuess) args.push('--osscan-guess');
    if (s.maxOsTries && s.useOSDetection) args.push('--max-os-tries', s.maxOsTries);
    if (s.useServiceDetection && !s.aggressiveMode) args.push('-sV');
    if (s.versionIntensity && s.useServiceDetection) args.push('--version-intensity', s.versionIntensity);
    if (s.scriptDefault && !s.aggressiveMode) args.push('-sC');
    if (s.nseCategory && !s.scriptDefault) args.push(`--script=${s.nseCategory}`);
    if (s.nseArgs) args.push(`--script-args=${s.nseArgs.replace(/\s/g, '')}`);

    if (s.evasionFrag) args.push('-f');
    if (s.evasionMTU) args.push('--mtu', s.evasionMTU);
    if (s.evasionDecoy) args.push('-D', s.evasionDecoy);
    if (s.evasionMac) args.push('--spoof-mac', s.evasionMac);
    if (s.evasionSourcePort) args.push('-g', s.evasionSourcePort);
    if (s.evasionSpoofIp) args.push('-S', s.evasionSpoofIp);
    if (s.badsum) args.push('--badsum');
    if (s.randomizeHosts) args.push('--randomize-hosts');
    if (s.zombieIp) args.push('-sI', s.zombieIp);
    if (s.ftpBounce) args.push('-b', s.ftpBounce);
  }

  if (s.isVerbose) args.push('-v');
  if (!args.includes('--stats-every=5s')) args.push('--stats-every=5s');

  return args;
}

function buildCommandString(s: ScanState, nmapArgs: string[]): string {
  const targetPart = s.target ? ` ${s.target}` : '';
  if (s.useRustScan) {
    return `rustscan -a ${s.target || '<IP>'} -b 4500 --accessible -- ${nmapArgs.join(' ')}`;
  }
  return `nmap ${nmapArgs.join(' ')}${targetPart}`;
}

// ==========================================================
// STORE
// ==========================================================

export const useScanStoreLocal = create<ScanState>()(
  persist(
    (set, get) => ({
      target: '', scanType: 'syn', timing: 4, excludeTargets: '', topPorts: '', customPorts: '', fastMode: false, discoveryMode: '', minRate: '', maxRetries: '', networkInterface: '', aggressiveMode: false, traceroute: false, reason: false, packetTrace: false, minParallelism: '', maxParallelism: '', dnsResolution: '', hostTimeout: '', scanDelay: '', useOSDetection: false, maxOsTries: '', useServiceDetection: false, versionIntensity: '', useIPv6: false, scanAllPorts: false, nseCategory: '', nseArgs: '', isVerbose: false, evasionFrag: false, evasionMTU: '', evasionDecoy: '', evasionMac: '', evasionSourcePort: '', evasionSpoofIp: '', badsum: false, randomizeHosts: false, zombieIp: '', ftpBounce: '', customTcpFlags: '', proxies: '', customDns: '', dataString: '', dataHex: '', dataLength: '',
      commandString: 'nmap -sS -T4', isScanning: false, output: [], parsedData: [], historyData: [], progressText: '', scanDuration: '0s', savedProfiles: [], autoScanInterval: 0,
      onlyOpenPorts: false, osScanGuess: false, scriptDefault: false, minHostgroup: '', maxHostgroup: '', nmapOutputFormat: '', nmapOutputPrefix: 'lessso_scan', nmapOutputDir: '',
      useRustScan: false,

      setTarget: (t) => { set({ target: normalizeTarget(t) }); get().syncCommandString(); },
      setScanType: (t) => { if (t === 'ping') set({ useOSDetection: false, useServiceDetection: false, scanAllPorts: false, customPorts: '', topPorts: '', fastMode: false, nseCategory: '', nseArgs: '', aggressiveMode: false, customTcpFlags: '', dataString: '', dataHex: '', dataLength: '', scriptDefault: false, osScanGuess: false, onlyOpenPorts: false }); set({ scanType: t }); get().syncCommandString(); },
      setTiming: (t) => { set({ timing: t }); get().syncCommandString(); },
      setDiscoveryMode: (m) => { set({ discoveryMode: m }); get().syncCommandString(); },
      setField: (f, v) => { set({ [f]: v } as any); get().syncCommandString(); },
      toggleOSDetection: () => { set((s) => ({ useOSDetection: !s.useOSDetection })); get().syncCommandString(); },
      toggleServiceDetection: () => { set((s) => ({ useServiceDetection: !s.useServiceDetection })); get().syncCommandString(); },
      toggleIPv6: () => { set((s) => ({ useIPv6: !s.useIPv6 })); get().syncCommandString(); },
      toggleAllPorts: () => { set((s) => ({ scanAllPorts: !s.scanAllPorts, fastMode: false, topPorts: '', customPorts: '' })); get().syncCommandString(); },
      toggleVerbose: () => { set((s) => ({ isVerbose: !s.isVerbose })); get().syncCommandString(); },
      setNseCategory: (c) => { set({ nseCategory: c }); get().syncCommandString(); },
      setNseArgs: (a) => { set({ nseArgs: a }); get().syncCommandString(); },
      setCommandString: (c) => set({ commandString: c }),

      applyProfile: (p) => {
        set({ useOSDetection: false, useServiceDetection: false, scanAllPorts: false, fastMode: false, topPorts: '', customPorts: '', nseCategory: '', evasionFrag: false, evasionDecoy: '', minRate: '', maxRetries: '', aggressiveMode: false, packetTrace: false, badsum: false, zombieIp: '', ftpBounce: '', hostTimeout: '', scanDelay: '', customTcpFlags: '', dataLength: '', proxies: '', onlyOpenPorts: false, scriptDefault: false, osScanGuess: false, minHostgroup: '', maxHostgroup: '', nmapOutputFormat: '', nmapOutputPrefix: 'lessso_scan', nmapOutputDir: '' });
        switch (p) {
          case 'evasive': set({ scanType: 'syn', timing: 1, isVerbose: false, evasionFrag: true, evasionDecoy: 'ME,10.0.0.1', scanDelay: '500ms', dataLength: '25' }); break;
          case 'balanced': set({ scanType: 'syn', timing: 4, useOSDetection: true, useServiceDetection: true, scriptDefault: true }); break;
          case 'aggressive': set({ scanType: 'tcp', timing: 5, aggressiveMode: true, scanAllPorts: true, scriptDefault: true, isVerbose: true, minRate: '1000', maxRetries: '0' }); break;
          case 'discovery': set({ scanType: 'ping', timing: 4, isVerbose: true }); break;
          case 'fast': set({ scanType: 'syn', timing: 5, fastMode: true, isVerbose: true, topPorts: '1000' }); break;
        }
        get().syncCommandString();
      },

      saveCustomProfile: (name: string) => {
        const s = get();
        const newProfile: SavedProfile = {
          id: Date.now().toString(),
          name,
          config: {
            scanType: s.scanType, timing: s.timing, useOSDetection: s.useOSDetection,
            useServiceDetection: s.useServiceDetection, scanAllPorts: s.scanAllPorts,
            fastMode: s.fastMode, customPorts: s.customPorts, nseCategory: s.nseCategory,
            nseArgs: s.nseArgs, isVerbose: s.isVerbose, evasionFrag: s.evasionFrag,
            evasionDecoy: s.evasionDecoy, aggressiveMode: s.aggressiveMode, badsum: s.badsum,
            randomizeHosts: s.randomizeHosts, customTcpFlags: s.customTcpFlags,
            dataLength: s.dataLength, minRate: s.minRate, maxRetries: s.maxRetries,
            onlyOpenPorts: s.onlyOpenPorts, scriptDefault: s.scriptDefault,
            osScanGuess: s.osScanGuess, minHostgroup: s.minHostgroup,
            maxHostgroup: s.maxHostgroup, nmapOutputFormat: s.nmapOutputFormat,
            nmapOutputPrefix: s.nmapOutputPrefix, nmapOutputDir: s.nmapOutputDir,
          },
        };
        set((state) => ({ savedProfiles: [...state.savedProfiles, newProfile] }));
      },
      loadCustomProfile: (id: string) => {
        const profile = get().savedProfiles.find((p) => p.id === id);
        if (profile) {
          set({ ...profile.config } as Partial<ScanState>);
          get().syncCommandString();
        }
      },
      deleteCustomProfile: (id: string) => set((state) => ({ savedProfiles: state.savedProfiles.filter((p) => p.id !== id) })),

      syncCommandString: () => {
        const s = get();
        const nmapArgs = buildNmapArgs(s);
        const finalCommand = buildCommandString(s, nmapArgs);
        set({ commandString: finalCommand });
      },
      setIsScanning: (s) => set({ isScanning: s }),
      appendOutput: (l) => set((s) => ({ output: [...s.output, l] })),
      clearOutput: () => set({ output: [], progressText: '', scanDuration: '0s' }),
      clearHistory: () => set({ historyData: [], parsedData: [] }),

      // ------------------------------------------------------
      // SANEADOS: estas tres son las que evitan el crash
      // ------------------------------------------------------
      setParsedData: (d) =>
        set((state) => ({
          historyData: sanitizeHosts(state.parsedData),
          parsedData: sanitizeHosts(d),
        })),

      updateHost: (ip, u) =>
        set((s) => ({
          parsedData: sanitizeHosts(s.parsedData).map((h) =>
            h.ip === ip ? { ...h, ...u } : h,
          ),
        })),

      importWorkspace: (data) =>
        set({ parsedData: sanitizeHosts(data), historyData: [] }),

      sanitizeParsedData: () =>
        set((s) => ({
          parsedData: sanitizeHosts(s.parsedData),
          historyData: sanitizeHosts(s.historyData),
        })),

      setProgressText: (t) => set({ progressText: t }),
      setScanDuration: (d) => set({ scanDuration: d }),

      // --- Enriquecimiento CVE ---
      setPortCves: (ip, portid, protocol, cves) =>
        set((s) => ({
          parsedData: sanitizeHosts(s.parsedData).map((h) =>
            h.ip !== ip
              ? h
              : {
                  ...h,
                  ports: (h.ports || []).map((p) =>
                    p.portid === portid && p.protocol === protocol
                      ? { ...p, cves }
                      : p,
                  ),
                },
          ),
        })),

      setHostCves: (ip, mapping) =>
        set((s) => ({
          parsedData: sanitizeHosts(s.parsedData).map((h) =>
            h.ip !== ip
              ? h
              : {
                  ...h,
                  ports: (h.ports || []).map((p) => {
                    const key = `${p.protocol}/${p.portid}`;
                    const cves = mapping[key];
                    return cves ? { ...p, cves } : p;
                  }),
                },
          ),
        })),

      cancelScan: async () => {
        try {
          if (!('__TAURI_INTERNALS__' in window)) {
            set({ isScanning: false, progressText: '' });
            get().appendOutput('\n[WARN] DETENIDO (Modo Web Simulacro).');
            return;
          }
          await invoke('cancel_nmap');
          set({ isScanning: false, progressText: '' });
          get().appendOutput('\n[WARN] DETENIDO POR EL USUARIO.');
        } catch (e) {
          console.error(e);
        }
      },

      playAudioAlert: () => {
        const { soundEnabled, volume } = useUiStore.getState();
        if (!soundEnabled) return;
        if (volume <= 0) return;
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(volume / 100, ctx.currentTime);
          osc.start();
          osc.stop(ctx.currentTime + 0.3);
        } catch (e) {
          /* noop */
        }
      },

      notifyCompletion: async () => {
        get().playAudioAlert();
        if (!('__TAURI_INTERNALS__' in window)) return;
        try {
          let permissionGranted = await isPermissionGranted();
          if (!permissionGranted) {
            const permission = await requestPermission();
            permissionGranted = permission === 'granted';
          }
          if (permissionGranted)
            sendNotification({ title: 'LESSSO C2', body: 'Auditoría Finalizada' });
        } catch (e) {
          console.error('Notificaciones no soportadas en este SO.');
        }
      },

      getNmapArgs: () => {
        const s = get();
        const args = buildNmapArgs(s);
        if (s.useRustScan) {
          return args.filter((a) => a !== '--stats-every=5s');
        }
        return args;
      },

      copyMasterConfig: () => {
        const s = get();
        const configData = {
          command: s.commandString,
          target: s.target,
          timing: s.timing,
          flags: s.commandString.replace('nmap ', '').replace(s.target, '').trim(),
        };
        navigator.clipboard.writeText(JSON.stringify(configData, null, 2));
        alert('Configuración Maestra (JSON) copiada al portapapeles.');
      },
    }),
    {
      name: 'lessso-c2-scanStore',
      partialize: (state) => ({
        parsedData: state.parsedData,
        historyData: state.historyData,
        savedProfiles: state.savedProfiles,
      }),
      // ------------------------------------------------------
      // SANEAMIENTO AL CARGAR DE LOCALSTORAGE
      // ------------------------------------------------------
      // Si localStorage trae basura de una versión previa, la
      // corregimos aquí. Evita el crash `parsedData.map is not
      // a function` en el primer render.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!Array.isArray(state.parsedData)) state.parsedData = [];
        if (!Array.isArray(state.historyData)) state.historyData = [];
        if (!Array.isArray(state.savedProfiles)) state.savedProfiles = [];
      },
    },
  ),
)
