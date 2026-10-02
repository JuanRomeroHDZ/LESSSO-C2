import { Copy, Eye, EyeOff, Trash2, KeyRound, Hash, FileKey2, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import type { VaultCred } from '../../../core/store/vaultStore';

export function VaultTable({ credentials, revealed, onToggleReveal, onCopy, onRemove, onUpdate }: any) {
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
          typeColor = "text-amber-600 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20";
        } else if (cred.type === 'password') {
          Icon = KeyRound;
          typeColor = "text-teal-600 bg-teal-50 dark:bg-teal-500/10 border-teal-200 dark:border-teal-500/20";
        }

        const isStatusValid = cred.status === 'valid';
        const isStatusInvalid = cred.status === 'invalid';

        return (
          <div key={cred.id} className={`flex flex-col bg-white dark:bg-[#0b1120] border rounded-xl shadow-sm overflow-hidden transition-all group ${isStatusValid ? 'border-teal-500/50 shadow-teal-500/5' : isStatusInvalid ? 'border-rose-500/50 shadow-rose-500/5 opacity-70' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}`}>
            <div className={`flex justify-between items-center px-4 py-3 border-b ${isStatusValid ? 'bg-teal-50 dark:bg-teal-900/10 border-teal-100 dark:border-teal-900/30' : isStatusInvalid ? 'bg-rose-50 dark:bg-rose-900/10 border-rose-100 dark:border-rose-900/30' : 'bg-slate-50/50 dark:bg-[#060a13] border-slate-100 dark:border-slate-800/80'}`}>
              <div className="flex items-center gap-3 overflow-hidden">
                <span className={`p-1.5 rounded-lg border shadow-sm ${typeColor}`}>
                  <Icon size={14} />
                </span>
                <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 font-mono truncate">
                  {cred.target}
                </span>
              </div>
              
              <div className="flex items-center gap-1">
                {/* Botones de Estado */}
                <div className="flex bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden mr-2 shadow-sm">
                  <button onClick={() => onUpdate(cred.id, { status: 'unknown' })} className={`p-1 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${!isStatusValid && !isStatusInvalid ? 'text-slate-500 bg-slate-100 dark:bg-slate-800' : 'text-slate-300 dark:text-slate-600'}`} title="Sin probar"><HelpCircle size={12} /></button>
                  <button onClick={() => onUpdate(cred.id, { status: 'valid' })} className={`p-1 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors ${isStatusValid ? 'text-teal-600 bg-teal-50 dark:bg-teal-900/30' : 'text-slate-300 dark:text-slate-600'}`} title="Credencial Válida"><CheckCircle2 size={12} /></button>
                  <button onClick={() => onUpdate(cred.id, { status: 'invalid' })} className={`p-1 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors ${isStatusInvalid ? 'text-rose-600 bg-rose-50 dark:bg-rose-900/30' : 'text-slate-300 dark:text-slate-600'}`} title="Credencial Inválida"><XCircle size={12} /></button>
                </div>
                
                <button onClick={() => onRemove(cred.id)} className="text-slate-400 hover:text-rose-500 transition-colors p-1 opacity-0 group-hover:opacity-100 focus:opacity-100 outline-none" title="Eliminar">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            
            <div className="p-5 flex flex-col gap-4">
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Usuario</span>
                <span className={`text-xs font-mono px-2.5 py-1 rounded-md border w-fit ${isStatusInvalid ? 'text-slate-500 border-transparent bg-transparent px-0' : 'text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/80 border-slate-100 dark:border-slate-800/50'}`}>
                  {cred.username || 'N/A'}
                </span>
              </div>
              
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Secreto</span>
                <div className={`flex items-center gap-2 border rounded-lg px-3 py-2.5 shadow-inner ${isStatusInvalid ? 'bg-transparent border-slate-200 dark:border-slate-800/50 opacity-50' : 'bg-slate-50 dark:bg-[#020617] border-slate-200 dark:border-slate-800'}`}>
                  <span className={`flex-1 text-xs font-mono truncate ${isStatusInvalid ? 'text-slate-500 line-through' : cred.type === 'hash' ? 'text-amber-600 dark:text-amber-500' : 'text-teal-700 dark:text-teal-400'}`}>
                    {isRevealed ? cred.secret : '••••••••••••••••••••••••'}
                  </span>
                  <button onClick={() => onToggleReveal(cred.id)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors outline-none" title={isRevealed ? 'Ocultar' : 'Revelar'}>
                    {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button onClick={() => onCopy(cred.secret)} className="text-slate-400 hover:text-indigo-500 transition-colors outline-none" title="Copiar al portapapeles">
                    <Copy size={14} />
                  </button>
                </div>
              </div>

              {cred.tags && cred.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {cred.tags.map(t => (
                    <span key={t} className="px-2 py-0.5 text-[8.5px] font-bold uppercase tracking-widest bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 rounded">
                      {t}
                    </span>
                  ))}
                </div>
              )}

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
