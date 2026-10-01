import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useScanStore } from '../../core/store/useScanStore'
import { useUiStore } from '../../core/store/uiStore'

import { useHostFiltering } from './hooks/useHostFiltering'
import { useDashboardMetrics } from './hooks/useDashboardMetrics'
import { useHostExpansion } from './hooks/useHostExpansion'
import { useReportGeneration } from './hooks/useReportGeneration'
import { useCveEnrichment } from './hooks/useCveEnrichment'

import { MetricsBar } from './components/MetricsBar'
import { FiltersBar } from './components/FiltersBar'
import { HostCard } from './components/HostCard'
import { EmptyState } from './components/EmptyState'
import { LoadingState } from './components/LoadingState'
import { PreviewModal } from './components/PreviewModal'

export function DashboardPanel() {
  const {
    parsedData, historyData, isScanning, target, commandString, theme,
    scanDuration, clearHistory, compactMode, toggleCompactMode,
    importWorkspace, vaultCredentials, redTeamNotes,
  } = useScanStore()

  const cveAutoEnrich = useUiStore((s) => s.cveAutoEnrich)
  const toggleCveAutoEnrich = useUiStore((s) => s.toggleCveAutoEnrich)
  const includeCvss = useUiStore((s) => s.includeCvss)
  const signature = useUiStore((s) => s.signature)

  const [showDiff, setShowDiff] = useState(false)
  const [previewModal, setPreviewModal] = useState<'md' | 'html' | 'json' | null>(null)

  // Timestamp CONGELADO al abrir el modal. Es la clave para que el hash
  // y el cuerpo del reporte no cambien en cada render del dashboard en vivo.
  const [previewExportedAt, setPreviewExportedAt] = useState<string | null>(null)

  // Hash de integridad calculado UNA vez por apertura del modal.
  const [integrityHash, setIntegrityHash] = useState<string | null>(null)

  const filters = useHostFiltering(parsedData || [])
  const metrics = useDashboardMetrics(parsedData || [])
  const expansion = useHostExpansion()

  useCveEnrichment()

  const reportGenerator = useReportGeneration(
    target,
    commandString,
    scanDuration,
    filters.filteredData,
    vaultCredentials,
    redTeamNotes,
    importWorkspace,
    false,
    expansion.setExpandedHosts,
    expansion.setExpandedPorts,
    includeCvss,
    signature,
  )

  // Ref para acceder al reportGenerator más reciente sin disparar el efecto
  // ni las dependencias de los useMemo. Esto es lo que impide que el
  // dashboard en vivo (CVE Auto) haga vibrar el reporte previsualizado.
  const reportGeneratorRef = useRef(reportGenerator)
  reportGeneratorRef.current = reportGenerator

  // ----------------------------------------------------------
  // FIX: el hash se calcula SOLO cuando se abre el modal.
  // `previewExportedAt` se fija en el momento de la apertura y
  // permanece estable durante toda la previsualización.
  // ----------------------------------------------------------
  useEffect(() => {
    if (!previewModal) {
      setPreviewExportedAt(null)
      setIntegrityHash(null)
      return
    }

    // Congelamos el timestamp al abrir el modal.
    const exportedAt = new Date().toISOString()
    setPreviewExportedAt(exportedAt)

    let cancelled = false
    reportGeneratorRef.current
      .computeIntegrityHash(exportedAt)
      .then((h) => {
        if (!cancelled) setIntegrityHash(h)
      })
      .catch((err) => {
        console.error('[DashboardPanel] Error calculando hash:', err)
        if (!cancelled) setIntegrityHash(null)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewModal]) // ← NO dependemos de reportGenerator a propósito

  // ==========================================================
  // FIX: los useMemo NO dependen de `reportGenerator`.
  // Leen del ref y solo se recalculan cuando cambia `previewModal`,
  // `previewExportedAt` o `integrityHash` (todos estables durante
  // la previsualización). Así el iframe no se recarga, el scroll
  // se mantiene y CVE Auto no hace vibrar el reporte.
  // ==========================================================

  const mdContent = useMemo(() => {
    if (previewModal !== 'md') return ''
    if (!previewExportedAt) return ''
    try {
      return reportGeneratorRef.current.generateMarkdown(
        integrityHash ?? undefined,
        previewExportedAt,
      )
    } catch (e) {
      console.error('[generateMarkdown] error:', e)
      return `# ERROR generando MD\n\n\`\`\`\n${String(e)}\n\`\`\`\n`
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewModal, previewExportedAt, integrityHash])

  const htmlContent = useMemo(() => {
    if (previewModal !== 'html') return ''
    if (!previewExportedAt) return ''
    try {
      return reportGeneratorRef.current.generateHTML(
        integrityHash ?? undefined,
        previewExportedAt,
      )
    } catch (e) {
      console.error('[generateHTML] error:', e)
      return `<pre style="color:red;padding:20px;font-family:monospace">ERROR generando HTML: ${String(e)}</pre>`
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewModal, previewExportedAt, integrityHash])

  const jsonContent = useMemo(() => {
    if (previewModal !== 'json') return ''
    if (!previewExportedAt) return ''
    const payload = reportGeneratorRef.current.buildJsonPayload(previewExportedAt)
    const payloadWithHash = integrityHash
      ? { ...payload, hash: integrityHash }
      : payload
    return JSON.stringify(payloadWithHash, null, 2)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewModal, previewExportedAt, integrityHash])

  const handleOpenPrint = useCallback(() => {
    expansion.expandAllWithScripts(filters.filteredData)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void reportGenerator.handlePrint()
      })
    })
  }, [expansion, filters.filteredData, reportGenerator])

  if (isScanning && (!parsedData || parsedData.length === 0)) return <LoadingState />
  if (!parsedData || parsedData.length === 0) {
    return <EmptyState handleImport={reportGenerator.handleImport} />
  }

  const paginatedData = filters.filteredData.slice(0, filters.visibleCount)
  const pyClass = compactMode ? 'py-1' : 'py-2'

  const nowUtcIso = new Date().toISOString()

  return (
    <section className="flex flex-col h-full min-h-0 space-y-4 relative print:space-y-0 print:block">
      <style>{`
        @media print {
          body, html, #root, main, section, div { height: auto !important; min-height: auto !important; overflow: visible !important; }
          .custom-scrollbar { overflow: visible !important; }
          .print-force-colors { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-page-break { page-break-inside: avoid; margin-bottom: 25px; }
          pre { white-space: pre-wrap !important; word-break: break-word !important; }
        }
      `}</style>

      <div className="flex gap-3 shrink-0 w-full print:hidden">
        <div className="flex-1">
          <MetricsBar theme={theme} totalHosts={parsedData.length} {...metrics} />
        </div>

        <div className="flex flex-col gap-1 justify-center p-2 rounded-lg border border-slate-200 dark:border-slate-700 overflow-y-auto custom-scrollbar w-44">
          <button
            onClick={() => setPreviewModal('json')}
            className="w-full text-[9px] font-bold uppercase bg-slate-800 dark:bg-slate-700 text-white py-1.5 rounded hover:bg-slate-700 shadow-sm transition-colors"
          >
            Exportar JSON
          </button>

          <div className="flex gap-1 w-full">
            <button
              onClick={() => setPreviewModal('md')}
              className="flex-1 text-[9px] font-bold uppercase bg-teal-600 text-white py-1.5 rounded hover:bg-teal-500 shadow-sm transition-colors"
            >
              .MD
            </button>
            <button
              onClick={() => setPreviewModal('html')}
              className="flex-1 text-[9px] font-bold uppercase bg-[#0b282c] text-white py-1.5 rounded hover:bg-[#081e21] shadow-sm transition-colors"
            >
              .HTML
            </button>
          </div>

          <button
            onClick={handleOpenPrint}
            className="w-full text-[9px] font-bold uppercase border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 shadow-sm transition-colors"
          >
            Imprimir PDF
          </button>

          <button
            onClick={toggleCveAutoEnrich}
            title="Enriquecer puertos con CVEs reales de NVD"
            className={
              'w-full text-[9px] font-bold uppercase py-1.5 rounded shadow-sm transition-colors border ' +
              (cveAutoEnrich
                ? 'bg-amber-500 border-amber-600 text-white hover:bg-amber-400'
                : 'bg-transparent border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800')
            }
          >
            {cveAutoEnrich ? '✓ CVE Auto (NVD)' : '✗ CVE Auto'}
          </button>

          <button
            onClick={clearHistory}
            className="w-full text-[9px] font-bold uppercase border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 py-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 shadow-sm transition-colors mt-1"
          >
            Borrar Datos
          </button>
        </div>
      </div>

      {!cveAutoEnrich && (
        <div className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded px-2 py-1 print:hidden">
          ⚠ CVE Auto está apagado. Los contadores de severidad y el reporte no incluirán CVEs.
        </div>
      )}

      <FiltersBar
        {...filters}
        compactMode={compactMode}
        toggleCompactMode={toggleCompactMode}
        showDiff={showDiff}
        setShowDiff={setShowDiff}
        historyData={historyData}
      />

      <div className="flex-1 overflow-visible space-y-4 pb-8 print:block print:space-y-6">
        <div className="hidden print:block mb-8 border-b-2 border-[#0b282c] pb-4 print-force-colors">
          <h1 className="text-3xl font-black text-[#0b282c] uppercase tracking-widest font-['Poppins']">
            LESSSO C2 Report
          </h1>
          <p className="text-sm font-bold text-slate-500 mt-2">
            Objetivo: {target} | Fecha (UTC): {nowUtcIso}
          </p>
        </div>

        {paginatedData.map((host, idx) => (
          <HostCard
            key={`${host.ip}-${idx}`}
            host={host}
            historyData={historyData}
            showDiff={showDiff}
            compactMode={compactMode}
            pyClass={pyClass}
            {...expansion}
          />
        ))}

        {filters.visibleCount < filters.filteredData.length && (
          <div className="flex justify-center mt-3 print:hidden">
            <button
              onClick={() => filters.setVisibleCount((v) => v + 50)}
              className="px-4 py-1.5 bg-[#0b282c]/10 text-[#0b282c] dark:bg-[#0b282c]/50 dark:text-teal-400 text-[10px] font-bold uppercase rounded shadow-sm hover:bg-[#0b282c]/20 transition-colors"
            >
              Cargar más hosts ({filters.filteredData.length - filters.visibleCount} ocultos)
            </button>
          </div>
        )}
      </div>

      {previewModal && (
        <PreviewModal
          type={previewModal}
          onClose={() => setPreviewModal(null)}
          onSave={reportGenerator.handleSaveFile}
          filteredData={filters.filteredData}
          mdContent={mdContent}
          htmlContent={htmlContent}
          integrityHash={integrityHash}
          jsonContent={jsonContent}
        />
      )}
    </section>
  )
}
