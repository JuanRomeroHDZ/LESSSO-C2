import { useCallback, useState } from 'react'
import { useScanStore } from '../../core/store/useScanStore'
import { useUiStore } from '../../core/store/uiStore'

// Hooks
import { useHostFiltering } from './hooks/useHostFiltering'
import { useDashboardMetrics } from './hooks/useDashboardMetrics'
import { useHostExpansion } from './hooks/useHostExpansion'
import { useReportGeneration } from './hooks/useReportGeneration'
import { useCveEnrichment } from './hooks/useCveEnrichment'

// Components
import { MetricsBar } from './components/MetricsBar'
import { FiltersBar } from './components/FiltersBar'
import { HostCard } from './components/HostCard'
import { EmptyState } from './components/EmptyState'
import { LoadingState } from './components/LoadingState'
import { PreviewModal } from './components/PreviewModal'

export function DashboardPanel() {
  // Global Store
  const {
    parsedData, historyData, isScanning, target, commandString, theme,
    scanDuration, clearHistory, compactMode, toggleCompactMode,
    importWorkspace, vaultCredentials, redTeamNotes,
  } = useScanStore()

  const cveAutoEnrich = useUiStore((s) => s.cveAutoEnrich)
  const toggleCveAutoEnrich = useUiStore((s) => s.toggleCveAutoEnrich)

  const [showDiff, setShowDiff] = useState(false)
  const [previewModal, setPreviewModal] = useState<'md' | 'html' | 'json' | null>(null)

  // Sub-lógicas encapsuladas
  const filters = useHostFiltering(parsedData || [])
  const metrics = useDashboardMetrics(parsedData || [])
  const expansion = useHostExpansion()

  // Enriquecimiento CVE con NVD (best-effort, opt-in)
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
  )

  // Imprimir: expandimos todo y esperamos 2 frames para que React
  // haya pintado antes de abrir el diálogo de impresión.
  const handleOpenPrint = useCallback(() => {
    expansion.expandAllWithScripts(filters.filteredData)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        reportGenerator.handlePrint()
      })
    })
  }, [expansion, filters.filteredData, reportGenerator])

  // Estados de carga / vacío
  if (isScanning && (!parsedData || parsedData.length === 0)) return <LoadingState />
  if (!parsedData || parsedData.length === 0) {
    return <EmptyState handleImport={reportGenerator.handleImport} />
  }

  const paginatedData = filters.filteredData.slice(0, filters.visibleCount)
  const pyClass = compactMode ? 'py-1' : 'py-2'

  // Contador de puertos con CPE (útil para saber si el parser los extrajo)
  const portsWithCpe = parsedData.reduce(
    (acc, h) => acc + (h.ports?.filter((p) => p.cpe?.length).length ?? 0),
    0,
  )
  const portsWithCves = parsedData.reduce(
    (acc, h) => acc + (h.ports?.filter((p) => p.cves?.length).length ?? 0),
    0,
  )

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
            title="Buscar CVEs reales en NVD al recibir un scan"
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

      {/* Debug mínimo: solo cuando hay CPE/CVE, para verificar el pipeline */}
      {(portsWithCpe > 0 || portsWithCves > 0) && (
        <div className="text-[9px] font-mono text-slate-500 print:hidden">
          Puertos con CPE: <b>{portsWithCpe}</b> · Puertos con CVEs:{' '}
          <b>{portsWithCves}</b>
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

      {/* LISTA DE HOSTS */}
      <div className="flex-1 overflow-visible space-y-4 pb-8 print:block print:space-y-6">
        <div className="hidden print:block mb-8 border-b-2 border-[#0b282c] pb-4 print-force-colors">
          <h1 className="text-3xl font-black text-[#0b282c] uppercase tracking-widest font-['Poppins']">
            LESSSO C2 Report
          </h1>
          <p className="text-sm font-bold text-slate-500 mt-2">
            Objetivo: {target} | Fecha: {new Date().toLocaleString()}
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
          mdContent={reportGenerator.generateMarkdown()}
          htmlContent={reportGenerator.generateHTML()}
        />
      )}
    </section>
  )
}
