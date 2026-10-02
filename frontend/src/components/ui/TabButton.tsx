import { cn } from '../../lib/utils';

export function TabButton({ active, onClick, icon, label, color }: any) {
  const colorMap: Record<string, string> = {
    teal: "border-teal-500 text-teal-600 dark:text-teal-400 bg-white dark:bg-[#0b1120]",
    indigo: "border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-[#0b1120]",
    rose: "border-rose-500 text-rose-600 dark:text-rose-400 bg-white dark:bg-[#0b1120]",
    fuchsia: "border-fuchsia-500 text-fuchsia-600 dark:text-fuchsia-400 bg-white dark:bg-[#0b1120]",
    sky: "border-sky-500 text-sky-600 dark:text-sky-400 bg-white dark:bg-[#0b1120]",
  };
  return (
    <button 
      onClick={onClick} 
      className={cn(
        "px-3 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 rounded-t-lg", 
        active ? colorMap[color] : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50"
      )}
    >
      {icon} <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
