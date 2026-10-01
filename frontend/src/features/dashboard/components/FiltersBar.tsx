import type { HostInfo } from '../../../core/store/useScanStore';
import { Search, Activity, Globe, ShieldAlert, Monitor, AlignJustify } from 'lucide-react';

interface FiltersBarProps {
  search: string;
  setSearch: (s: string) => void;
  filterUp: boolean;
  setFilterUp: (v: boolean) => void;
  filterVuln: boolean;
  setFilterVuln: (v: boolean) => void;
  filterWeb: boolean;
  setFilterWeb: (v: boolean) => void;
  filterOS: 'all' | 'windows' | 'linux';
  setFilterOS: (v: 'all' | 'windows' | 'linux') => void;
  filterCritPorts: boolean;
  setFilterCritPorts: (v: boolean) => void;
  compactMode: boolean;
  toggleCompactMode: () => void;
  showDiff: boolean;
  setShowDiff: (v: boolean) => void;
  historyData: HostInfo[];
  setVisibleCount: (v: number) => void;
}

export function FiltersBar({
  search, setSearch, filterUp, setFilterUp, filterVuln, setFilterVuln, filterWeb, setFilterWeb,
  filterOS, setFilterOS, filterCritPorts, setFilterCritPorts, compactMode, toggleCompactMode,
  showDiff, setShowDiff, historyData, setVisibleCount
}: FiltersBarProps) {
  
  const triggerReset = () => setVisibleCount(20);

  return (
    <div className="flex flex-col xl:flex-row gap-3 shrink-0 print:hidden justify-between items-center bg-white dark:bg-[#020617] p-2 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm w-full">
      <div className="relative flex-1 w-full min-w-[200px]">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); triggerReset(); }}
          placeholder="Buscar IP, port:22, os:linux..."
          className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs outline-none dark:text-white font-mono focus:border-teal-500 focus:ring-1 focus:ring-teal-500/50 transition-all"
        />
      </div>

      <div className="flex gap-2 flex-wrap items-center justify-center lg:justify-end w-full xl:w-auto">
        <button onClick={() => { setFilterUp(!filterUp); triggerReset(); }} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors border flex items-center gap-1.5 ${filterUp ? 'bg-teal-500/10 border-teal-500/30 text-teal-600 dark:text-teal-400 shadow-sm' : 'bg-transparent border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'}`}>
          <Activity size={12}/> Activos
        </button>
        <button onClick={() => { setFilterWeb(!filterWeb); triggerReset(); }} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors border flex items-center gap-1.5 ${filterWeb ? 'bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400 shadow-sm' : 'bg-transparent border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'}`}>
          <Globe size={12}/> Web
        </button>
        <button onClick={() => { setFilterVuln(!filterVuln); triggerReset(); }} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors border flex items-center gap-1.5 ${filterVuln ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400 shadow-sm' : 'bg-transparent border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'}`}>
          <ShieldAlert size={12}/> CVEs
        </button>
        
        <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block"></div>
        
        <div className="relative flex items-center">
          <Monitor size={12} className="absolute left-2.5 text-slate-400 pointer-events-none" />
          <select value={filterOS} onChange={(e) => {setFilterOS(e.target.value as any); triggerReset();}} className="pl-7 pr-2 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 outline-none cursor-pointer appearance-none">
            <option value="all">OS: Todos</option>
            <option value="windows">OS: Windows</option>
            <option value="linux">OS: Linux</option>
          </select>
        </div>
        
        <button onClick={() => { setFilterCritPorts(!filterCritPorts); triggerReset(); }} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors border flex items-center gap-1.5 ${filterCritPorts ? 'bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400 shadow-sm' : 'bg-transparent border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'}`}>
          <Activity size={12}/> Pts Críticos
        </button>

        <button onClick={toggleCompactMode} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors border flex items-center gap-1.5 ${compactMode ? 'bg-slate-800 border-slate-700 text-white shadow-sm' : 'bg-transparent border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'}`}>
          <AlignJustify size={12}/> Comp
        </button>
        
        <label className={`flex items-center gap-1.5 cursor-pointer px-3 py-1.5 rounded-lg border transition-colors ${historyData.length > 0 ? 'bg-indigo-500/10 border-indigo-500/30 hover:bg-indigo-500/20' : 'opacity-40 border-slate-200 dark:border-slate-800'}`}>
          <input type="checkbox" checked={showDiff} disabled={historyData.length === 0} onChange={() => setShowDiff(!showDiff)} className="rounded w-3 h-3 accent-indigo-500" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">Diff</span>
        </label>
      </div>
    </div>
  );
}
