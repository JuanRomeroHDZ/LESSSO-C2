import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'

export interface ScriptInfo { id: string; output: string; }
export interface PortInfo { portid: string; protocol: string; state: string; reason: string; service: string; version: string; scripts?: ScriptInfo[]; }
export interface HostInfo { ip: string; hostname?: string; alias?: string; mac: string; mac_vendor: string; status: string; os: string; ports: PortInfo[]; tags?: string[]; notes?: string; scripts?: ScriptInfo[]; }
export interface SavedProfile { id: string; name: string; config: Partial<ScanState>; }
export interface VaultCred { id: string; target: string; type: 'hash' | 'password' | 'key'; username: string; secret: string; notes: string; }

interface ScanState {
  theme: 'light' | 'dark'; target: string; scanType: 'syn' | 'tcp' | 'udp' | 'sctp' | 'ping'; timing: number;
  excludeTargets: string; topPorts: string; customPorts: string; fastMode: boolean;
  discoveryMode: string; minRate: string; maxRetries: string; networkInterface: string;
  aggressiveMode: boolean; traceroute: boolean; reason: boolean; packetTrace: boolean; minParallelism: string; maxParallelism: string; dnsResolution: string; hostTimeout: string; scanDelay: string;

  useOSDetection: boolean; maxOsTries: string; useServiceDetection: boolean; versionIntensity: string;
  useIPv6: boolean; scanAllPorts: boolean; nseCategory: string; nseArgs: string; isVerbose: boolean;
  evasionFrag: boolean; evasionMTU: string; evasionDecoy: string; evasionMac: string; evasionSourcePort: string; evasionSpoofIp: string; badsum: boolean; randomizeHosts: boolean; zombieIp: string; ftpBounce: string;
  customTcpFlags: string; proxies: string; customDns: string; dataString: string; dataHex: string; dataLength: string;
  commandString: string; isScanning: boolean; output: string[]; parsedData: HostInfo[]; historyData: HostInfo[]; progressText: string; scanDuration: string;
  savedProfiles: SavedProfile[]; autoScanInterval: number; zenMode: boolean; compactMode: boolean;
  quickNotesOpen: boolean;

  onlyOpenPorts: boolean; osScanGuess: boolean; scriptDefault: boolean; minHostgroup: string; maxHostgroup: string;
  nmapOutputFormat: string; nmapOutputPrefix: string; nmapOutputDir: string;

  // =============================
  // BÓVEDA Y SEGURIDAD (Sprint 2)
  // =============================
  // - SIN masterPasswordHash (hash débil eliminado)
  // - La pwd se valida descifrando encryptedVaultData
  // - encryptedVaultData es el único dato persistido de la bóveda
  // =============================
  vaultCredentials: VaultCred[];
  encryptedVaultData: string;
  isVaultUnlocked: boolean;

  unlockVault: (pwd: string) => Promise<boolean>;
  lockVault: () => void;
  setMasterPassword: (pwd: string) => Promise<void>;
  addVaultCred: (cred: Omit<VaultCred, 'id'>, currentPwd?: string) => Promise<void>;
  removeVaultCred: (id: string, currentPwd?: string) => Promise<void>;
  // =============================

  redTeamNotes: string; setRedTeamNotes: (notes: string) => void;
  redTeamWhiteboard: any; setRedTeamWhiteboard: (data: any) => void;

  vpnIp: string | null; ovpnPath: string; useRustScan: boolean;
  volume: number; soundEnabled: boolean; autoSaveEnabled: boolean; availableInterfaces: string[];

  fuzzerUrl: string; fuzzerRawOutput: string; isFuzzing: boolean;
  startFuzzer: (url: string, wordlist: string) => Promise<void>; clearFuzzer: () => void;

