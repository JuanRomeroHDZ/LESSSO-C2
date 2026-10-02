import { useEffect, useRef, useState } from 'react'
import { useUiStore } from '../../core/store/uiStore'
import { Timer, Play, Settings, RotateCcw, Pause } from 'lucide-react'

const DURATION_PRESETS = [2, 4, 6, 8, 12] as const

function formatHHMMSS(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = String(Math.floor(total / 3600)).padStart(2, '0')
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function remainingMs(): number {
  return useUiStore.getState().getRemainingMs()
}

// NUEVO: Aceptamos una prop 'silent' para desactivar notificaciones en instancias secundarias
export function ExamTimer({ silent = false }: { silent?: boolean } = {}) {
  const examStartAt = useUiStore((s) => s.examStartAt)
  const examRunning = useUiStore((s) => s.examRunning)
  const examDurationMs = useUiStore((s) => s.examDurationMs)
  const examPausedAt = useUiStore((s) => s.examPausedAt)

  const startExam = useUiStore((s) => s.startExam)
  const pauseExam = useUiStore((s) => s.pauseExam)
  const resumeExam = useUiStore((s) => s.resumeExam)
  const resetExam = useUiStore((s) => s.resetExam)
  const setExamDuration = useUiStore((s) => s.setExamDuration)

  const [remaining, setRemaining] = useState<number>(() => remainingMs())
  const [showCfg, setShowCfg] = useState(false)

  const notifiedHoursRef = useRef<Set<number>>(new Set())
  const notifiedFiveMinRef = useRef(false)

  useEffect(() => {
    setRemaining(remainingMs())
    const id = window.setInterval(() => {
      setRemaining(remainingMs())
    }, 1000)
    return () => window.clearInterval(id)
  }, [examStartAt, examRunning, examPausedAt, examDurationMs])

  useEffect(() => {
    if (!examStartAt) {
      notifiedHoursRef.current = new Set()
      notifiedFiveMinRef.current = false
    }
  }, [examStartAt])

  useEffect(() => {
    // Si es un reloj secundario (silent), no disparamos notificaciones
    if (silent) return; 
    
    if (!examStartAt || !examRunning) return
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'granted') return

    const elapsed = examDurationMs - remaining

    for (let h = 1; h <= 12; h++) {
      const mark = h * 3_600_000
      if (
        elapsed >= mark &&
        elapsed - mark < 1500 &&
        !notifiedHoursRef.current.has(h)
      ) {
        notifiedHoursRef.current.add(h)
        new Notification('LESSSO C2 — Examen', { body: `Ha pasado ${h}h` })
      }
    }

    const fiveMin = 5 * 60_000
    if (
      remaining <= fiveMin &&
      remaining > fiveMin - 1500 &&
      !notifiedFiveMinRef.current
    ) {
      notifiedFiveMinRef.current = true
      new Notification('LESSSO C2 — Examen', { body: '¡Quedan 5 minutos!' })
    }
  }, [remaining, examStartAt, examRunning, examDurationMs, silent])

  useEffect(() => {
    if (!silent && examStartAt && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [examStartAt, silent])

  const pct = examDurationMs > 0 ? remaining / examDurationMs : 0
  const colorClass =
    pct > 0.5
      ? 'text-teal-600 dark:text-teal-400'
      : pct > 0.2
        ? 'text-amber-500 dark:text-amber-400'
        : 'text-rose-600 dark:text-rose-400 animate-pulse'

  const durationLabel = `${(examDurationMs / 3_600_000).toFixed(0)}h`

  return (
    <div className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 select-none shadow-sm h-full">
      <Timer size={14} className="text-slate-400" />
      <span
        className={`font-mono text-xs tabular-nums font-bold tracking-wider ${colorClass}`}
        title={
          examStartAt
            ? `Iniciado: ${new Date(examStartAt).toISOString()} · Duración: ${durationLabel}`
            : `Duración configurada: ${durationLabel}`
        }
      >
        {formatHHMMSS(remaining)}
      </span>

      {!examStartAt && (
        <>
          <button
            type="button"
            onClick={() => startExam()}
            className="flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded bg-teal-500/10 hover:bg-teal-500/20 text-teal-600 dark:text-teal-400 border border-teal-500/30 transition-colors"
            title="Iniciar cronómetro"
          >
            <Play size={10} className="fill-current" /> Start
          </button>
          <button
            type="button"
            onClick={() => setShowCfg((v) => !v)}
            className="p-1 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-500 transition-colors"
            title="Duración del examen"
          >
            <Settings size={12} />
          </button>

          {showCfg && (
            <div className="absolute top-full mt-2 right-0 z-50 bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-lg p-2 shadow-xl flex gap-1">
              {DURATION_PRESETS.map((h) => {
                const active = examDurationMs === h * 3_600_000
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => {
                      setExamDuration(h * 3_600_000)
                      setShowCfg(false)
                    }}
                    className={
                      'text-xs px-2.5 py-1 rounded font-bold transition-colors ' +
                      (active
                        ? 'bg-teal-500 text-slate-950'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700')
                    }
                  >
                    {h}h
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {examStartAt && (
        <>
          {examRunning ? (
            <button type="button" onClick={pauseExam} className="p-1 rounded bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-500 transition-colors" title="Pausar">
              <Pause size={12} className="fill-current" />
            </button>
          ) : (
            <button type="button" onClick={resumeExam} className="p-1 rounded bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-500 transition-colors" title="Reanudar">
              <Play size={12} className="fill-current" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (window.confirm('¿Reiniciar el cronómetro? Se perderá el log de fases.')) {
                resetExam()
              }
            }}
            className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-500 transition-colors"
            title="Reiniciar"
          >
            <RotateCcw size={12} />
          </button>
        </>
      )}
    </div>
  )
}

