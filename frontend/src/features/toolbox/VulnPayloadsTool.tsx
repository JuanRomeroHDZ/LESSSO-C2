import { useMemo } from 'react';
import {
  VULN_PAYLOADS,
  VULN_CATEGORIES,
  type VulnPayload,
  type VulnCategory,
  type NoiseLevel,
} from '../../core/data/vuln-payloads';
import {
  vulnToSelectable,
  fuzzyMatch,
  NOISE_META,
  type SelectablePayload,
  type ArsenalPlaceholders
} from '../../core/data/arsenal-types';

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
    return { 
      TARGET: placeholders.TARGET, 
      COLLAB: placeholders.COLLAB, 
      PARAM: placeholders.PARAM 
    } as ArsenalPlaceholders;
  }, [placeholders]);

  const filteredPayloads = useMemo(() => {
    let result = VULN_PAYLOADS;

    if (noiseFilter !== 'all') {
      result = result.filter(p => p.noise === noiseFilter);
    }

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
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <span className="text-3xl mb-2 opacity-40">🔍</span>
        <p className="text-[11px] text-slate-500 italic">
          {filterInfo ? `Sin resultados para ${filterInfo}` : 'Sin payloads disponibles'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {CATEGORY_ORDER.map(catKey => {
        const payloads = groupedPayloads[catKey];
        if (!payloads || payloads.length === 0) return null;

        const catMeta = VULN_CATEGORIES[catKey];

        return (
          <div key={catKey} className="mb-2 last:mb-0">
            <div className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900/95 backdrop-blur-sm px-2 py-1 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <span className="text-xs">{catMeta.icon}</span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                {catMeta.label}
              </span>
              <span className="text-[8px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-500 px-1.5 rounded-full">
                {payloads.length}
              </span>
            </div>

            <div className="py-1">
              {payloads.map(vuln => {
                const payload = vulnToSelectable(vuln, currentPlaceholders);
                const isSelected = selectedId === payload.id;
                const noiseMeta = NOISE_META[vuln.noise];

                return (
                  <button
                    key={vuln.id}
                    onClick={() => handleClick(vuln)}
                    title={payload.fullContent}
                    className={`w-full text-left px-3 py-1.5 border-l-2 transition-colors flex items-start gap-2 ${
                      isSelected
                        ? 'bg-red-50 dark:bg-red-900/20 border-red-500'
                        : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold truncate ${
                          isSelected ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-200'
                        }`}>
                          {vuln.name}
                        </span>
                        <span
                          className={`text-[7px] font-bold px-1 py-0.5 rounded shrink-0 ${noiseMeta.bg} ${noiseMeta.color}`}
                          title={`Ruido: ${noiseMeta.label}`}
                        >
                          {noiseMeta.label[0]}
                        </span>
                      </div>
                      <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 truncate">
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