  toggleTheme: () => void; setTarget: (t: string) => void; setScanType: (t: 'syn' | 'tcp' | 'udp' | 'sctp' | 'ping') => void; setTiming: (t: number) => void; setDiscoveryMode: (m: string) => void; setField: (f: keyof ScanState, v: any) => void;
  toggleOSDetection: () => void; toggleServiceDetection: () => void; toggleIPv6: () => void; toggleAllPorts: () => void; toggleVerbose: () => void; setNseCategory: (c: string) => void; setNseArgs: (a: string) => void; setCommandString: (c: string) => void;
  applyProfile: (p: 'evasive' | 'balanced' | 'aggressive' | 'discovery' | 'fast') => void;
  saveCustomProfile: (name: string) => void; loadCustomProfile: (id: string) => void; deleteCustomProfile: (id: string) => void;
  checkVpnStatus: () => Promise<void>; connectVpn: () => Promise<void>;
  disconnectVpn: () => Promise<void>; fetchInterfaces: () => Promise<void>;
  setVolume: (v: number) => void; toggleSound: () => void; toggleAutoSave: () => void;
  syncCommandString: () => void; setIsScanning: (s: boolean) => void; appendOutput: (l: string) => void; clearOutput: () => void; clearHistory: () => void; setParsedData: (d: HostInfo[]) => void; updateHost: (ip: string, u: Partial<HostInfo>) => void; setProgressText: (t: string) => void; setScanDuration: (d: string) => void; getNmapArgs: () => string[]; cancelScan: () => Promise<void>; notifyCompletion: () => Promise<void>; playAudioAlert: () => void; importWorkspace: (data: HostInfo[]) => void; toggleZenMode: () => void; toggleCompactMode: () => void; toggleQuickNotes: () => void; copyMasterConfig: () => void;
  syncWithBackend: (target: string, scanDuration: string, data: HostInfo[]) => Promise<void>;
}

// ==========================================================
// HELPER: normaliza el target (quita espacios y duplicados)
// ==========================================================
function normalizeTarget(raw: string): string {
  return raw.trim().split(/\s+/).filter(Boolean).join(' ');
}

// ==========================================================
// HELPER: construye el array de args de Nmap (fuente de verdad)
// El backend Tauri añade SIEMPRE -oX <temp> al final.
// Aquí nunca se incluye -oN/-oG/-oX/-oA ni el target.
// ==========================================================
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

// ==========================================================
// HELPER: genera el comando string SOLO para visualización.
// Es 100% cosmético, no se usa para ejecutar.
// ==========================================================
function buildCommandString(s: ScanState, nmapArgs: string[]): string {
  const targetPart = s.target ? ` ${s.target}` : '';
  if (s.useRustScan) {
    return `rustscan -a ${s.target || '<IP>'} -b 4500 --accessible -- ${nmapArgs.join(' ')}`;
  }
  return `nmap ${nmapArgs.join(' ')}${targetPart}`;
}

