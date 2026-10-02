import { useState, useMemo, useEffect, useRef } from 'react';
import { useScanStore } from '../../core/store/useScanStore';
import { useUiStore } from '../../core/store/uiStore';
import { useReportGeneration } from '../dashboard/hooks/useReportGeneration';
import { PreviewModal } from '../dashboard/components/PreviewModal';
import { FileOutput, ShieldCheck, Lock, Edit3, Globe, Server, FileText, Code, Printer, Eye } from 'lucide-react';
import { cn } from '../../lib/utils';

export function ReportStudio() {
  // Extraemos datos globales
  const { parsedData, target, commandString, scanDuration, vaultCredentials, redTeamNotes, importWorkspace } = useScanStore();
  const { signature, setSignature, clearSignature, includeCvss, setIncludeCvss } = useUiStore();

  // Estados modulares locales (Checkboxes tipo Box)
  const [includeVault, setIncludeVault] = useState(false);
  const [includeNotes, setIncludeNotes] = useState(true);

  // Estados del generador
  const [previewModal, setPreviewModal] = useState<'md' | 'html' | 'json' | null>(null);
  const [previewExportedAt, setPreviewExportedAt] = useState<string | null>(null);
  const [integrityHash, setIntegrityHash] = useState<string | null>(null);

  // Notas activas condicionales
  const activeNotes = includeNotes ? redTeamNotes : '';

  // Instanciamos el motor generador
  const reportGenerator = useReportGeneration(
    target, commandString, scanDuration, parsedData || [], vaultCredentials,
    activeNotes, importWorkspace, includeVault, () => {}, () => {}, includeCvss, signature
  );

  const reportGeneratorRef = useRef(reportGenerator);
  reportGeneratorRef.current = reportGenerator;

  // Manejo del hash en previsualización
  useEffect(() => {
    if (!previewModal) {
      setPreviewExportedAt(null);
      setIntegrityHash(null);
      return;
    }
    const exportedAt = new Date().toISOString();
    setPreviewExportedAt(exportedAt);

    let cancelled = false;
    reportGeneratorRef.current.computeIntegrityHash(exportedAt)
      .then((h) => { if (!cancelled) setIntegrityHash(h); })
      .catch(() => { if (!cancelled) setIntegrityHash(null); });
    return () => { cancelled = true; };
  }, [previewModal]);

  // Contenidos precomputados
  const mdContent = useMemo(() => {
    if (previewModal !== 'md' || !previewExportedAt) return '';
    try { return reportGeneratorRef.current.generateMarkdown(integrityHash ?? undefined, previewExportedAt); } 
    catch (e) { return `# ERROR\n\n\`\`\`\n${String(e)}\n\`\`\`\n`; }
  }, [previewModal, previewExportedAt, integrityHash]);

  const htmlContent = useMemo(() => {
    if (previewModal !== 'html' || !previewExportedAt) return '';
    try { return reportGeneratorRef.current.generateHTML(integrityHash ?? undefined, previewExportedAt); } 
    catch (e) { return `<pre>ERROR: ${String(e)}</pre>`; }
  }, [previewModal, previewExportedAt, integrityHash]);

  const jsonContent = useMemo(() => {
    if (previewModal !== 'json' || !previewExportedAt) return '';
    const payload = reportGeneratorRef.current.buildJsonPayload(previewExportedAt);
    return JSON.stringify(integrityHash ? { ...payload, hash: integrityHash } : payload, null, 2);
  }, [previewModal, previewExportedAt, integrityHash]);


  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 sm:p-8 flex justify-center custom-scrollbar">
      <div className="w-full max-w-5xl flex flex-col gap-6">
        
        {/* Header del Studio */}
        <div className="bg-white dark:bg-[#0b1120] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 sm:p-8 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black uppercase tracking-widest text-slate-800 dark:text-white flex items-center gap-3">
              <FileOutput className="text-teal-500" size={24} /> Report Studio
            </h1>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 tracking-wider mt-2">
              Configura, firma y exporta tus entregables de ciberseguridad.
            </p>
          </div>
          <div className="text-right hidden sm:block">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Activos listos</span>
            <div className="text-2xl font-black text-slate-800 dark:text-white">{parsedData?.length || 0}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* COLUMNA IZQUIERDA: Módulos (Boxes) */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-slate-300 px-2">1. Módulos a Incluir</h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ModuleBox 
                icon={<Globe />} title="Métricas y Dashboard" 
                desc="Resumen ejecutivo, topologías y hosts detectados." 
                checked={true} disabled={true} 
              />
              <ModuleBox 
                icon={<Server />} title="Inventario de Puertos" 
                desc="Desglose técnico de servicios y versiones por activo." 
                checked={true} disabled={true} 
              />
              <ModuleBox 
                icon={<ShieldCheck />} title="Puntajes CVSS" 
                desc="Muestra la severidad numérica oficial de NVD." 
                checked={includeCvss} onChange={() => setIncludeCvss(!includeCvss)} 
              />
              <ModuleBox 
                icon={<Lock />} title="Bóveda (Sensible)" 
                desc="Exporta hashes y contraseñas en texto plano." 
                checked={includeVault} onChange={() => setIncludeVault(!includeVault)} 
              />
              <ModuleBox 
                icon={<Edit3 />} title="Bitácora de Auditoría" 
                desc="Adjunta tus notas tácticas al final del reporte." 
                checked={includeNotes} onChange={() => setIncludeNotes(!includeNotes)} 
              />
            </div>

            {/* Firmware / Firma */}
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-slate-300 px-2 mt-4">2. Firma del Auditor</h2>
            <div className="bg-white dark:bg-[#0b1120] rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input type="text" placeholder="Nombre del auditor *" value={signature.name} onChange={(e) => setSignature({ name: e.target.value })} className="text-xs px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#020617] text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500 transition-all shadow-sm" />
                <input type="text" placeholder="Cargo (Ej: Pentester)" value={signature.role} onChange={(e) => setSignature({ role: e.target.value })} className="text-xs px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#020617] text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500 transition-all shadow-sm" />
                <input type="text" placeholder="Empresa / Organización" value={signature.company} onChange={(e) => setSignature({ company: e.target.value })} className="text-xs px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#020617] text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500 transition-all shadow-sm" />
                <div className="flex gap-2">
                  <input type="text" placeholder="Fecha UTC (auto)" value={signature.date} onChange={(e) => setSignature({ date: e.target.value })} className="flex-1 text-[11px] font-mono px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#020617] text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500 transition-all shadow-sm" />
                  <button type="button" onClick={() => setSignature({ date: new Date().toISOString() })} title="Fecha actual" className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors shadow-sm">⟳</button>
                  <button type="button" onClick={clearSignature} title="Limpiar firma" className="px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors shadow-sm">✕</button>
                </div>
              </div>
            </div>
          </div>

          {/* COLUMNA DERECHA: Exportación */}
          <div className="flex flex-col gap-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-slate-300 px-2">3. Exportación</h2>
            
            <div className="bg-white dark:bg-[#0b1120] rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 flex flex-col gap-3 h-full">
              
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold tracking-wider uppercase mb-2 border-b border-slate-100 dark:border-slate-800 pb-2">Previsualización en vivo</p>
              <button onClick={() => setPreviewModal('html')} className="w-full flex items-center justify-between p-3 rounded-lg bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/30 hover:bg-teal-100 dark:hover:bg-teal-500/20 text-teal-700 dark:text-teal-400 transition-all">
                <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2"><Eye size={16}/> Ver Reporte (HTML)</span>
              </button>

              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold tracking-wider uppercase mt-4 mb-2 border-b border-slate-100 dark:border-slate-800 pb-2">Generar Documentos</p>
              
              <button onClick={() => reportGenerator.handlePrint()} className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300 transition-all group">
                <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2"><Printer size={16} className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300"/> Imprimir PDF</span>
              </button>

              <button onClick={() => reportGenerator.handleSaveFile('md')} className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300 transition-all group">
                <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2"><FileText size={16} className="text-sky-500"/> Markdown (.md)</span>
              </button>

              <button onClick={() => reportGenerator.handleSaveFile('json')} className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300 transition-all group">
                <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2"><Code size={16} className="text-amber-500"/> Raw Data (.json)</span>
              </button>

            </div>
          </div>

        </div>
      </div>

      {/* AQUÍ TAMBIÉN SE QUITÓ FILTERED DATA */}
      {previewModal && (
        <PreviewModal
          type={previewModal} onClose={() => setPreviewModal(null)} onSave={reportGenerator.handleSaveFile}
          mdContent={mdContent} htmlContent={htmlContent}
          integrityHash={integrityHash} jsonContent={jsonContent}
        />
      )}
    </div>
  );
}

// Subcomponente interno para las "Cajas modulares"
function ModuleBox({ icon, title, desc, checked, disabled = false, onChange }: any) {
  return (
    <label className={cn(
      "flex flex-col gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all relative overflow-hidden",
      checked 
        ? "bg-teal-50 dark:bg-teal-500/10 border-teal-500 dark:border-teal-500/50 shadow-sm" 
        : "bg-white dark:bg-[#020617] border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700",
      disabled && "opacity-60 cursor-not-allowed"
    )}>
      <div className="flex items-center justify-between">
        <div className={cn("p-2 rounded-lg", checked ? "bg-teal-500 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500")}>
          {icon}
        </div>
        <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} className="w-4 h-4 accent-teal-600 rounded" />
      </div>
      <div className="mt-1">
        <h4 className={cn("text-xs font-black uppercase tracking-widest", checked ? "text-teal-900 dark:text-teal-400" : "text-slate-700 dark:text-slate-300")}>{title}</h4>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">{desc}</p>
      </div>
    </label>
  );
}
