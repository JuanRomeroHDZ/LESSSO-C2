import { useEffect, useRef, useState } from 'react'
import { useUiStore } from '../../core/store/uiStore'

// ==========================================================
// LESSSO C2 — Exam Timer
// ----------------------------------------------------------
// Componente de cuenta atrás para exámenes (OSCP/CPTS/HTB).
//
// - Muestra HH:MM:SS con color según % restante.
// - Botón Start con selector de duración (2/4/6/8/12h).
// - Pausa / Reanudar / Reset.
// - Notificación del sistema cada hora cumplida y a los 5 min.
// - Lee y escribe del uiStore (fuente de verdad única).
// ==========================================================

const DURATION_PRESETS = [2, 4, 6, 8, 12] as const // horas

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

export function ExamTimer() {
  // Suscripciones reactivas
  const examStartAt = useUiStore((s) => s.examStartAt)
  const examRunning = useUiStore((s) => s.examRunning)
  const examDurationMs = useUiStore((s) => s.examDurationMs)
  const examPausedAt = useUiStore((s) => s.examPausedAt)

  // Acciones
  const startExam = useUiStore((s) => s.startExam)
  const pauseExam = useUiStore((s) => s.pauseExam)
  const resumeExam = useUiStore((s) => s.resumeExam)
  const resetExam = useUiStore((s) => s.resetExam)
  const setExamDuration = useUiStore((s) => s.setExamDuration)

  // Estado local del tick
  const [remaining, setRemaining] = useState<number>(() => remainingMs())
  const [showCfg, setShowCfg] = useState(false)

  // Ref para no disparar notificación en cada render
  const notifiedHoursRef = useRef<Set<number>>(new Set())
  const notifiedFiveMinRef = useRef(false)

  // Tick cada segundo. Se re-suscribe cuando cambia algo relevante.
  useEffect(() => {
    setRemaining(remainingMs())
    const id = window.setInterval(() => {
      setRemaining(remainingMs())
    }, 1000)
    return () => window.clearInterval(id)
  }, [examStartAt, examRunning, examPausedAt, examDurationMs])

  // Reset de las banderas de notificación al reiniciar
  useEffect(() => {
    if (!examStartAt) {
      notifiedHoursRef.current = new Set()
      notifiedFiveMinRef.current = false
    }
  }, [examStartAt])

  // Notificaciones del sistema
  useEffect(() => {
    if (!examStartAt || !examRunning) return
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'granted') return

    const elapsed = examDurationMs - remaining

    // Aviso cada hora cumplida (1h..12h)
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

    // Aviso 5 min finales (una sola vez)
    const fiveMin = 5 * 60_000
    if (
      remaining <= fiveMin &&
      remaining > fiveMin - 1500 &&
      !notifiedFiveMinRef.current
    ) {
      notifiedFiveMinRef.current = true
      new Notification('LESSSO C2 — Examen', { body: '¡Quedan 5 minutos!' })
    }
  }, [remaining, examStartAt, examRunning, examDurationMs])

  // Pedir permiso de notificaciones la primera vez que arranca
  useEffect(() => {
    if (examStartAt && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [examStartAt])

  // Color según % restante
  const pct = examDurationMs > 0 ? remaining / examDurationMs : 0
  const colorClass =
    pct > 0.5
      ? 'text-emerald-600 dark:text-emerald-400'
      : pct > 0.2
        ? 'text-yellow-600 dark:text-yellow-400'
        : 'text-red-600 dark:text-red-400 animate-pulse'

  // Etiqueta de duración configurada
  const durationLabel = `${(examDurationMs / 3_600_000).toFixed(0)}h`

  return (
    <div className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 select-none">
      {/* Display */}
      <span
        className={`font-mono text-sm tabular-nums font-bold tracking-wider ${colorClass}`}
        title={
          examStartAt
            ? `Iniciado: ${new Date(examStartAt).toISOString()} · Duración: ${durationLabel}`
            : `Duración configurada: ${durationLabel}`
        }
      >
        {formatHHMMSS(remaining)}
      </span>

      {/* Estado no iniciado */}
      {!examStartAt && (
        <>
          <button
            type="button"
            onClick={() => startExam()}
            className="text-[10px] font-black uppercase px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            title="Iniciar cronómetro"
          >
            Start
          </button>
          <button
            type="button"
            onClick={() => setShowCfg((v) => !v)}
            className="text-xs px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors"
            title="Duración del examen"
          >
            ⚙
          </button>

          {showCfg && (
            <div className="absolute top-full mt-2 right-0 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 shadow-xl flex gap-1">
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
                        ? 'bg-[#0b282c] text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600')
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

      {/* Estado iniciado */}
      {examStartAt && (
        <>
          {examRunning ? (
            <button
              type="button"
              onClick={pauseExam}
              className="text-xs px-2 py-1 rounded bg-yellow-500 hover:bg-yellow-400 text-white font-bold transition-colors"
              title="Pausar"
            >
              ⏸
            </button>
          ) : (
            <button
              type="button"
              onClick={resumeExam}
              className="text-xs px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors"
              title="Reanudar"
            >
              ▶
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (window.confirm('¿Reiniciar el cronómetro? Se perderá el log de fases.')) {
                resetExam()
              }
            }}
            className="text-xs px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 dark:hover:text-red-400 text-slate-700 dark:text-slate-200 font-bold transition-colors"
            title="Reiniciar"
          >
            ⟲
          </button>
        </>
      )}
    </div>
  )
}
