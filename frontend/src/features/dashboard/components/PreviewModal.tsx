import { useEffect, useMemo, useRef, useState } from "react";
import type { HostInfo } from "../../../core/store/useScanStore";
import type { ReportSignature } from "../../../core/store/uiStore";
import { useUiStore } from "../../../core/store/uiStore";
import { hashAlgorithmLabel } from "../utils/hash";

// ==========================================================
// PreviewModal
// ----------------------------------------------------------
// Vista previa del reporte antes de guardarlo.
//
// Fixes importantes:
//  1. `htmlContent` se calcula UNA VEZ al abrir el modal con
//     useMemo, no en cada render del padre. Sin esto, el iframe
//     se remonta en cada keystroke y resetea el scroll.
//  2. El wrapper del iframe tiene `overscroll-behavior: contain`
//     y `touch-action: pan-y` para evitar que la rueda del mouse
//     se propague al body y haga scroll hacia arriba.
//  3. El iframe NO usa sandbox="" (bloquea todo, incluido scroll
//     programático). Usamos un sandbox permisivo solo para scripts
//     bloqueados, permitiendo same-origin para estilos.
// ==========================================================

interface PreviewModalProps {
  type: 'md' | 'html' | 'json';
  onClose: () => void;
  onSave: (type: 'md' | 'html' | 'json') => void;
  filteredData: HostInfo[];
  /** Se calcula una sola vez en el padre y se pasa estable. */
  mdContent: string;
  htmlContent: string;
  /** Hash de integridad ya calculado (async). null si aún no está listo. */
  integrityHash: string | null;
  /** Para el preview JSON: payload final incluyendo el hash. */
  jsonContent: string;
}

export function PreviewModal({
  type,
  onClose,
  onSave,
  filteredData,
  mdContent,
  htmlContent,
  integrityHash,
  jsonContent,
}: PreviewModalProps) {
  const includeCvss = useUiStore((s) => s.includeCvss);
  const setIncludeCvss = useUiStore((s) => s.setIncludeCvss);
  const signature = useUiStore((s) => s.signature);
  const setSignature = useUiStore((s) => s.setSignature);
  const clearSignature = useUiStore((s) => s.clearSignature);

  const [showSigForm, setShowSigForm] = useState<boolean>(signature.name.length > 0);

  // Ref al contenedor scrolleable del iframe (para el fix de scroll)
  const htmlScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'contain';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.overscrollBehavior = prevOverscroll;
    };
  }, []);

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Fecha de firma por defecto: la del momento en que se abre el form
  const defaultSigDate = useMemo(() => new Date().toISOString(), []);

  // Sello de firma: si el usuario no puso fecha, usamos la de apertura
  const effectiveSigDate = signature.date || defaultSigDate;

  const handleSigChange = (field: keyof ReportSignature, value: string) => {
    setSignature({ [field]: value });
  };

  const handleAutoDate = () => {
    setSignature({ date: new Date().toISOString() });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in"
      onMouseDown={(e) => {
        // Cerrar solo si el click fue en el backdrop, no dentro del panel
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[85vh] rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">

        {/* ===== Header ===== */}
        <div className="flex justify-between items-center px-4 py-3 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-xs font-bold uppercase text-slate-800 dark:text-slate-200">
              Vista Previa: {type.toUpperCase()}
            </h3>
            {integrityHash && (
              <span
                title={`${hashAlgorithmLabel(integrityHash)}: ${integrityHash}`}
                className="text-[9px] font-mono px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
              >
                🔒 {integrityHash.slice(0, 12)}…
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-red-500 font-bold text-sm"
          >
            ✕ Cerrar
          </button>
        </div>

        {/* ===== Toolbar config ===== */}
        <div className="px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="flex flex-wrap items-center gap-4 text-[11px]">

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeCvss}
                onChange={(e) => setIncludeCvss(e.target.checked)}
                className="w-3.5 h-3.5 accent-teal-600"
              />
              <span className="font-bold uppercase text-slate-700 dark:text-slate-300">
                Incluir CVSS
              </span>
            </label>

            <button
              type="button"
              onClick={() => setShowSigForm((v) => !v)}
              className={
                'px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors ' +
                (showSigForm
                  ? 'bg-teal-600 text-white hover:bg-teal-500'
                  : 'border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800')
              }
            >
              {showSigForm ? '✓ Firmas' : '+ Añadir firma'}
            </button>

            {signature.name && (
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                Firmado por <b className="text-slate-700 dark:text-slate-200">{signature.name}</b>
              </span>
            )}

            <span className="ml-auto text-[9px] text-slate-400 dark:text-slate-500">
              {filteredData.length} hosts en el reporte
            </span>
          </div>

          {/* ===== Form de firma ===== */}
          {showSigForm && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 p-2 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <input
                type="text"
                placeholder="Nombre del auditor *"
                value={signature.name}
                onChange={(e) => handleSigChange('name', e.target.value)}
                className="text-[11px] px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500"
              />
              <input
                type="text"
                placeholder="Cargo"
                value={signature.role}
                onChange={(e) => handleSigChange('role', e.target.value)}
                className="text-[11px] px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500"
              />
              <input
                type="text"
                placeholder="Empresa"
                value={signature.company}
                onChange={(e) => handleSigChange('company', e.target.value)}
                className="text-[11px] px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500"
              />
              <div className="flex gap-1">
                <input
                  type="text"
                  placeholder="Fecha UTC (auto)"
                  value={effectiveSigDate}
                  onChange={(e) => handleSigChange('date', e.target.value)}
                  className="flex-1 text-[10px] font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500"
                />
                <button
                  type="button"
                  onClick={handleAutoDate}
                  title="Poner fecha UTC actual"
                  className="px-2 py-1 text-[10px] font-bold rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  ⟳
                </button>
                {signature.name && (
                  <button
                    type="button"
                    onClick={() => {
                      clearSignature();
                      setShowSigForm(false);
                    }}
                    title="Borrar firma"
                    className="px-2 py-1 text-[10px] font-bold rounded border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ===== Contenido ===== */}
        <div className="flex-1 min-h-0 overflow-hidden bg-slate-100 dark:bg-slate-950">

          {type === 'json' && (
            <div className="w-full h-full overflow-auto p-4">
              <pre className="text-[11px] font-mono text-[#0b282c] dark:text-teal-400 whitespace-pre-wrap break-words">
                {jsonContent}
              </pre>
            </div>
          )}

          {type === 'md' && (
            <div className="w-full h-full overflow-auto p-4">
              <pre className="text-[11px] font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
                {mdContent}
              </pre>
            </div>
          )}

          {type === 'html' && (
            <div
              ref={htmlScrollRef}
              // overscroll-behavior: contain evita que el scroll del iframe
              // se propague al body del padre (bug de "me regresa para arriba")
              // touch-action: pan-y asegura que en touchpads no haga zoom/pan-x
              style={{
                width: '100%',
                height: '100%',
                overflow: 'auto',
                overscrollBehavior: 'contain',
                touchAction: 'pan-y',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              <iframe
                title="Preview HTML"
                // sandbox SIN "" (vacío bloquea todo). Permitimos same-origin
                // para que el iframe pueda scrollear programáticamente y
                // cargar estilos inline.
                sandbox="allow-same-origin"
                srcDoc={htmlContent}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 0,
                  display: 'block',
                  background: 'white',
                }}
              />
            </div>
          )}
        </div>

        {/* ===== Footer ===== */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded text-xs font-bold text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Cancelar
          </button>
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
