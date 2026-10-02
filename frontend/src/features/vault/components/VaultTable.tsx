import { Copy, Eye, EyeOff, Trash2, KeyRound, Hash, FileKey2 } from 'lucide-react';
import type { VaultCred } from '../../../core/store/useScanStore';

export function VaultTable({ credentials, revealed, onToggleReveal, onCopy, onRemove }: any) {
  if (!credentials || credentials.length === 0) {
    return (
      <div className="h-full flex items-center justify-center border border-dashed border-slate-300 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-[#0b1120]/30 mx-2 mb-2">
        <span className="text-slate-400 font-mono text-[10px] uppercase tracking-widest font-bold">Bóveda Vacía</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 overflow-y-auto custom-scrollbar h-full pb-6 px-1">
      {credentials.map((cred: VaultCred) => {
        const isRevealed = revealed[cred.id];
        
        let Icon = FileKey2;
        let typeColor = "text-slate-500 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700";
        
        if (cred.type === 'hash') {
          Icon = Hash;
          typeColor = "text-rose-600 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20";
        } else if (cred.type === 'password') {
          Icon = KeyRound;
          typeColor = "text-teal-600 bg-teal-50 dark:bg-teal-500/10 border-teal-200 dark:border-teal-500/20";
        }

        return (
          <div key={cred.id} className="flex flex-col bg-white dark:bg-[#0b1120] border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden hover:border-slate-300 dark:hover:border-slate-700 transition-all group">
            <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-[#060a13]">
              <div className="flex items-center gap-3 overflow-hidden">
                <span className={`p-1.5 rounded-lg border shadow-sm ${typeColor}`}>
                  <Icon size={14} />
                </span>
                <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 font-mono truncate">
                  {cred.target}
                </span>
              </div>
              <button onClick={() => onRemove(cred.id)} className="text-slate-400 hover:text-rose-500 transition-colors p-1 opacity-0 group-hover:opacity-100 focus:opacity-100 outline-none" title="Eliminar">
                <Trash2 size={14} />
              </button>
            </div>
            
            <div className="p-5 flex flex-col gap-4">
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Usuario</span>
                <span className="text-xs font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/80 px-2.5 py-1 rounded-md border border-slate-100 dark:border-slate-800/50 w-fit">
                  {cred.username || 'N/A'}
                </span>
              </div>
              
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Secreto</span>
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2.5 shadow-inner">
                  <span className="flex-1 text-xs font-mono text-slate-800 dark:text-rose-400 truncate">
                    {isRevealed ? cred.secret : '••••••••••••••••••••••••'}
                  </span>
                  <button onClick={() => onToggleReveal(cred.id)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors outline-none" title={isRevealed ? 'Ocultar' : 'Revelar'}>
                    {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button onClick={() => onCopy(cred.secret)} className="text-slate-400 hover:text-teal-500 transition-colors outline-none" title="Copiar al portapapeles">
                    <Copy size={14} />
                  </button>
                </div>
              </div>

              {cred.notes && (
                <div className="text-[10px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800/80 pt-3 mt-1 italic">
                  {cred.notes}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
