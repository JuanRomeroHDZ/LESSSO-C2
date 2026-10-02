import { cn } from '../../lib/utils';

export function CompactCheckbox({ label, checked, disabled, onChange, conflictMsg, overrideMsg, highlight = 'teal' }: any) {
  const bgMap: Record<string, string> = {
    teal: "bg-teal-50 dark:bg-teal-500/10 border-teal-500/50 text-teal-700 dark:text-teal-400",
    indigo: "bg-indigo-50 dark:bg-indigo-500/10 border-indigo-500/50 text-indigo-700 dark:text-indigo-400",
    rose: "bg-rose-50 dark:bg-rose-500/10 border-rose-500/50 text-rose-700 dark:text-rose-400",
    sky: "bg-sky-50 dark:bg-sky-500/10 border-sky-500/50 text-sky-700 dark:text-sky-400",
  };
  const activeClass = bgMap[highlight];

  return (
    <label className={cn(
      "flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer shadow-sm",
      disabled && !overrideMsg ? "bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800 opacity-60" :
      checked ? activeClass : "bg-white dark:bg-[#0b1120] border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
    )}>
      <div className="flex flex-col overflow-hidden">
        <span className={cn("text-[10px] font-bold uppercase tracking-wider truncate", checked && !disabled ? "text-inherit" : "text-slate-600 dark:text-slate-400")}>
          {label}
        </span>
        {conflictMsg && disabled && !overrideMsg && <span className="text-[8px] font-bold text-rose-500 dark:text-rose-400 truncate mt-0.5">{conflictMsg}</span>}
        {overrideMsg && <span className="text-[8px] font-bold text-indigo-500 dark:text-indigo-400 truncate mt-0.5">{overrideMsg}</span>}
      </div>
      <input 
        type="checkbox" 
        checked={checked} 
        disabled={disabled} 
        onChange={onChange} 
        className={cn("shrink-0 w-3.5 h-3.5 rounded ml-2", `accent-${highlight}-600`)} 
      />
    </label>
  );
}
