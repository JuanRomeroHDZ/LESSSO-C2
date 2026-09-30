import { useEffect } from "react";
import type { HostInfo } from "../../../core/store/useScanStore";

interface PreviewModalProps {
  type: 'md' | 'html' | 'json';
  onClose: () => void;
  onSave: (type: 'md' | 'html' | 'json') => void;
  filteredData: HostInfo[];
  mdContent: string;
  htmlContent: string;
}

export function PreviewModal({ type, onClose, onSave, filteredData, mdContent, htmlContent }: PreviewModalProps) {
  // FIX UX: Bloqueamos el scroll del body mientras el modal está abierto
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[80vh] rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
        <div className="flex justify-between items-center px-4 py-3 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-xs font-bold uppercase text-slate-800 dark:text-slate-200">
            Vista Previa: {type.toUpperCase()}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500 font-bold">✕ Cerrar</button>
        </div>

        <div className="flex-1 overflow-auto p-4 bg-slate-100 dark:bg-slate-950">
          {type === 'json' && (
            <pre className="text-[11px] font-mono text-[#0b282c] dark:text-teal-400">
              {JSON.stringify(filteredData, null, 2)}
            </pre>
          )}
          {type === 'md' && (
            <pre className="text-[11px] font-mono text-slate-700 dark:text-slate-300">
              {mdContent}
            </pre>
          )}
          {type === 'html' && (
            <iframe
              title="Preview HTML"
              sandbox=""
              srcDoc={htmlContent}
              className="w-full h-full bg-white rounded shadow-sm border-0"
            />
          )}
        </div>

        <div className="p-3 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 rounded text-xs font-bold text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700">Cancelar</button>
          <button
            onClick={() => onSave(type)}
            className="px-4 py-1.5 bg-[#0b282c] text-white rounded text-xs font-bold shadow hover:bg-[#081e21]"
          >
            Guardar Archivo {type.toUpperCase()}
          </button>
        </div>
      </div>
    </div>
  );
}
