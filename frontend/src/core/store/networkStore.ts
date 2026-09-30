import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { useScanStoreLocal } from './scanStore' // Necesario para disparar sync con backend.

const BACKEND_URL = 'http://localhost:8001';
export type BackendStatus = 'online' | 'offline' | 'unknown';

export interface NetworkState {
  vpnIp: string | null;
  ovpnPath: string;
  availableInterfaces: string[];
  backendStatus: BackendStatus;
  backendIsPinging: boolean;
  backendLastError: string | null;
  backendLastSyncAt: number | null;
  autoSaveEnabled: boolean;

  checkVpnStatus: () => Promise<void>;
  fetchInterfaces: () => Promise<void>;
  connectVpn: () => Promise<void>;
  disconnectVpn: () => Promise<void>;
  setBackendStatus: (status: BackendStatus, error?: string | null) => void;
  pingBackend: () => Promise<boolean>;
  toggleAutoSave: () => void;
  syncWithBackend: (target: string, scanDuration: string, data: any[]) => Promise<void>;
}

export const useNetworkStore = create<NetworkState>()(
  persist(
    (set, get) => ({
      vpnIp: null,
      ovpnPath: '',
      availableInterfaces: [],
      backendStatus: 'unknown',
      backendIsPinging: false,
      backendLastError: null,
      backendLastSyncAt: null,
      autoSaveEnabled: true,

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

      setBackendStatus: (status, error = null) => {
        set({
          backendStatus: status,
          backendLastError: error,
          ...(status === 'online' ? { backendLastSyncAt: Date.now() } : {}),
        });
      },

      pingBackend: async () => {
        if (get().backendIsPinging) return false;
        set({ backendIsPinging: true });
        const previousStatus = get().backendStatus;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          const response = await fetch(`${BACKEND_URL}/`, { method: 'GET', signal: controller.signal });
          clearTimeout(timeoutId);

          if (response.ok) {
            get().setBackendStatus('online');
            if (previousStatus !== 'online') useScanStoreLocal.getState().appendOutput('\n[OK] Backend verificado: ONLINE');
            set({ backendIsPinging: false });
            return true;
          }
          const errorMsg = `HTTP ${response.status} ${response.statusText}`;
          get().setBackendStatus('offline', errorMsg);
          if (previousStatus !== 'offline') useScanStoreLocal.getState().appendOutput(`\n[WARN] Backend respondió con error: ${errorMsg}`);
          set({ backendIsPinging: false });
          return false;
        } catch (err) {
          const rawMsg = err instanceof Error ? err.message : String(err);
          const isAbort = err instanceof Error && err.name === 'AbortError';

          let friendlyMsg: string;
          if (isAbort) friendlyMsg = 'Timeout (el backend tardó >3s en responder)';
          else if (rawMsg.includes('Failed to fetch') || rawMsg.includes('NetworkError')) friendlyMsg = 'No se pudo conectar (¿backend apagado?)';
          else if (rawMsg.includes('Connection refused')) friendlyMsg = 'Conexión rechazada (¿backend no está corriendo?)';
          else friendlyMsg = rawMsg;

          get().setBackendStatus('offline', friendlyMsg);
          if (previousStatus !== 'offline') useScanStoreLocal.getState().appendOutput(`\n[ERR] Backend OFFLINE: ${friendlyMsg}`);
          set({ backendIsPinging: false });
          return false;
        }
      },

      toggleAutoSave: () => set((s) => ({ autoSaveEnabled: !s.autoSaveEnabled })),

      syncWithBackend: async (target: string, scanDuration: string, data: any[]) => {
        if (!get().autoSaveEnabled) return;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);

          const response = await fetch(`${BACKEND_URL}/api/scans`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target, scan_duration: scanDuration, hosts: data }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            get().setBackendStatus('online');
            useScanStoreLocal.getState().appendOutput('\n[OK] Datos sincronizados con LESSSO Backend exitosamente.');
          } else {
            const errorMsg = `HTTP ${response.status} ${response.statusText}`;
            get().setBackendStatus('offline', errorMsg);
            useScanStoreLocal.getState().appendOutput(`\n[WARN] Error sincronizando con backend: ${errorMsg}`);
          }
        } catch (err) {
          const rawMsg = err instanceof Error ? err.message : String(err);
          const isAbort = err instanceof Error && err.name === 'AbortError';

          let friendlyMsg: string;
          if (isAbort) friendlyMsg = 'Timeout (el backend tardó >5s en responder)';
          else if (rawMsg.includes('Failed to fetch') || rawMsg.includes('NetworkError')) friendlyMsg = 'No se pudo conectar (¿backend apagado?)';
          else if (rawMsg.includes('Connection refused')) friendlyMsg = 'Conexión rechazada (¿backend no está corriendo?)';
          else friendlyMsg = rawMsg;

          get().setBackendStatus('offline', friendlyMsg);
          useScanStoreLocal.getState().appendOutput(
            `\n[WARN] No se pudo sincronizar con el backend (${friendlyMsg}). ` +
            `Los datos siguen guardados localmente.`
          );
        }
      },
    }),
    {
      name: 'lessso-c2-networkStore',
      partialize: (state) => ({
        autoSaveEnabled: state.autoSaveEnabled,
        backendStatus: state.backendStatus,
      }),
    }
  )
)
