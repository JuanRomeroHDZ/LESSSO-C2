import { useState } from 'react';
import { MITRE_DATA } from '../../core/data/mitre';
import { BookOpen, Search, Copy, Shield, Wrench } from 'lucide-react';

export function MitrePanel() {
  const [search, setSearch] = useState('');

  const filteredMitre = MITRE_DATA.filter(t =>  
    t.id.toLowerCase().includes(search.toLowerCase()) ||  
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.tactic.toLowerCase().includes(search.toLowerCase())
  );

  const copyTag = (id: string, name: string) => {
    const tag = `[MITRE: ${id} - ${name}]`;
    navigator.clipboard.writeText(tag);
    alert(`Tag de reporte copiado:\n${tag}`);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#020617] p-6 relative overflow-hidden">
      <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/80 rounded-xl p-5 mb-6 shadow-sm shrink-0">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
            <BookOpen size={18} className="text-teal-500"/> MITRE ATT&CK Intelligence
          </h2>
          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold uppercase tracking-wider px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700">Base Local (Top CPTS)</span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed max-w-3xl">
          Busca tácticas o técnicas (TTPs) para mapear tus hallazgos y agregarlas profesionalmente a tu Bitácora o Reporte final de auditoría.
        </p>
        <div className="relative flex items-center">
          <Search size={16} className="absolute left-3 text-slate-400" />
          <input  
            type="text"  
            value={search}  
            onChange={e => setSearch(e.target.value)}  
            placeholder="Buscar por ID (Ej: T1595), Nombre o Táctica..."  
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-slate-700 rounded-lg text-xs outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:text-white transition-all shadow-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pb-8 pr-2">
        {filteredMitre.length > 0 ? filteredMitre.map((tech) => (
          <div key={tech.id} className="bg-white dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800/80 rounded-xl p-5 shadow-sm hover:border-teal-500/30 transition-colors group">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-black font-mono text-teal-600 dark:text-teal-400 bg-teal-500/10 px-2.5 py-1 rounded-md border border-teal-500/20">{tech.id}</span>
                  <h3 className="text-sm font-black text-slate-800 dark:text-white tracking-tight">{tech.name}</h3>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700">
                  {tech.tactic}
                </span>
              </div>
              <button onClick={() => copyTag(tech.id, tech.name)} className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 text-[10px] font-bold uppercase tracking-wider rounded-md hover:bg-teal-500 hover:text-white dark:hover:bg-teal-500 dark:hover:text-slate-950 transition-colors shadow-sm opacity-0 group-hover:opacity-100">
                <Copy size={14} /> Copiar Tag
              </button>
            </div>
             
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-50 dark:bg-[#09090b] p-4 rounded-lg border border-slate-200 dark:border-slate-800/80">
                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2"><Shield size={12}/> Descripción del Ataque</span>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">{tech.description}</p>
              </div>
              <div className="bg-teal-50 dark:bg-teal-900/10 p-4 rounded-lg border border-teal-100 dark:border-teal-800/30">
                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-teal-700 dark:text-teal-500 mb-2"><Wrench size={12}/> Remediación</span>
                <p className="text-[11px] text-teal-800 dark:text-teal-200/70 leading-relaxed">{tech.mitigation}</p>
              </div>
            </div>
          </div>
        )) : (
          <div className="text-center p-12 text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-widest border border-dashed border-slate-300 dark:border-slate-800 rounded-xl">No se encontraron técnicas TTP con ese término.</div>
        )}
      </div>
    </div>
  );
}
