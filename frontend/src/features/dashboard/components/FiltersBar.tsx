import type { HostInfo } from '../../../core/store/useScanStore';

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
    <div className="flex flex-col sm:flex-row gap-3 shrink-0 print:hidden justify-between items-center bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
      <input
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); triggerReset(); }}
        placeholder="Buscar IP, port:22, os:linux..."
        className="flex-1 px-3 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-[11px] outline-none dark:text-white"
      />

      <div className="flex gap-1.5 flex-wrap">
        <button onClick={() => { setFilterUp(!filterUp); triggerReset(); }} className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-colors border ${filterUp ? 'bg-[#0b282c] border-[#0b282c] text-white shadow-sm' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>🟢 Activos</button>
        <button onClick={() => { setFilterWeb(!filterWeb); triggerReset(); }} className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-colors border ${filterWeb ? 'bg-[#0b282c] border-[#0b282c] text-white shadow-sm' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>🌐 Web</button>
        <button onClick={() => { setFilterVuln(!filterVuln); triggerReset(); }} className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-colors border ${filterVuln ? 'bg-red-600 border-red-600 text-white shadow-sm' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>🚨 CVEs</button>
        
        <div className="h-6 w-px bg-slate-300 dark:bg-slate-600 mx-1"></div>
        
        <select value={filterOS} onChange={(e) => {setFilterOS(e.target.value as any); triggerReset();}} className="px-2 py-1 text-[10px] font-bold uppercase rounded-full border border-slate-200 dark:border-slate-700 bg-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 outline-none">
            <option value="all">🖥 OS: Todos</option>
            <option value="windows">🪟 OS: Windows</option>
            <option value="linux">🐧 OS: Linux</option>
        </select>
        
        <button onClick={() => { setFilterCritPorts(!filterCritPorts); triggerReset(); }} className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-colors border ${filterCritPorts ? 'bg-orange-600 border-orange-600 text-white shadow-sm' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>🔥 Pts Críticos</button>

        <button onClick={toggleCompactMode} className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-colors border ${compactMode ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 shadow-sm' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>≡ Comp</button>
        
        <label className={`flex items-center space-x-1.5 cursor-pointer px-3 py-1 rounded-full border transition-colors ${historyData.length > 0 ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 hover:bg-teal-100' : 'opacity-50 border-slate-200'}`}>
          <input type="checkbox" checked={showDiff} disabled={historyData.length === 0} onChange={() => setShowDiff(!showDiff)} className="rounded w-3 h-3 accent-[#0b282c]" />
          <span className="text-[10px] font-bold uppercase text-teal-700 dark:text-teal-400">Diff</span>
        </label>
      </div>
    </div>
  );
}
