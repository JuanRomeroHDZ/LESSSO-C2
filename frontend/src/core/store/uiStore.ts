import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface UiState {
  theme: 'light' | 'dark';
  compactMode: boolean;
  zenMode: boolean;
  volume: number;
  soundEnabled: boolean;
  isTerminalOpen: boolean;
  activeWorkspace: string;
  quickNotesOpen: boolean;

  /**
   * Si está activo, al recibir un scan se llama al backend
   * (`POST /api/cves/match`) para enriquecer cada puerto abierto
   * con CVEs reales de NVD. Si el backend falla, se cae al
   * matching heurístico local (`detectCVEs`).
   *
   * Desactivar en escaneos muy grandes o si no hay red.
   */
  cveAutoEnrich: boolean;

  toggleTheme: () => void;
  toggleCompactMode: () => void;
  toggleZenMode: () => void;
  setVolume: (v: number) => void;
  toggleSound: () => void;
  setIsTerminalOpen: (v: boolean) => void;
  setActiveWorkspace: (workspace: string) => void;
  toggleQuickNotes: () => void;

  setCveAutoEnrich: (v: boolean) => void;
  toggleCveAutoEnrich: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'light',
      compactMode: false,
      zenMode: false,
      volume: 50,
      soundEnabled: true,
      isTerminalOpen: false,
      activeWorkspace: 'recon',
      quickNotesOpen: false,
      cveAutoEnrich: true,

      toggleTheme: () =>
        set((state) => {
          const nt = state.theme === 'light' ? 'dark' : 'light';
          if (nt === 'dark') document.documentElement.classList.add('dark');
          else document.documentElement.classList.remove('dark');
          return { theme: nt };
        }),
      toggleCompactMode: () => set((s) => ({ compactMode: !s.compactMode })),
      toggleZenMode: () => set((s) => ({ zenMode: !s.zenMode })),
      setVolume: (v) => set({ volume: v }),
      toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),
      setIsTerminalOpen: (v) => set({ isTerminalOpen: v }),
      setActiveWorkspace: (workspace) => set({ activeWorkspace: workspace }),
      toggleQuickNotes: () => set((s) => ({ quickNotesOpen: !s.quickNotesOpen })),

      setCveAutoEnrich: (v) => set({ cveAutoEnrich: v }),
      toggleCveAutoEnrich: () => set((s) => ({ cveAutoEnrich: !s.cveAutoEnrich })),
    }),
    {
      name: 'lessso-c2-uiStore',
      partialize: (state) => ({
        theme: state.theme,
        compactMode: state.compactMode,
        volume: state.volume,
        soundEnabled: state.soundEnabled,
        cveAutoEnrich: state.cveAutoEnrich,
      }),
      // Al rehidratar, aplicamos el tema al <html> inmediatamente
      // para evitar el flash de tema claro.
      onRehydrateStorage: () => (state) => {
        if (state?.theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else if (state?.theme === 'light') {
          document.documentElement.classList.remove('dark');
        }
      },
    }
  )
)

/**
 * Aplica el tema actual al <html>. Llámalo una vez al montar
 * la app (en `main.tsx` o `App.tsx`) por si acaso el `onRehydrate`
 * no dispara (SSR, tests, etc.).
 */
export function applyInitialTheme(): void {
  const { theme } = useUiStore.getState();
  if (theme === 'dark') document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
}
