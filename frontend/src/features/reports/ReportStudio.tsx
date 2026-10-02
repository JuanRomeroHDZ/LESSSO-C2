import { useState, useMemo, useEffect, useRef } from 'react';
import { useScanStore } from '../../core/store/useScanStore';
import { useUiStore } from '../../core/store/uiStore';
import { useReportGeneration } from '../dashboard/hooks/useReportGeneration';
import { PreviewModal } from '../dashboard/components/PreviewModal';
import { FileOutput, ShieldCheck, Lock, Edit3, Globe, Server, FileText, Printer, Eye, User, UserCheck } from 'lucide-react';
import { cn } from '../../lib/utils';

export function ReportStudio() {
  const { parsedData, target, commandString, scanDuration, vaultCredentials, redTeamNotes, importWorkspace } = useScanStore();
  const { signatures, setSignature, clearSignature, includeCvss, setIncludeCvss, includeMetrics, toggleIncludeMetrics, includeInventory, toggleIncludeInventory } = useUiStore();

  const [includeVault, setIncludeVault] = useState(false);
  const [includeNotes, setIncludeNotes] = useState(true);

  const [sigTab, setSigTab] = useState<'auditor' | 'reviewer'>('auditor');

  const [previewModal, setPreviewModal] = useState<'md' | 'html' | 'json' | null>(null);
  const [previewExportedAt, setPreviewExportedAt] = useState<string | null>(null);
  const [integrityHash, setIntegrityHash] = useState<string | null>(null);

  const activeNotes = includeNotes ? redTeamNotes : '';

  // Inyectamos los nuevos interruptores al generador
  const reportGenerator = useReportGeneration(
    target, commandString, scanDuration, parsedData || [], vaultCredentials,
    activeNotes, importWorkspace, includeVault, () => {}, () => {}, includeCvss, signatures,
    includeMetrics, includeInventory
  );

  const reportGeneratorRef = useRef(reportGenerator);
  reportGeneratorRef.current = reportGenerator;

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


  const currentSig = signatures[sigTab];
  const handleSigChange = (field: string, val: string) => setSignature(sigTab, { [field]: val });

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 flex justify-center custom-scrollbar">
      <div className="w-full max-w-5xl flex flex-col gap-6 pb-10">
        
        <div className="bg-white dark:bg-[#0b1120] rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-teal-500/10 p-2 rounded-lg text-teal-600 dark:text-teal-400 border border-teal-500/20">
              <FileOutput size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Report Studio</h1>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-wider">Configuración y Generación de Entregables</p>
            </div>
          </div>
          <div className="text-right hidden sm:block">
            <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Activos en cola</span>
            <div className="text-xl font-black text-slate-800 dark:text-white leading-none">{parsedData?.length || 0}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          <div className="flex flex-col gap-3">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200 dark:border-slate-800 pb-1.5 px-1">1. Bloques de Inteligencia</h2>
            
            <div className="flex flex-col gap-2">
              <CompactModuleRow icon={<Globe size={14}/>} title="Métricas y Resumen Ejecutivo" checked={includeMetrics} onChange={toggleIncludeMetrics} />
              <CompactModuleRow icon={<Server size={14}/>} title="Inventario Global de Puertos" checked={includeInventory} onChange={toggleIncludeInventory} />
              <CompactModuleRow icon={<ShieldCheck size={14}/>} title="Puntajes CVSS Oficiales (NVD)" checked={includeCvss} onChange={() => setIncludeCvss(!includeCvss)} />
              <CompactModuleRow icon={<Lock size={14}/>} title="Anexo A: Bóveda de Credenciales" checked={includeVault} onChange={() => setIncludeVault(!includeVault)} highlight={includeVault} />
              <CompactModuleRow icon={<Edit3 size={14}/>} title="Anexo B: Bitácora Táctica de Red Team" checked={includeNotes} onChange={() => setIncludeNotes(!includeNotes)} highlight={includeNotes} />
            </div>
          </div>

          <div className="flex flex-col gap-6">
            
            <div className="flex flex-col gap-3">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200 dark:border-slate-800 pb-1.5 px-1">2. Sistema de Firma y Validación</h2>
              
              <div className="bg-white dark:bg-[#0b1120] rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
                <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                  <button onClick={() => setSigTab('auditor')} className={cn("flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors border-b-2 flex items-center justify-center gap-1.5", sigTab === 'auditor' ? "border-teal-500 text-teal-600 dark:text-teal-400 bg-white dark:bg-[#0b1120]" : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300")}>
                    <User size={12} /> Auditor Principal
                  </button>
                  <button onClick={() => setSigTab('reviewer')} className={cn("flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors border-b-2 flex items-center justify-center gap-1.5", sigTab === 'reviewer' ? "border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-[#0b1120]" : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300")}>
                    <UserCheck size={12} /> Verificador QA (Opc.)
                  </button>
                </div>
                
                <div className="p-4 grid grid-cols-2 gap-3">
                  <input type="text" placeholder={`Nombre del ${sigTab === 'auditor' ? 'Auditor' : 'Validador'}`} value={currentSig.name} onChange={(e) => handleSigChange('name', e.target.value)} className="col-span-2 sm:col-span-1 text-xs px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500 transition-all shadow-sm" />
                  <input type="text" placeholder="Cargo (Ej: Security Engineer)" value={currentSig.role} onChange={(e) => handleSigChange('role', e.target.value)} className="col-span-2 sm:col-span-1 text-xs px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500 transition-all shadow-sm" />
                  <input type="text" placeholder="Empresa / Organización" value={currentSig.company} onChange={(e) => handleSigChange('company', e.target.value)} className="col-span-2 sm:col-span-1 text-xs px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500 transition-all shadow-sm" />
                  <div className="col-span-2 sm:col-span-1 flex gap-1">
                    <input type="text" placeholder="Fecha (UTC)" value={currentSig.date} onChange={(e) => handleSigChange('date', e.target.value)} className="flex-1 text-[10px] font-mono px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500 transition-all shadow-sm" />
                    <button type="button" onClick={() => handleSigChange('date', new Date().toISOString())} className="px-2 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors shadow-sm" title="Insertar Ahora">⟳</button>
                    {currentSig.name && (
                      <button type="button" onClick={() => clearSignature(sigTab)} className="px-2 py-1.5 rounded-md border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors shadow-sm" title="Limpiar firma">✕</button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 mt-2 lg:mt-0">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200 dark:border-slate-800 pb-1.5 px-1">3. Compilación</h2>
              <div className="grid grid-cols-2 gap-3">
                
                <button onClick={() => setPreviewModal('html')} className="col-span-2 flex items-center justify-center p-3 rounded-xl bg-teal-600 hover:bg-teal-500 border-b-4 border-teal-700 active:border-b-0 active:mt-1 text-white transition-all">
                  <span className="text-xs font-black uppercase tracking-widest flex items-center gap-2"><Eye size={16}/> Previsualizar Reporte</span>
                </button>

                <button onClick={() => reportGenerator.handlePrint()} className="flex flex-col items-center justify-center p-3 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800/50 bg-white dark:bg-[#0b1120] text-slate-700 dark:text-slate-300 transition-all gap-1.5">
                  <Printer size={18} className="text-slate-400"/>
                  <span className="text-[10px] font-bold uppercase tracking-wider">PDF</span>
                </button>

                <button onClick={() => reportGenerator.handleSaveFile('md')} className="flex flex-col items-center justify-center p-3 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800/50 bg-white dark:bg-[#0b1120] text-slate-700 dark:text-slate-300 transition-all gap-1.5">
                  <FileText size={18} className="text-sky-500"/>
                  <span className="text-[10px] font-bold uppercase tracking-wider">Markdown</span>
                </button>

              </div>
            </div>

          </div>
        </div>
      </div>

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

function CompactModuleRow({ icon, title, checked, disabled = false, highlight = false, onChange }: any) {
  return (
    <label className={cn(
      "flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer",
      disabled ? "bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800 opacity-60" :
      checked 
        ? highlight ? "bg-amber-50 dark:bg-amber-500/10 border-amber-500/50" : "bg-teal-50 dark:bg-teal-500/10 border-teal-500/50"
        : "bg-white dark:bg-[#0b1120] border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
    )}>
      <div className="flex items-center gap-3">
        <div className={cn("p-1.5 rounded-md", checked ? (highlight ? "bg-amber-500 text-white" : "bg-teal-500 text-white") : "bg-slate-100 dark:bg-slate-800 text-slate-500")}>
          {icon}
        </div>
        <span className={cn("text-[11px] font-bold uppercase tracking-wider", checked ? (highlight ? "text-amber-700 dark:text-amber-400" : "text-teal-700 dark:text-teal-400") : "text-slate-600 dark:text-slate-400")}>
          {title}
        </span>
      </div>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} className={cn("w-4 h-4 rounded cursor-pointer", highlight ? "accent-amber-600" : "accent-teal-600")} />
    </label>
  );
}