export const useScanStore = create<ScanState>()(
  persist(
    (set, get) => ({
      theme: 'light', target: '', scanType: 'syn', timing: 4, excludeTargets: '', topPorts: '', customPorts: '', fastMode: false, discoveryMode: '', minRate: '', maxRetries: '', networkInterface: '', aggressiveMode: false, traceroute: false, reason: false, packetTrace: false, minParallelism: '', maxParallelism: '', dnsResolution: '', hostTimeout: '', scanDelay: '', useOSDetection: false, maxOsTries: '', useServiceDetection: false, versionIntensity: '', useIPv6: false, scanAllPorts: false, nseCategory: '', nseArgs: '', isVerbose: false, evasionFrag: false, evasionMTU: '', evasionDecoy: '', evasionMac: '', evasionSourcePort: '', evasionSpoofIp: '', badsum: false, randomizeHosts: false, zombieIp: '', ftpBounce: '', customTcpFlags: '', proxies: '', customDns: '', dataString: '', dataHex: '', dataLength: '',
      commandString: 'nmap -sS -T4', isScanning: false, output: [], parsedData: [], historyData: [], progressText: '', scanDuration: '0s', savedProfiles: [], autoScanInterval: 0, zenMode: false, compactMode: false, quickNotesOpen: false,
      onlyOpenPorts: false, osScanGuess: false, scriptDefault: false, minHostgroup: '', maxHostgroup: '', nmapOutputFormat: '', nmapOutputPrefix: 'lessso_scan', nmapOutputDir: '',

      // BÓVEDA CIFRADA (Sprint 2 — sin masterPasswordHash)
      vaultCredentials: [],
      encryptedVaultData: '',
      isVaultUnlocked: false,

      // ==========================================================
      // setMasterPassword: crea la bóveda desde cero.
      // Cifra el estado actual (vacío) y guarda el blob.
      // Ya NO genera ni guarda masterPasswordHash.
      // ==========================================================
      setMasterPassword: async (pwd: string) => {
        const s = get();
        const toEncrypt = JSON.stringify(s.vaultCredentials);
        const encrypted = await invoke<string>('encrypt_vault', { data: toEncrypt, password: pwd });
        set({ encryptedVaultData: encrypted, isVaultUnlocked: true });
      },

      // ==========================================================
      // unlockVault: valida la pwd intentando DESCIFRAR.
      // Si `decrypt_vault` devuelve error → pwd incorrecta → false.
      // Si devuelve JSON válido → desbloquea → true.
      // Ya NO compara ningún hash débil.
      // ==========================================================
      unlockVault: async (pwd: string) => {
        const s = get();
        if (!s.encryptedVaultData) {
          console.error('unlockVault: no hay bóveda cifrada que desbloquear');
          return false;
        }
        try {
          const decrypted = await invoke<string>('decrypt_vault', {
            encryptedData: s.encryptedVaultData,
            password: pwd,
          });
          const creds = JSON.parse(decrypted) as VaultCred[];
          set({ vaultCredentials: creds, isVaultUnlocked: true });
          return true;
        } catch (e) {
          console.error('unlockVault: descifrado falló (pwd incorrecta o datos corruptos)', e);
          return false;
        }
      },

      // ==========================================================
      // lockVault: limpia las credenciales de memoria.
      // El blob cifrado sigue en disco para volver a desbloquear.
      // ==========================================================
      lockVault: () => {
        set({ vaultCredentials: [], isVaultUnlocked: false });
      },

      // ==========================================================
      // addVaultCred: añade credencial y re-cifra el blob completo.
      // Ya NO chequea masterPasswordHash. Solo que haya blob.
      // ==========================================================
      addVaultCred: async (cred, currentPwd) => {
        const s = get();
        if (!currentPwd) {
          console.error('addVaultCred: falta la contraseña para re-cifrar');
          return;
        }
        const newCreds = [...s.vaultCredentials, { ...cred, id: Date.now().toString() }];
        set({ vaultCredentials: newCreds });
        try {
          const encrypted = await invoke<string>('encrypt_vault', {
            data: JSON.stringify(newCreds),
            password: currentPwd,
          });
          set({ encryptedVaultData: encrypted });
        } catch (e) {
          console.error('addVaultCred: fallo al re-cifrar la bóveda', e);
        }
      },

      // ==========================================================
      // removeVaultCred: elimina credencial y re-cifra el blob.
      // ==========================================================
      removeVaultCred: async (id, currentPwd) => {
        const s = get();
        if (!currentPwd) {
          console.error('removeVaultCred: falta la contraseña para re-cifrar');
          return;
        }
        const newCreds = s.vaultCredentials.filter(c => c.id !== id);
        set({ vaultCredentials: newCreds });
        try {
          const encrypted = await invoke<string>('encrypt_vault', {
            data: JSON.stringify(newCreds),
            password: currentPwd,
          });
          set({ encryptedVaultData: encrypted });
        } catch (e) {
          console.error('removeVaultCred: fallo al re-cifrar la bóveda', e);
        }
      },

      redTeamNotes: '',
      setRedTeamNotes: (notes: string) => { const autoTagged = notes.replace(/#T([0-9]{4})/g, "[MITRE: T$1]"); set({ redTeamNotes: autoTagged }); },
      redTeamWhiteboard: null, setRedTeamWhiteboard: (data: any) => set({ redTeamWhiteboard: data }),
      vpnIp: null, ovpnPath: '', useRustScan: false, volume: 50, soundEnabled: true, autoSaveEnabled: true, availableInterfaces: [],

      fuzzerUrl: '', fuzzerRawOutput: '', isFuzzing: false,
      clearFuzzer: () => set({ fuzzerRawOutput: '', isFuzzing: false }),
      startFuzzer: async (url, wordlist) => { set({ isFuzzing: true, fuzzerRawOutput: '>>> Iniciando Motor Fuzzer (Gobuster)...\n', fuzzerUrl: url }); try { await invoke('run_fuzzer', { targetUrl: url, wordlist }); } catch (e: any) { set((s) => ({ fuzzerRawOutput: s.fuzzerRawOutput + `\n[ERROR CRÍTICO]: ${e}\n`, isFuzzing: false })); } },

      toggleTheme: () => set((state) => { const nt = state.theme === 'light' ? 'dark' : 'light'; if (nt === 'dark') document.documentElement.classList.add('dark'); else document.documentElement.classList.remove('dark'); return { theme: nt }; }),
      toggleZenMode: () => set((s) => ({ zenMode: !s.zenMode })), toggleCompactMode: () => set((s) => ({ compactMode: !s.compactMode })), toggleQuickNotes: () => set((s) => ({ quickNotesOpen: !s.quickNotesOpen })),
      setVolume: (v) => set({ volume: v }), toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })), toggleAutoSave: () => set((s) => ({ autoSaveEnabled: !s.autoSaveEnabled })),

      checkVpnStatus: async () => { try { const ip = await invoke<string>('check_vpn'); set({ vpnIp: ip }); } catch { set({ vpnIp: null }); } },
      fetchInterfaces: async () => { try { const ifaces = await invoke<string[]>('get_network_interfaces'); set({ availableInterfaces: ifaces }); } catch { set({ availableInterfaces: [] }); } },

      connectVpn: async () => {
        try {
          const { ovpnPath } = get();
          if (!ovpnPath) {
            const selected = await open({ filters: [{ name: 'OpenVPN', extensions: ['ovpn', 'conf'] }] });
            if (selected && !Array.isArray(selected)) { set({ ovpnPath: selected }); await invoke('connect_vpn', { ovpnPath: selected }); }
          } else { await invoke('connect_vpn', { ovpnPath }); }
          setTimeout(() => get().checkVpnStatus(), 2000);
        } catch (e: any) {
          console.error(e); let errorMsg = e.toString();
          if (errorMsg.includes("DEPENDENCY_MISSING") || errorMsg.includes("os error 2")) { errorMsg = "Falta el administrador de políticas gráficas 'pkexec' en tu sistema Linux.\n\nPara solucionarlo, abre tu terminal y ejecuta:\n\nsudo apt install pkexec"; }
          alert(`⚠ No se pudo conectar a la VPN:\n\n${errorMsg}`); set({ ovpnPath: '' });
        }
      },

      disconnectVpn: async () => { try { await invoke('disconnect_vpn'); set({ vpnIp: null }); setTimeout(() => set({ vpnIp: null }), 2500); } catch (e: any) { alert(`⚠ No se pudo desconectar la VPN.\nDetalle: ${e}`); } },

      // ==========================================================
      // syncCommandString: SOLO actualiza commandString (cosmético).
      // NUNCA incluye -oN/-oG/-oX/-oA (eso lo controla el backend).
      // ==========================================================
      syncCommandString: () => {
        const s = get();
        const nmapArgs = buildNmapArgs(s);
        const finalCommand = buildCommandString(s, nmapArgs);
        set({ commandString: finalCommand });
      },

      setTarget: (t) => { set({ target: normalizeTarget(t) }); get().syncCommandString(); },
      setScanType: (t) => { if (t === 'ping') set({ useOSDetection: false, useServiceDetection: false, scanAllPorts: false, customPorts: '', topPorts: '', fastMode: false, nseCategory: '', nseArgs: '', aggressiveMode: false, customTcpFlags: '', dataString: '', dataHex: '', dataLength: '', scriptDefault: false, osScanGuess: false, onlyOpenPorts: false }); set({ scanType: t }); get().syncCommandString(); },
      setTiming: (t) => { set({ timing: t }); get().syncCommandString(); }, setDiscoveryMode: (m) => { set({ discoveryMode: m }); get().syncCommandString(); }, setField: (f, v) => { set({ [f]: v } as any); get().syncCommandString(); }, toggleOSDetection: () => { set((s) => ({ useOSDetection: !s.useOSDetection })); get().syncCommandString(); }, toggleServiceDetection: () => { set((s) => ({ useServiceDetection: !s.useServiceDetection })); get().syncCommandString(); }, toggleIPv6: () => { set((s) => ({ useIPv6: !s.useIPv6 })); get().syncCommandString(); }, toggleAllPorts: () => { set((s) => ({ scanAllPorts: !s.scanAllPorts, fastMode: false, topPorts: '', customPorts: '' })); get().syncCommandString(); }, toggleVerbose: () => { set((s) => ({ isVerbose: !s.isVerbose })); get().syncCommandString(); }, setNseCategory: (c) => { set({ nseCategory: c }); get().syncCommandString(); }, setNseArgs: (a) => { set({ nseArgs: a }); get().syncCommandString(); }, setCommandString: (c) => set({ commandString: c }),

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

      saveCustomProfile: (name: string) => { const s = get(); const newProfile: SavedProfile = { id: Date.now().toString(), name, config: { scanType: s.scanType, timing: s.timing, useOSDetection: s.useOSDetection, useServiceDetection: s.useServiceDetection, scanAllPorts: s.scanAllPorts, fastMode: s.fastMode, customPorts: s.customPorts, nseCategory: s.nseCategory, nseArgs: s.nseArgs, isVerbose: s.isVerbose, evasionFrag: s.evasionFrag, evasionDecoy: s.evasionDecoy, aggressiveMode: s.aggressiveMode, badsum: s.badsum, randomizeHosts: s.randomizeHosts, customTcpFlags: s.customTcpFlags, dataLength: s.dataLength, minRate: s.minRate, maxRetries: s.maxRetries, onlyOpenPorts: s.onlyOpenPorts, scriptDefault: s.scriptDefault, osScanGuess: s.osScanGuess, minHostgroup: s.minHostgroup, maxHostgroup: s.maxHostgroup, nmapOutputFormat: s.nmapOutputFormat, nmapOutputPrefix: s.nmapOutputPrefix, nmapOutputDir: s.nmapOutputDir } }; set((state) => ({ savedProfiles: [...state.savedProfiles, newProfile] })); },
      loadCustomProfile: (id: string) => { const profile = get().savedProfiles.find(p => p.id === id); if (profile) { set({ ...profile.config } as Partial<ScanState>); get().syncCommandString(); } },
      deleteCustomProfile: (id: string) => set((state) => ({ savedProfiles: state.savedProfiles.filter(p => p.id !== id) })),

      copyMasterConfig: () => { const s = get(); const configData = { command: s.commandString, target: s.target, timing: s.timing, flags: s.commandString.replace('nmap ', '').replace(s.target, '').trim() }; navigator.clipboard.writeText(JSON.stringify(configData, null, 2)); alert('Configuración Maestra (JSON) copiada al portapapeles.'); },
      setIsScanning: (s) => set({ isScanning: s }), appendOutput: (l) => set((s) => ({ output: [...s.output, l] })),
      clearOutput: () => set({ output: [], progressText: '', scanDuration: '0s' }), clearHistory: () => set({ historyData: [], parsedData: [] }),
      setParsedData: (d) => set((state) => ({ historyData: state.parsedData, parsedData: d })),
      updateHost: (ip, u) => set((s) => ({ parsedData: s.parsedData.map(h => h.ip === ip ? { ...h, ...u } : h) })),
      setProgressText: (t) => set({ progressText: t }), setScanDuration: (d) => set({ scanDuration: d }),

      cancelScan: async () => {
        try {
          if (!('__TAURI_INTERNALS__' in window)) { set({ isScanning: false, progressText: '' }); get().appendOutput('\n[!] DETENIDO (Modo Web Simulacro).'); return; }
          await invoke('cancel_nmap'); set({ isScanning: false, progressText: '' }); get().appendOutput('\n[!] DETENIDO POR EL USUARIO.');
        } catch (e) { console.error(e); }
      },

      playAudioAlert: () => {
        if (!get().soundEnabled) return;
        const vol = get().volume; if (vol <= 0) return;
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = ctx.createOscillator(); const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = 'sine'; osc.frequency.value = 880;
          gain.gain.setValueAtTime(vol / 100, ctx.currentTime); osc.start(); osc.stop(ctx.currentTime + 0.3);
        } catch (e) {}
      },

      notifyCompletion: async () => {
        get().playAudioAlert(); if (!('__TAURI_INTERNALS__' in window)) return;
        try {
            let permissionGranted = await isPermissionGranted();
            if (!permissionGranted) { const permission = await requestPermission(); permissionGranted = permission === 'granted'; }
            if (permissionGranted) sendNotification({ title: 'LESSSO C2', body: 'Auditoría Finalizada' });
        } catch (e) { console.error("Notificaciones no soportadas en este SO."); }
      },

      importWorkspace: (data) => set({ parsedData: data, historyData: [] }),

      // ==========================================================
      // getNmapArgs: devuelve el array EXACTO de args para el backend.
      // ==========================================================
      getNmapArgs: () => {
        const s = get();
        const args = buildNmapArgs(s);
        if (s.useRustScan) {
          return args.filter(a => a !== '--stats-every=5s');
        }
        return args;
      },

      syncWithBackend: async (target: string, scanDuration: string, data: HostInfo[]) => {
        if (!get().autoSaveEnabled) return;
        try {
          const response = await fetch('http://localhost:8001/api/scans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target, scan_duration: scanDuration, hosts: data }), });
          if (response.ok) get().appendOutput('\n[SISTEMA] Datos sincronizados con LESSSO Backend exitosamente.');
        } catch (err) {}
      }
    }),
    {
      name: 'lessso-c2-storage',
      // ==========================================================
      // partialize: qué se persiste en localStorage.
      // Sprint 2: ya NO se guarda `masterPasswordHash`.
      // Solo se guarda el blob cifrado de la bóveda.
      // ==========================================================
      partialize: (state) => state.autoSaveEnabled ? {
        encryptedVaultData: state.encryptedVaultData,
        parsedData: state.parsedData,
        historyData: state.historyData,
        redTeamNotes: state.redTeamNotes,
        redTeamWhiteboard: state.redTeamWhiteboard,
        savedProfiles: state.savedProfiles
        // OJO: NI `masterPasswordHash` NI `vaultCredentials` se guardan.
      } : {},
    }
  )
)
