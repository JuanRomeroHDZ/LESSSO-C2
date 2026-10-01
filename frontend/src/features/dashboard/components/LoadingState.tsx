import { Loader2, Terminal } from 'lucide-react';

export function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-[#020617] rounded-xl border border-slate-200 dark:border-slate-800/60 shadow-sm min-h-[200px]">
      <div className="relative flex items-center justify-center mb-4">
        <Loader2 size={32} className="text-teal-500 animate-spin absolute" />
        <Terminal size={14} className="text-slate-400" />
      </div>
      <h3 className="text-slate-900 dark:text-slate-200 font-mono text-xs font-semibold tracking-wider uppercase">
        Estructurando Base de Datos de Nmap
      </h3>
      <p className="text-[10px] text-slate-500 font-mono mt-2 animate-pulse">
        Parseando XML y cruzando vulnerabilidades...
      </p>
    </div>
  );
}
