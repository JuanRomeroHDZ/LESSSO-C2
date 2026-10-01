import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ReportSignature {
  name: string
  role: string
  company: string
  date: string
}

export const EMPTY_SIGNATURE: ReportSignature = {
  name: '',
  role: '',
  company: '',
  date: '',
}

export interface UiState {
  theme: 'light' | 'dark';
  compactMode: boolean;
  zenMode: boolean;
  volume: number;
  soundEnabled: boolean;
  isTerminalOpen: boolean;
  activeWorkspace: string;
  quickNotesOpen: boolean;

  cveAutoEnrich: boolean;
  includeCvss: boolean;
  signature: ReportSignature;

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

  setIncludeCvss: (v: boolean) => void;
  toggleIncludeCvss: () => void;

  setSignature: (patch: Partial<ReportSignature>) => void;
  clearSignature: () => void;
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
      includeCvss: true,
      signature: { ...EMPTY_SIGNATURE },

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

      setIncludeCvss: (v) => set({ includeCvss: v }),
      toggleIncludeCvss: () => set((s) => ({ includeCvss: !s.includeCvss })),

      setSignature: (patch) =>
        set((s) => ({ signature: { ...s.signature, ...patch } })),
      clearSignature: () => set({ signature: { ...EMPTY_SIGNATURE } }),
    }),
    {
      name: 'lessso-c2-uiStore',
      partialize: (state) => ({
        theme: state.theme,
        compactMode: state.compactMode,
        volume: state.volume,
        soundEnabled: state.soundEnabled,
        cveAutoEnrich: state.cveAutoEnrich,
        includeCvss: state.includeCvss,
        signature: state.signature,
      }),
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

export function applyInitialTheme(): void {
  const { theme } = useUiStore.getState();
  if (theme === 'dark') document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
}
