import { useState } from 'react';
import type { HostInfo } from '../../../core/store/useScanStore';
import { Search, Activity, Globe, ShieldAlert, Monitor, AlignJustify, BarChart2, Download, Printer, Trash2, ShieldCheck, Shield, Filter } from 'lucide-react';

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
  showMetrics: boolean;
  setShowMetrics: (v: boolean) => void;
  onExport: (type: 'md' | 'html' | 'json') => void;
  onPrint: () => void;
  onClear: () => void;
  cveAutoEnrich: boolean;
  toggleCveAutoEnrich: () => void;
}

export function FiltersBar({
  search, setSearch, filterUp, setFilterUp, filterVuln, setFilterVuln, filterWeb, setFilterWeb,
  filterOS, setFilterOS, filterCritPorts, setFilterCritPorts, compactMode, toggleCompactMode,
  showDiff, setShowDiff, historyData, setVisibleCount,
  showMetrics, setShowMetrics, onExport, onPrint, onClear, cveAutoEnrich, toggleCveAutoEnrich
}: FiltersBarProps) {
  
  const [exportOpen, setExportOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const triggerReset = () => setVisibleCount(20);

  return (
    <div className="flex items-center gap-4 shrink-0 print:hidden justify-between bg-white dark:bg-[#020617] p-1.5 px-3 border-b border-slate-200 dark:border-slate-800/80 shadow-sm w-full relative">
      
      {/* SECCIÓN IZQUIERDA: Layout y Búsqueda */}
      <div className="flex items-center gap-1 shrink-0 w-full sm:w-auto">
        <button onClick={() => setShowMetrics(!showMetrics)} title="Métricas y KPIs" className={`p-1.5 rounded-lg transition-colors border ${showMetrics ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400' : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
          <BarChart2 size={16} />
        </button>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block"></div>

        <div className="relative flex-1 sm:w-64 min-w-0">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); triggerReset(); }}
            placeholder="Buscar IP, puerto..."
            className="w-full pl-8 pr-3 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs outline-none dark:text-white font-mono focus:border-teal-500 transition-all min-w-0"
          />
        </div>
      </div>

      {/* SECCIÓN DERECHA: Menús de Filtros y Exportación */}
      <div className="flex items-center gap-2 shrink-0">
        
        {/* DROPDOWN DE FILTROS */}
        <div className="relative hidden sm:block">
          <button onClick={() => setFiltersOpen(!filtersOpen)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-colors ${filtersOpen || filterUp || filterWeb || filterVuln || filterCritPorts ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50'}`}>
            <Filter size={12} /> Filtros
          </button>

          {filtersOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl p-3 z-50 flex flex-col gap-2">
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Estado y Hallazgos</span>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setFilterUp(!filterUp); triggerReset(); }} className={`px-2 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors border flex items-center justify-center gap-1.5 ${filterUp ? 'bg-teal-500/10 border-teal-500/30 text-teal-600 dark:text-teal-400' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}><Activity size={12}/> Up</button>
                <button onClick={() => { setFilterWeb(!filterWeb); triggerReset(); }} className={`px-2 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors border flex items-center justify-center gap-1.5 ${filterWeb ? 'bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}><Globe size={12}/> Web</button>
                <button onClick={() => { setFilterVuln(!filterVuln); triggerReset(); }} className={`px-2 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors border flex items-center justify-center gap-1.5 ${filterVuln ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}><ShieldAlert size={12}/> Vulns</button>
                <button onClick={() => { setFilterCritPorts(!filterCritPorts); triggerReset(); }} className={`px-2 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors border flex items-center justify-center gap-1.5 ${filterCritPorts ? 'bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}><Activity size={12}/> Crit</button>
              </div>

              <div className="relative flex items-center mt-1">
                <Monitor size={12} className="absolute left-3 text-slate-400 pointer-events-none" />
                <select value={filterOS} onChange={(e) => {setFilterOS(e.target.value as any); triggerReset();}} className="w-full pl-8 pr-2 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded border border-slate-200 dark:border-slate-700 bg-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 outline-none cursor-pointer appearance-none">
                  <option value="all">OS: All (Mostrar Todos)</option>
                  <option value="windows">Windows</option>
                  <option value="linux">Linux</option>
                </select>
              </div>

              <div className="flex justify-between items-center mt-2 border-t border-slate-100 dark:border-slate-800/80 pt-3 gap-2">
                <button onClick={toggleCompactMode} className={`flex-1 px-2 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors border flex items-center justify-center gap-1.5 ${compactMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}><AlignJustify size={12}/> Compacto</button>
                <label className={`flex-1 flex items-center justify-center gap-1.5 cursor-pointer px-2 py-1.5 rounded border transition-colors ${historyData.length > 0 ? 'bg-indigo-500/10 border-indigo-500/30 hover:bg-indigo-500/20' : 'opacity-40 border-slate-200 dark:border-slate-800'}`}>
                  <input type="checkbox" checked={showDiff} disabled={historyData.length === 0} onChange={() => setShowDiff(!showDiff)} className="rounded w-3 h-3 accent-indigo-500" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">Diff</span>
                </label>
              </div>
            </div>
          )}
        </div>

        <button onClick={toggleCveAutoEnrich} title="CVE Auto Enrich (NVD)" className={`p-1.5 rounded-lg transition-colors border ${cveAutoEnrich ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400' : 'bg-transparent border-transparent text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
          {cveAutoEnrich ? <ShieldCheck size={16} /> : <Shield size={16} />}
        </button>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 mx-1"></div>

        {/* DROPDOWN DE EXPORTACIÓN */}
        <div className="relative">
          <button onClick={() => setExportOpen(!exportOpen)} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0b282c] dark:bg-teal-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-sm hover:bg-[#081e21] dark:hover:bg-teal-500 transition-colors">
            <Download size={12} /> Exportar
          </button>
          
          {exportOpen && (
            <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl overflow-hidden z-50">
              <button onClick={() => { onExport('json'); setExportOpen(false); }} className="w-full text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800/50">.JSON</button>
              <button onClick={() => { onExport('md'); setExportOpen(false); }} className="w-full text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800/50">.Markdown</button>
              <button onClick={() => { onExport('html'); setExportOpen(false); }} className="w-full text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50">.HTML</button>
              <div className="border-t border-slate-200 dark:border-slate-700" />
              <button onClick={() => { onPrint(); setExportOpen(false); }} className="w-full text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2"><Printer size={12}/> Imprimir PDF</button>
              <div className="border-t border-slate-200 dark:border-slate-700" />
              <button onClick={() => { onClear(); setExportOpen(false); }} className="w-full text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 flex items-center gap-2"><Trash2 size={12}/> Borrar Datos</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
