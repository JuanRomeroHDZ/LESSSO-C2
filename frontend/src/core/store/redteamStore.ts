import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { invoke } from '@tauri-apps/api/core'

export interface RedteamState {
  redTeamNotes: string;
  setRedTeamNotes: (notes: string) => void;
  redTeamWhiteboard: any;
  setRedTeamWhiteboard: (data: any) => void;

  fuzzerUrl: string;
  fuzzerRawOutput: string;
  isFuzzing: boolean;
  startFuzzer: (url: string, wordlist: string) => Promise<void>;
  clearFuzzer: () => void;
}

export const useRedteamStore = create<RedteamState>()(
  persist(
    (set) => ({
      redTeamNotes: '',
      setRedTeamNotes: (notes: string) => {
        const autoTagged = notes.replace(/#T([0-9]{4})/g, "[MITRE: T$1]");
        set({ redTeamNotes: autoTagged });
      },
      redTeamWhiteboard: null,
      setRedTeamWhiteboard: (data: any) => set({ redTeamWhiteboard: data }),

      fuzzerUrl: '',
      fuzzerRawOutput: '',
      isFuzzing: false,
      clearFuzzer: () => set({ fuzzerRawOutput: '', isFuzzing: false }),
      startFuzzer: async (url, wordlist) => {
        set({ isFuzzing: true, fuzzerRawOutput: '>>> Iniciando Motor Fuzzer (Gobuster)...\n', fuzzerUrl: url });
        try {
          await invoke('run_fuzzer', { targetUrl: url, wordlist });
        } catch (e: any) {
          set((s) => ({ fuzzerRawOutput: s.fuzzerRawOutput + `\n[ERR]: ${e}\n`, isFuzzing: false }));
        }
      },
    }),
    {
      name: 'lessso-c2-redteamStore',
      partialize: (state) => ({
        redTeamNotes: state.redTeamNotes,
        redTeamWhiteboard: state.redTeamWhiteboard,
      }),
    }
  )
)
