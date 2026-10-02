import { KeyRound, Eye, EyeOff, Copy, Trash2 } from 'lucide-react';
import type { VaultCred } from '../../../core/store/useScanStore';

interface VaultTableProps {
  credentials: VaultCred[];
  revealed: Record<string, boolean>;
  onToggleReveal: (id: string) => void;
  onCopy: (text: string) => void;
  onRemove: (id: string) => void;
}

export function VaultTable({
  credentials,
  revealed,
  onToggleReveal,
  onCopy,
  onRemove
}: VaultTableProps) {
  return (
    <div className="flex-1 overflow-auto custom-scrollbar border border-slate-200 dark:border-slate-800/80 rounded-xl shadow-sm bg-white dark:bg-slate-900/20">
      <table className="w-full table-fixed text-left text-xs text-slate-600 dark:text-slate-300">
        <thead className="bg-slate-50 dark:bg-slate-900/80 uppercase font-bold text-[10px] tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800/80 sticky top-0 z-10">
          <tr>
            <th className="p-3">Credencial</th>
            <th className="p-3 w-12 text-center">Acción</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
          {credentials.map(c => (
            <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
              <td className="p-3 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-bold text-slate-900 dark:text-white break-all">{c.target}</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-sm border border-slate-200 dark:border-slate-700 shrink-0">
                    {c.type}
                  </span>
                </div>
                <div className="text-slate-500 text-[11px] mb-2 flex items-center gap-1.5 break-all">
                  <KeyRound size={10} className="shrink-0" /> {c.username || 'Sin usuario'}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-mono text-xs text-teal-600 dark:text-teal-400 break-all bg-teal-50 dark:bg-teal-500/10 border border-teal-100 dark:border-teal-500/20 px-2 py-1 rounded w-fit max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap">
                    {revealed[c.id] ? c.secret : '••••••••••••••••'}
                  </div>
                  <button onClick={() => onToggleReveal(c.id)} className="text-slate-400 hover:text-teal-500 transition-colors p-1 shrink-0" title="Mostrar/Ocultar">
                    {revealed[c.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button onClick={() => onCopy(c.secret)} className="text-slate-400 hover:text-teal-500 transition-colors p-1 shrink-0" title="Copiar al portapapeles">
                    <Copy size={14} />
                  </button>
                </div>
              </td>
              <td className="p-3 text-center align-middle">
                <button onClick={() => onRemove(c.id)} className="text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 p-2 rounded-md transition-all opacity-0 group-hover:opacity-100" title="Eliminar">
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
          {credentials.length === 0 && (
            <tr>
              <td colSpan={2} className="p-4 align-middle">
                <div className="flex flex-col items-center justify-center w-full min-w-0 break-words whitespace-normal text-slate-400 dark:text-slate-500 text-[11px] font-mono leading-relaxed">
                  <span>Bóveda vacía.</span>
                  <span>Almacena contraseñas o hashes.</span>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
