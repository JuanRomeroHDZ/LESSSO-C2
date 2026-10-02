import { useState } from 'react';
import type { HostInfo } from '../../../core/store/useScanStore';
import { Search, Activity, Globe, ShieldAlert, Monitor, AlignJustify, Settings2, BarChart2, Download, Printer, Trash2, ShieldCheck, Shield } from 'lucide-react';

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
  // NUEVAS PROPS PARA EL LAYOUT XDR
  showConfig: boolean;
  setShowConfig: (v: boolean) => void;
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
  showConfig, setShowConfig, showMetrics, setShowMetrics, onExport, onPrint, onClear, cveAutoEnrich, toggleCveAutoEnrich
}: FiltersBarProps) {
  
  const [exportOpen, setExportOpen] = useState(false);
  const triggerReset = () => setVisibleCount(20);

  return (
    <div className="flex flex-col lg:flex-row gap-2 shrink-0 print:hidden justify-between items-center bg-white dark:bg-[#020617] p-2 border-b border-slate-200 dark:border-slate-800/80 shadow-sm w-full">
      
      {/* SECCIÓN IZQUIERDA: Controles de Layout */}
      <div className="flex items-center gap-1 w-full lg:w-auto">
        <button onClick={() => setShowConfig(!showConfig)} title="Configuración de Escaneo" className={`p-1.5 rounded-lg transition-colors border ${showConfig ? 'bg-teal-500/10 border-teal-500/30 text-teal-600 dark:text-teal-400' : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
          <Settings2 size={16} />
        </button>
        <button onClick={() => setShowMetrics(!showMetrics)} title="Métricas y KPIs" className={`p-1.5 rounded-lg transition-colors border ${showMetrics ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400' : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
          <BarChart2 size={16} />
        </button>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 mx-1"></div>

        <div className="relative flex-1 lg:w-64 min-w-[150px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); triggerReset(); }}
            placeholder="Buscar IP, puerto..."
            className="w-full pl-8 pr-3 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs outline-none dark:text-white font-mono focus:border-teal-500 transition-all"
          />
        </div>
      </div>

      {/* SECCIÓN CENTRAL: Filtros Rápidos (Pills) */}
      <div className="flex gap-1 flex-wrap items-center justify-center w-full lg:w-auto overflow-x-auto custom-scrollbar">
        <button onClick={() => { setFilterUp(!filterUp); triggerReset(); }} className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-colors border flex items-center gap-1 ${filterUp ? 'bg-teal-500/10 border-teal-500/30 text-teal-600 dark:text-teal-400' : 'bg-transparent border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'}`}>
          <Activity size={10}/> Up
        </button>
        <button onClick={() => { setFilterWeb(!filterWeb); triggerReset(); }} className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-colors border flex items-center gap-1 ${filterWeb ? 'bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400' : 'bg-transparent border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'}`}>
          <Globe size={10}/> Web
        </button>
        <button onClick={() => { setFilterVuln(!filterVuln); triggerReset(); }} className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-colors border flex items-center gap-1 ${filterVuln ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400' : 'bg-transparent border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'}`}>
          <ShieldAlert size={10}/> Vulns
        </button>
        <button onClick={() => { setFilterCritPorts(!filterCritPorts); triggerReset(); }} className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-colors border flex items-center gap-1 ${filterCritPorts ? 'bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400' : 'bg-transparent border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'}`}>
          <Activity size={10}/> Crit
        </button>

        <div className="relative flex items-center mx-1">
          <Monitor size={10} className="absolute left-2 text-slate-400 pointer-events-none" />
          <select value={filterOS} onChange={(e) => {setFilterOS(e.target.value as any); triggerReset();}} className="pl-6 pr-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 dark:border-slate-800 bg-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900 outline-none cursor-pointer appearance-none">
            <option value="all">OS: All</option>
            <option value="windows">Windows</option>
            <option value="linux">Linux</option>
          </select>
        </div>

        <button onClick={toggleCompactMode} title="Modo Compacto" className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-colors border flex items-center gap-1 ${compactMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-transparent border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'}`}>
          <AlignJustify size={10}/>
        </button>
        
        <label className={`flex items-center gap-1 cursor-pointer px-2 py-1 rounded border transition-colors ${historyData.length > 0 ? 'bg-indigo-500/10 border-indigo-500/30 hover:bg-indigo-500/20' : 'opacity-40 border-slate-200 dark:border-slate-800'}`}>
          <input type="checkbox" checked={showDiff} disabled={historyData.length === 0} onChange={() => setShowDiff(!showDiff)} className="rounded w-3 h-3 accent-indigo-500" />
          <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">Diff</span>
        </label>
      </div>

      {/* SECCIÓN DERECHA: Acciones y Exportaciones */}
      <div className="flex items-center gap-1 w-full lg:w-auto justify-end">
        
        <button onClick={toggleCveAutoEnrich} title="CVE Auto Enrich (NVD)" className={`p-1.5 rounded-lg transition-colors border ${cveAutoEnrich ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400' : 'bg-transparent border-transparent text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
          {cveAutoEnrich ? <ShieldCheck size={16} /> : <Shield size={16} />}
        </button>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 mx-1"></div>

        <div className="relative">
          <button onClick={() => setExportOpen(!exportOpen)} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0b282c] dark:bg-teal-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-sm hover:bg-[#081e21] dark:hover:bg-teal-500 transition-colors">
            <Download size={12} /> Exportar
          </button>
          
          {exportOpen && (
            <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl overflow-hidden z-50">
              <button onClick={() => { onExport('json'); setExportOpen(false); }} className="w-full text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50">.JSON</button>
              <button onClick={() => { onExport('md'); setExportOpen(false); }} className="w-full text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50">.Markdown</button>
              <button onClick={() => { onExport('html'); setExportOpen(false); }} className="w-full text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50">.HTML</button>
              <div className="border-t border-slate-100 dark:border-slate-800" />
              <button onClick={() => { onPrint(); setExportOpen(false); }} className="w-full text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-2"><Printer size={12}/> Imprimir PDF</button>
              <div className="border-t border-slate-100 dark:border-slate-800" />
              <button onClick={() => { onClear(); setExportOpen(false); }} className="w-full text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"><Trash2 size={12}/> Borrar Datos</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
