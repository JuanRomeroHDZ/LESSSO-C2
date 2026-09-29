import { useState } from 'react';
import { MITRE_DATA } from '../../core/data/mitre';

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
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 p-4 relative overflow-hidden">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 mb-4 shadow-sm shrink-0">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-sm font-black text-[#0b282c] dark:text-teal-400 uppercase flex items-center gap-2">
            <span className="text-xl">📖</span> MITRE ATT&CK Intelligence
          </h2>
          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold px-2 py-1 rounded">Base de Datos Local (Top CPTS)</span>
        </div>
        <p className="text-[11px] text-slate-500 mb-3">Busca tácticas o técnicas (TTPs) para mapear tus hallazgos y agregarlas profesionalmente a tu Bitácora o Reporte final.</p>
        <input 
          type="text" 
          value={search} 
          onChange={e => setSearch(e.target.value)} 
          placeholder="Buscar por ID (T1595), Nombre o Táctica (Initial Access)..." 
          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#0b282c] dark:text-white transition-shadow"
        />
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pb-8">
        {filteredMitre.length > 0 ? filteredMitre.map((tech) => (
          <div key={tech.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm hover:border-[#0b282c]/30 transition-colors group">
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-black text-white bg-[#0b282c] px-2 py-0.5 rounded shadow-sm">{tech.id}</span>
                  <h3 className="text-[13px] font-bold text-slate-800 dark:text-white">{tech.name}</h3>
                </div>
                <span className="text-[10px] font-bold uppercase text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-[#0b282c]/20 px-2 py-0.5 rounded border border-teal-100 dark:border-[#0b282c]">{tech.tactic}</span>
              </div>
              <button onClick={() => copyTag(tech.id, tech.name)} className="px-3 py-1.5 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 text-[10px] font-bold uppercase rounded hover:bg-[#0b282c] hover:text-white dark:hover:bg-teal-700 transition-colors shadow-sm">
                Copiar Tag 🏷️
              </button>
            </div>
            
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded border border-slate-100 dark:border-slate-800">
                <span className="block text-[9px] font-black uppercase text-slate-400 mb-1">Descripción del Ataque</span>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">{tech.description}</p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-900/10 p-2.5 rounded border border-emerald-100 dark:border-emerald-800/50">
                <span className="block text-[9px] font-black uppercase text-emerald-600 dark:text-emerald-500 mb-1">Estrategia de Remediación</span>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">{tech.mitigation}</p>
              </div>
            </div>
          </div>
        )) : (
          <div className="text-center p-8 text-slate-400 text-sm font-bold">No se encontraron técnicas con ese término.</div>
        )}
      </div>
    </div>
  );
}
