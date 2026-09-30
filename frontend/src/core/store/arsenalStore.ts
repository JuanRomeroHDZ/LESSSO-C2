import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_PLACEHOLDERS, type ArsenalPlaceholders } from '../data/arsenal-types'

export interface ArsenalState {
  arsenalSelectedId: string | null;
  arsenalPinnedIds: string[];
  arsenalRecentIds: string[];
  arsenalPlaceholders: ArsenalPlaceholders;

  setArsenalSelected: (id: string | null) => void;
  toggleArsenalPin: (id: string) => void;
  pushArsenalRecent: (id: string) => void;
  setArsenalPlaceholder: <K extends keyof ArsenalPlaceholders>(key: K, value: ArsenalPlaceholders[K]) => void;
  resetArsenalPlaceholders: () => void;
  clearArsenalRecent: () => void;
}

export const useArsenalStore = create<ArsenalState>()(
  persist(
    (set, get) => ({
      arsenalSelectedId: null,
      arsenalPinnedIds: [],
      arsenalRecentIds: [],
      arsenalPlaceholders: { ...DEFAULT_PLACEHOLDERS },

      setArsenalSelected: (id) => set({ arsenalSelectedId: id }),

      toggleArsenalPin: (id) => {
        const s = get();
        const isPinned = s.arsenalPinnedIds.includes(id);
        set({
          arsenalPinnedIds: isPinned
            ? s.arsenalPinnedIds.filter(x => x !== id)
            : [...s.arsenalPinnedIds, id],
        });
      },

      pushArsenalRecent: (id) => {
        const s = get();
        const filtered = s.arsenalRecentIds.filter(x => x !== id);
        const recent = [id, ...filtered].slice(0, 10);
        set({ arsenalRecentIds: recent });
      },

      setArsenalPlaceholder: (key, value) => {
        const s = get();
        set({
          arsenalPlaceholders: { ...s.arsenalPlaceholders, [key]: value },
        });
      },

      resetArsenalPlaceholders: () => {
        set({ arsenalPlaceholders: { ...DEFAULT_PLACEHOLDERS } });
      },

      clearArsenalRecent: () => set({ arsenalRecentIds: [] }),
    }),
    {
      name: 'lessso-c2-arsenalStore',
      partialize: (state) => ({
        arsenalPinnedIds: state.arsenalPinnedIds,
        arsenalRecentIds: state.arsenalRecentIds,
        arsenalPlaceholders: state.arsenalPlaceholders,
      }),
    }
  )
)
