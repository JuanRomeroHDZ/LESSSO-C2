import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ==========================================================
// FIRMAS DE REPORTE
// ==========================================================
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

// ==========================================================
// EXAM TIMER
// ==========================================================
export type ExamPhase = 'recon' | 'enum' | 'exploit' | 'privesc' | 'loot' | 'done'

export interface PhaseLogEntry {
  phase: ExamPhase
  startedAt: string // ISO UTC
  endedAt?: string  // ISO UTC
  durationMs?: number
}

export const EXAM_PHASES: ExamPhase[] = ['recon', 'enum', 'exploit', 'privesc', 'loot']
export const DEFAULT_EXAM_DURATION_MS = 8 * 60 * 60 * 1000 // 8h

// ==========================================================
// ESTADO
// ==========================================================
export interface UiState {
  // Tema / UI general
  theme: 'light' | 'dark'
  compactMode: boolean
  zenMode: boolean
  volume: number
  soundEnabled: boolean
  isTerminalOpen: boolean
  activeWorkspace: string
  quickNotesOpen: boolean

  // Reporte
  cveAutoEnrich: boolean
  includeCvss: boolean
  signature: ReportSignature

  // Exam timer
  examStartAt: number | null          // epoch ms del botón Start (no se mueve)
  examDurationMs: number              // duración configurada
  examRunning: boolean                // false = pausado
  examPausedAt: number | null         // epoch ms de la última pausa
  examElapsedBeforePause: number      // ms acumulados antes de la pausa actual
  currentPhase: ExamPhase
  phaseLog: PhaseLogEntry[]

  // Acciones UI
  toggleTheme: () => void
  toggleCompactMode: () => void
  toggleZenMode: () => void
  setVolume: (v: number) => void
  toggleSound: () => void
  setIsTerminalOpen: (v: boolean) => void
  setActiveWorkspace: (workspace: string) => void
  toggleQuickNotes: () => void

  setCveAutoEnrich: (v: boolean) => void
  toggleCveAutoEnrich: () => void

  setIncludeCvss: (v: boolean) => void
  toggleIncludeCvss: () => void

  setSignature: (patch: Partial<ReportSignature>) => void
  clearSignature: () => void

  // Acciones del timer
  startExam: (durationMs?: number) => void
  pauseExam: () => void
  resumeExam: () => void
  resetExam: () => void
  setExamDuration: (durationMs: number) => void
  setPhase: (phase: ExamPhase) => void
  /** Devuelve los ms restantes (o la duración si no se ha iniciado). */
  getRemainingMs: () => number
}

// ==========================================================
// STORE
// ==========================================================
export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      // ---------- UI ----------
      theme: 'light',
      compactMode: false,
      zenMode: false,
      volume: 1.0,
      soundEnabled: true,
      isTerminalOpen: false,
      activeWorkspace: 'scanner',
      quickNotesOpen: false,

      // ---------- Reporte ----------
      cveAutoEnrich: true,
      includeCvss: true,
      signature: { ...EMPTY_SIGNATURE },

      // ---------- Timer ----------
      examStartAt: null,
      examDurationMs: DEFAULT_EXAM_DURATION_MS,
      examRunning: false,
      examPausedAt: null,
      examElapsedBeforePause: 0,
      currentPhase: 'recon',
      phaseLog: [],

      // ---------- Acciones UI ----------
      toggleTheme: () =>
        set((state) => {
          const nt = state.theme === 'light' ? 'dark' : 'light'
          if (nt === 'dark') document.documentElement.classList.add('dark')
          else document.documentElement.classList.remove('dark')
          return { theme: nt }
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

      // ---------- Acciones Timer ----------
      startExam: (durationMs) => {
        const now = Date.now()
        const iso = new Date(now).toISOString()
        set({
          examStartAt: now,
          examDurationMs: durationMs ?? get().examDurationMs ?? DEFAULT_EXAM_DURATION_MS,
          examRunning: true,
          examPausedAt: null,
          examElapsedBeforePause: 0,
          currentPhase: 'recon',
          phaseLog: [{ phase: 'recon', startedAt: iso }],
        })
      },

      pauseExam: () => {
        if (!get().examRunning) return
        set({ examRunning: false, examPausedAt: Date.now() })
      },

      resumeExam: () => {
        const { examPausedAt, examElapsedBeforePause } = get()
        if (!examPausedAt) return
        const pausedFor = Date.now() - examPausedAt
        set({
          examRunning: true,
          examPausedAt: null,
          examElapsedBeforePause: examElapsedBeforePause + pausedFor,
        })
      },

      resetExam: () =>
        set({
          examStartAt: null,
          examRunning: false,
          examPausedAt: null,
          examElapsedBeforePause: 0,
          currentPhase: 'recon',
          phaseLog: [],
        }),

      setExamDuration: (durationMs) => set({ examDurationMs: durationMs }),

      setPhase: (phase) => {
        const now = Date.now()
        const iso = new Date(now).toISOString()
        const log = [...get().phaseLog]
        const last = log[log.length - 1]
        if (last && !last.endedAt) {
          last.endedAt = iso
          last.durationMs = now - new Date(last.startedAt).getTime()
        }
        if (phase !== 'done') {
          log.push({ phase, startedAt: iso })
        }
        set({ currentPhase: phase, phaseLog: log })
      },

      getRemainingMs: () => {
        const s = get()
        if (!s.examStartAt) return s.examDurationMs
        const now = s.examRunning ? Date.now() : (s.examPausedAt ?? Date.now())
        const elapsed = now - s.examStartAt - s.examElapsedBeforePause
        return Math.max(0, s.examDurationMs - elapsed)
      },
    }),
    {
      name: 'lessso-c2-uiStore',
      // Persistimos solo lo "durable". El timer NO persiste
      // `examRunning`/`examPausedAt` a propósito: si cierras la app
      // con el timer corriendo, al reabrir aparece pausado en el
      // punto donde quedó, no "recupera" tiempo de fondo.
      partialize: (state) => ({
        theme: state.theme,
        compactMode: state.compactMode,
        volume: state.volume,
        soundEnabled: state.soundEnabled,
        cveAutoEnrich: state.cveAutoEnrich,
        includeCvss: state.includeCvss,
        signature: state.signature,

        // Timer: solo lo persistente
        examStartAt: state.examStartAt,
        examDurationMs: state.examDurationMs,
        examElapsedBeforePause: state.examElapsedBeforePause,
        currentPhase: state.currentPhase,
        phaseLog: state.phaseLog,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.theme === 'dark') {
          document.documentElement.classList.add('dark')
        } else if (state?.theme === 'light') {
          document.documentElement.classList.remove('dark')
        }
        // Si había un examen iniciado, forzamos modo pausado al
        // rehidratar (no queremos que corra sin ventana).
        if (state?.examStartAt) {
          state.examRunning = false
          state.examPausedAt = Date.now()
        }
      },
    }
  )
)

export function applyInitialTheme(): void {
  const { theme } = useUiStore.getState()
  if (theme === 'dark') document.documentElement.classList.add('dark')
  else document.documentElement.classList.remove('dark')
}
