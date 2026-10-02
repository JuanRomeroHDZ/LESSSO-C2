import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ==========================================================
// FIRMAS DE REPORTE (MULTIFIRMA)
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
// EXAM TIMER & TO-DO
// ==========================================================
export type ExamPhase = 'recon' | 'enum' | 'exploit' | 'privesc' | 'loot' | 'done'

export interface PhaseLogEntry {
  phase: ExamPhase
  startedAt: string // ISO UTC
  endedAt?: string  // ISO UTC
  durationMs?: number
}

export interface TodoItem {
  id: string
  text: string
  done: boolean
}

export const EXAM_PHASES: ExamPhase[] = ['recon', 'enum', 'exploit', 'privesc', 'loot']
export const DEFAULT_EXAM_DURATION_MS = 8 * 60 * 60 - 1000 // 8h

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
  todoPanelOpen: boolean

  // Integraciones (BYOK)
  nistApiKey: string

  // Reporte
  cveAutoEnrich: boolean
  includeCvss: boolean
  includeMetrics: boolean      
  includeInventory: boolean    
  
  // Soporte para Múltiples Firmantes
  signatures: {
    auditor: ReportSignature;
    reviewer: ReportSignature;
  }

  // Exam timer y Tareas
  examStartAt: number | null         
  examDurationMs: number             
  examRunning: boolean               
  examPausedAt: number | null        
  examElapsedBeforePause: number     
  currentPhase: ExamPhase
  phaseLog: PhaseLogEntry[]
  todos: TodoItem[]

  // Acciones UI
  toggleTheme: () => void
  toggleCompactMode: () => void
  toggleZenMode: () => void
  setVolume: (v: number) => void
  toggleSound: () => void
  setIsTerminalOpen: (v: boolean) => void
  setActiveWorkspace: (workspace: string) => void
  toggleQuickNotes: () => void
  toggleTodoPanel: () => void

  setNistApiKey: (key: string) => void

  setCveAutoEnrich: (v: boolean) => void
  toggleCveAutoEnrich: () => void

  setIncludeCvss: (v: boolean) => void
  toggleIncludeCvss: () => void

  toggleIncludeMetrics: () => void   
  toggleIncludeInventory: () => void 

  // Acciones de Firma Dual
  setSignature: (type: 'auditor' | 'reviewer', patch: Partial<ReportSignature>) => void
  clearSignature: (type: 'auditor' | 'reviewer') => void

  // Acciones del timer y Tareas
  startExam: (durationMs?: number) => void
  pauseExam: () => void
  resumeExam: () => void
  resetExam: () => void
  setExamDuration: (durationMs: number) => void
  setPhase: (phase: ExamPhase) => void
  getRemainingMs: () => number

  addTodo: (text: string) => void
  toggleTodo: (id: string) => void
  removeTodo: (id: string) => void
  clearTodos: () => void
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
      todoPanelOpen: false,

      // ---------- Integraciones ----------
      nistApiKey: '',

      // ---------- Reporte ----------
      cveAutoEnrich: true,
      includeCvss: true,
      includeMetrics: true,    
      includeInventory: true,  
      signatures: {
        auditor: { ...EMPTY_SIGNATURE },
        reviewer: { ...EMPTY_SIGNATURE }
      },

      // ---------- Timer & Todos ----------
      examStartAt: null,
      examDurationMs: DEFAULT_EXAM_DURATION_MS,
      examRunning: false,
      examPausedAt: null,
      examElapsedBeforePause: 0,
      currentPhase: 'recon',
      phaseLog: [],
      todos: [],

      // ---------- Acciones UI ----------
      toggleTheme: () =>
        set((state: UiState) => {
          const nt = state.theme === 'light' ? 'dark' : 'light'
          if (nt === 'dark') document.documentElement.classList.add('dark')
          else document.documentElement.classList.remove('dark')
          return { theme: nt }
        }),
      toggleCompactMode: () => set((s: UiState) => ({ compactMode: !s.compactMode })),
      toggleZenMode: () => set((s: UiState) => ({ zenMode: !s.zenMode })),
      setVolume: (v) => set({ volume: v }),
      toggleSound: () => set((s: UiState) => ({ soundEnabled: !s.soundEnabled })),
      setIsTerminalOpen: (v) => set({ isTerminalOpen: v }),
      setActiveWorkspace: (workspace) => set({ activeWorkspace: workspace }),
      toggleQuickNotes: () => set((s: UiState) => ({ quickNotesOpen: !s.quickNotesOpen })),
      toggleTodoPanel: () => set((s: UiState) => ({ todoPanelOpen: !s.todoPanelOpen })),

      setNistApiKey: (key) => set({ nistApiKey: key }),

      setCveAutoEnrich: (v) => set({ cveAutoEnrich: v }),
      toggleCveAutoEnrich: () => set((s: UiState) => ({ cveAutoEnrich: !s.cveAutoEnrich })),

      setIncludeCvss: (v) => set({ includeCvss: v }),
      toggleIncludeCvss: () => set((s: UiState) => ({ includeCvss: !s.includeCvss })),

      toggleIncludeMetrics: () => set((s: UiState) => ({ includeMetrics: !s.includeMetrics })),
      toggleIncludeInventory: () => set((s: UiState) => ({ includeInventory: !s.includeInventory })),

      setSignature: (type, patch) =>
        set((s: UiState) => ({
          signatures: {
            ...s.signatures,
            [type]: { ...s.signatures[type], ...patch }
          }
        })),
      
      clearSignature: (type) =>  
        set((s: UiState) => ({
          signatures: {
            ...s.signatures,
            [type]: { ...EMPTY_SIGNATURE }
          }
        })),

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

      // ---------- Acciones Tareas ----------
      addTodo: (text) => set((s: UiState) => ({ todos: [{ id: Date.now().toString(), text, done: false }, ...s.todos] })),
      toggleTodo: (id) => set((s: UiState) => ({ todos: s.todos.map((t: TodoItem) => t.id === id ? { ...t, done: !t.done } : t) })),
      removeTodo: (id) => set((s: UiState) => ({ todos: s.todos.filter((t: TodoItem) => t.id !== id) })),
      clearTodos: () => set({ todos: [] }),

    }),
    {
      name: 'lessso-c2-uiStore',
      partialize: (state) => ({
        theme: state.theme,
        compactMode: state.compactMode,
        volume: state.volume,
        soundEnabled: state.soundEnabled,
        nistApiKey: state.nistApiKey,
        cveAutoEnrich: state.cveAutoEnrich,
        includeCvss: state.includeCvss,
        includeMetrics: state.includeMetrics,
        includeInventory: state.includeInventory,
        signatures: state.signatures,
        examStartAt: state.examStartAt,
        examDurationMs: state.examDurationMs,
        examElapsedBeforePause: state.examElapsedBeforePause,
        currentPhase: state.currentPhase,
        phaseLog: state.phaseLog,
        todos: state.todos,
      }),
      onRehydrateStorage: () => (state: any) => {
        if (state?.theme === 'dark') {
          document.documentElement.classList.add('dark')
        } else if (state?.theme === 'light') {
          document.documentElement.classList.remove('dark')
        }
        if (state?.examStartAt) {
          state.examRunning = false
          state.examPausedAt = Date.now()
        }
        if (state?.signature && !state?.signatures) {
           state.signatures = {
             auditor: state.signature,
             reviewer: { ...EMPTY_SIGNATURE }
           };
           delete state.signature;
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
