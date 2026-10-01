import { useMemo } from 'react';
import { VULN_PAYLOADS, VULN_CATEGORIES, type VulnPayload, type VulnCategory, type NoiseLevel } from '../../core/data/vuln-payloads';
import { vulnToSelectable, fuzzyMatch, NOISE_META, type SelectablePayload, type ArsenalPlaceholders } from '../../core/data/arsenal-types';
import { Search } from 'lucide-react';

interface VulnPayloadsToolProps {
  onSelect: (payload: SelectablePayload) => void;
  selectedId: string | null;
  searchQuery: string;
  noiseFilter: NoiseLevel | 'all';
  placeholders: {
    TARGET: string;
    COLLAB: string;
    PARAM: string;
  };
}

const CATEGORY_ORDER: VulnCategory[] = [
  'sqli', 'xss', 'lfi', 'rfi', 'ssti', 'xxe', 'ssrf',
  'cmdi', 'nosqli', 'ldapi', 'crlf', 'openredirect',
  'prototype', 'deserialization',
];

export function VulnPayloadsTool({ onSelect, selectedId, searchQuery, noiseFilter, placeholders }: VulnPayloadsToolProps) {
  const currentPlaceholders = useMemo(() => {
    return { TARGET: placeholders.TARGET, COLLAB: placeholders.COLLAB, PARAM: placeholders.PARAM } as ArsenalPlaceholders;
  }, [placeholders]);

  const filteredPayloads = useMemo(() => {
    let result = VULN_PAYLOADS;
    if (noiseFilter !== 'all') { result = result.filter(p => p.noise === noiseFilter); }
    if (searchQuery.trim()) {
      result = result.filter(p => {
        const selectable = vulnToSelectable(p, currentPlaceholders);
        return fuzzyMatch(searchQuery, selectable);
      });
    }
    return result;
  }, [searchQuery, noiseFilter, currentPlaceholders]);

  const groupedPayloads = useMemo(() => {
    const groups: Record<string, VulnPayload[]> = {};
    filteredPayloads.forEach(p => {
      if (!groups[p.category]) groups[p.category] = [];
      groups[p.category].push(p);
    });
    return groups;
  }, [filteredPayloads]);

  const handleClick = (vuln: VulnPayload) => {
    onSelect(vulnToSelectable(vuln, currentPlaceholders));
  };

  if (filteredPayloads.length === 0) {
    const filterInfo = [
      searchQuery && `búsqueda "${searchQuery}"`,
      noiseFilter !== 'all' && `ruido "${NOISE_META[noiseFilter].label}"`,
    ].filter(Boolean).join(' + ');

    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-[#09090b]">
        <Search size={32} className="mb-4 text-slate-600" />
        <p className="text-[11px] font-mono text-slate-500">
          {filterInfo ? `Sin resultados para ${filterInfo}` : 'Sin payloads disponibles'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-2 gap-3">
      {CATEGORY_ORDER.map(catKey => {
        const payloads = groupedPayloads[catKey];
        if (!payloads || payloads.length === 0) return null;
        const catMeta = VULN_CATEGORIES[catKey];

        return (
          <div key={catKey} className="flex flex-col gap-1.5">
            <div className="sticky top-0 z-10 bg-slate-50/95 dark:bg-[#020617]/95 backdrop-blur-md px-3 py-2 border border-slate-200 dark:border-slate-800/80 rounded-md flex items-center gap-2 shadow-sm">
              <span className="text-[14px]">{catMeta.icon}</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                {catMeta.label}
              </span>
              <span className="text-[9px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-md ml-auto">
                {payloads.length}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-1">
              {payloads.map(vuln => {
                const payload = vulnToSelectable(vuln, currentPlaceholders);
                const isSelected = selectedId === payload.id;
                const noiseMeta = NOISE_META[vuln.noise];

                return (
                  <button
                    key={vuln.id}
                    onClick={() => handleClick(vuln)}
                    title={payload.fullContent}
                    className={`w-full text-left px-3 py-2.5 rounded-md border transition-all flex items-start gap-3 ${
                      isSelected
                        ? 'bg-rose-500/10 border-rose-500/30 shadow-sm'
                        : 'border-transparent bg-white dark:bg-[#09090b] hover:border-slate-300 dark:hover:border-slate-800'
                    }`}
                  >
                    <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-bold truncate ${isSelected ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>
                          {vuln.name}
                        </span>
                        <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 border border-current/20 ${noiseMeta.bg} ${noiseMeta.color}`} title={`Ruido: ${noiseMeta.label}`}>
                          {noiseMeta.label}
                        </span>
                      </div>
                      <div className="text-[9px] font-mono text-slate-500 dark:text-slate-500 truncate">
                        {payload.preview}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
