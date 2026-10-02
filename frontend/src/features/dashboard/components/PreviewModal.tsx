import { useEffect, useState } from "react";
import { hashAlgorithmLabel } from "../utils/hash";
import { Loader2 } from "lucide-react";

interface PreviewModalProps {
  type: 'md' | 'html' | 'json';
  onClose: () => void;
  onSave: (type: 'md' | 'html' | 'json') => Promise<boolean>;
  mdContent: string;
  htmlContent: string;
  integrityHash: string | null;
  jsonContent: string;
}

export function PreviewModal({
  type,
  onClose,
  onSave,
  mdContent,
  htmlContent,
  integrityHash,
  jsonContent,
}: PreviewModalProps) {
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, isSaving]);

  const handleExport = async () => {
    setIsSaving(true);
    try {
      const success = await onSave(type);
      if (success) onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !isSaving) onClose(); }}
    >
      <div className="bg-white dark:bg-[#0b1120] w-full max-w-6xl h-[90vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* HEADER LIMPIO */}
        <div className="flex justify-between items-center px-6 py-4 bg-slate-50 dark:bg-[#060a13] border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white flex items-center gap-2">
              Vista Previa: {type.toUpperCase()}
            </h3>
            {integrityHash && (
              <span title={`${hashAlgorithmLabel(integrityHash)}: ${integrityHash}`} className="text-[10px] font-mono px-2.5 py-1 rounded bg-teal-500/10 text-teal-700 dark:text-teal-400 border border-teal-500/20">
                🔒 {integrityHash.slice(0, 16)}…
              </span>
            )}
          </div>
          <button onClick={onClose} disabled={isSaving} className="text-slate-400 hover:text-rose-500 disabled:opacity-50 font-bold text-sm transition-colors">
            ✕ Cerrar
          </button>
        </div>

        {/* ÁREA DE PREVISUALIZACIÓN GIGANTE */}
        <div className="flex-1 min-h-0 overflow-hidden bg-slate-100 dark:bg-[#020617] p-4 sm:p-6 relative">
          {isSaving && (
            <div className="absolute inset-0 z-10 bg-white/60 dark:bg-[#020617]/60 backdrop-blur-sm flex flex-col items-center justify-center">
              <Loader2 size={36} className="text-teal-500 animate-spin mb-3" />
              <p className="text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-300">Generando Entregable...</p>
            </div>
          )}

          {type === 'json' && (
            <div className="w-full h-full overflow-auto bg-white dark:bg-[#0b1120] rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-inner custom-scrollbar">
              <pre className="text-[12px] font-mono text-slate-800 dark:text-teal-400/90 whitespace-pre-wrap break-words">{jsonContent}</pre>
            </div>
          )}

          {type === 'md' && (
            <div className="w-full h-full overflow-auto bg-white dark:bg-[#0b1120] rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-inner custom-scrollbar">
              <pre className="text-[12px] font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">{mdContent}</pre>
            </div>
          )}

          {type === 'html' && (
            <div className="w-full h-full rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-inner bg-white">
              <iframe title="Preview HTML" sandbox="allow-scripts allow-same-origin" srcDoc={htmlContent} scrolling="yes" className="w-full h-full border-0 block" />
            </div>
          )}
        </div>

        {/* FOOTER ACCIONES */}
        <div className="p-4 sm:px-6 sm:py-5 bg-slate-50 dark:bg-[#060a13] border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} disabled={isSaving} className="px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors disabled:opacity-50">
            Volver al Studio
          </button>
          <button onClick={handleExport} disabled={isSaving} className="flex items-center justify-center gap-2 px-8 py-2.5 bg-teal-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider shadow-md hover:bg-teal-500 transition-colors disabled:opacity-70 min-w-[160px]">
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : 'Confirmar y Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
