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

  toggleTheme: () => void;
  toggleCompactMode: () => void;
  toggleZenMode: () => void;
  setVolume: (v: number) => void;
  toggleSound: () => void;
  setIsTerminalOpen: (v: boolean) => void;
  setActiveWorkspace: (workspace: string) => void;
  toggleQuickNotes: () => void;
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

      toggleTheme: () => set((state) => {
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
    }),
    {
      name: 'lessso-c2-uiStore',
      partialize: (state) => ({
        theme: state.theme,
        compactMode: state.compactMode,
        volume: state.volume,
        soundEnabled: state.soundEnabled,
      }),
    }
  )
)
