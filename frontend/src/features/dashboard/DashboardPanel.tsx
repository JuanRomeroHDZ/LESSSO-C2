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
import { HostListSidebar } from './components/HostListSidebar'
import { HostDetailView } from './components/HostDetailView'
import { EmptyState } from './components/EmptyState'
import { LoadingState } from './components/LoadingState'
import { PreviewModal } from './components/PreviewModal'
import { Code2 } from 'lucide-react'

export function DashboardPanel() {
  const {
    parsedData, historyData, isScanning, target, commandString, theme,
    scanDuration, clearHistory, compactMode, toggleCompactMode,
    importWorkspace, vaultCredentials, redTeamNotes,
  } = useScanStore()

  const cveAutoEnrich = useUiStore((s) => s.cveAutoEnrich)
  const toggleCveAutoEnrich = useUiStore((s) => s.toggleCveAutoEnrich)
  const includeCvss = useUiStore((s) => s.includeCvss)
  
  // SOLUCIÓN AL ERROR EN LÍNEA 30
  const signatures = useUiStore((s) => s.signatures)

  const [showDiff, setShowDiff] = useState(false)
  const [previewModal, setPreviewModal] = useState<'md' | 'html' | 'json' | null>(null)
  const [previewExportedAt, setPreviewExportedAt] = useState<string | null>(null)
  const [integrityHash, setIntegrityHash] = useState<string | null>(null)
  
  const [selectedHostIp, setSelectedHostIp] = useState<string | null>(null)
  const [showMetrics, setShowMetrics] = useState(false)

  const filters = useHostFiltering(parsedData || [])
  const metrics = useDashboardMetrics(parsedData || [])
  const expansion = useHostExpansion()

  useCveEnrichment()

  const reportGenerator = useReportGeneration(
    target, commandString, scanDuration, filters.filteredData, vaultCredentials,
    redTeamNotes, importWorkspace, false, expansion.setExpandedHosts,
    expansion.setExpandedPorts, includeCvss, signatures
  )

  const reportGeneratorRef = useRef(reportGenerator)
  reportGeneratorRef.current = reportGenerator

  useEffect(() => {
    if (!previewModal) {
      setPreviewExportedAt(null)
      setIntegrityHash(null)
      return
    }
    const exportedAt = new Date().toISOString()
    setPreviewExportedAt(exportedAt)

    let cancelled = false
    reportGeneratorRef.current.computeIntegrityHash(exportedAt)
      .then((h) => { if (!cancelled) setIntegrityHash(h) })
      .catch(() => { if (!cancelled) setIntegrityHash(null) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewModal])

  useEffect(() => {
    if (filters.filteredData.length > 0 && !selectedHostIp) {
      setSelectedHostIp(filters.filteredData[0].ip);
    }
  }, [filters.filteredData, selectedHostIp]);

  const mdContent = useMemo(() => {
    if (previewModal !== 'md' || !previewExportedAt) return ''
    try { return reportGeneratorRef.current.generateMarkdown(integrityHash ?? undefined, previewExportedAt) } 
    catch (e) { return `# ERROR\n\n\`\`\`\n${String(e)}\n\`\`\`\n` }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewModal, previewExportedAt, integrityHash])

  const htmlContent = useMemo(() => {
    if (previewModal !== 'html' || !previewExportedAt) return ''
    try { return reportGeneratorRef.current.generateHTML(integrityHash ?? undefined, previewExportedAt) } 
    catch (e) { return `<pre>ERROR: ${String(e)}</pre>` }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewModal, previewExportedAt, integrityHash])

  const jsonContent = useMemo(() => {
    if (previewModal !== 'json' || !previewExportedAt) return ''
    const payload = reportGeneratorRef.current.buildJsonPayload(previewExportedAt)
    return JSON.stringify(integrityHash ? { ...payload, hash: integrityHash } : payload, null, 2)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewModal, previewExportedAt, integrityHash])

  const handleOpenPrint = useCallback(() => {
    expansion.expandAllWithScripts(filters.filteredData)
    requestAnimationFrame(() => requestAnimationFrame(() => void reportGenerator.handlePrint()))
  }, [expansion, filters.filteredData, reportGenerator])

  if (isScanning && (!parsedData || parsedData.length === 0)) return <LoadingState />
  if (!parsedData || parsedData.length === 0) return (
    <div className="flex h-full min-h-0 bg-slate-50 dark:bg-slate-950">
      <div className="flex-1 p-4"><EmptyState handleImport={reportGenerator.handleImport} /></div>
    </div>
  );

  const pyClass = compactMode ? 'py-1' : 'py-2'
  const selectedHost = filters.filteredData.find(h => h.ip === selectedHostIp) || filters.filteredData[0]

  return (
    <section className="flex flex-col h-full min-h-0 relative print:block bg-slate-50 dark:bg-slate-950">
      <style>{`
        @media print {
          body, html, #root, main, section, div { height: auto !important; min-height: auto !important; overflow: visible !important; }
          .custom-scrollbar { overflow: visible !important; }
          .print-force-colors { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-page-break { page-break-inside: avoid; margin-bottom: 25px; }
          pre { white-space: pre-wrap !important; word-break: break-word !important; }
        }
      `}</style>

      <FiltersBar 
        {...filters} 
        compactMode={compactMode} toggleCompactMode={toggleCompactMode} 
        showDiff={showDiff} setShowDiff={setShowDiff} historyData={historyData}
        showMetrics={showMetrics} setShowMetrics={setShowMetrics}
        onExport={setPreviewModal} onPrint={handleOpenPrint} onClear={clearHistory}
        cveAutoEnrich={cveAutoEnrich} toggleCveAutoEnrich={toggleCveAutoEnrich}
      />

      {showMetrics && (
        <div className="shrink-0 p-3 bg-white dark:bg-[#020617] border-b border-slate-200 dark:border-slate-800/80 shadow-sm transition-all animate-in slide-in-from-top-2 print:hidden z-10">
          <MetricsBar theme={theme} totalHosts={parsedData.length} {...metrics} />
        </div>
      )}

      <div className="flex-1 flex min-h-0 overflow-hidden">
        
        <div className="w-[280px] lg:w-[320px] shrink-0 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 h-full p-3 print:hidden">
          <HostListSidebar 
            hosts={filters.filteredData} 
            selectedIp={selectedHostIp} 
            onSelectHost={setSelectedHostIp} 
          />
        </div>

        <div className="flex-1 min-w-0 h-full p-3 bg-slate-100 dark:bg-[#09090b]">
          {selectedHost ? (
            <HostDetailView
              host={selectedHost} historyData={historyData} showDiff={showDiff}
              compactMode={compactMode} expandedPorts={expansion.expandedPorts}
              expandedHosts={expansion.expandedHosts} togglePortExpand={expansion.togglePortExpand}
              toggleHostExpand={expansion.toggleHostExpand} pyClass={pyClass}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center bg-white dark:bg-[#020617] rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm text-slate-500">
              <Code2 size={48} className="mb-4 opacity-50" />
              <p className="text-[10px] font-bold uppercase tracking-widest">Selecciona un objetivo</p>
            </div>
          )}
        </div>
      </div>

      {previewModal && (
        <PreviewModal
          type={previewModal} onClose={() => setPreviewModal(null)} onSave={reportGenerator.handleSaveFile}
          mdContent={mdContent} htmlContent={htmlContent}
          integrityHash={integrityHash} jsonContent={jsonContent}
        />
      )}
    </section>
  )
}
