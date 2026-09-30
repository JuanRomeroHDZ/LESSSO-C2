import { useMemo } from 'react';
import {
  VULN_PAYLOADS,
  VULN_CATEGORIES,
  renderVulnPayload,
  type VulnPayload,
  type VulnCategory,
  type NoiseLevel,
} from '../../core/data/vuln-payloads';
import type { SelectablePayload } from '../../core/data/arsenal-types';

// ==========================================================
// TIPOS DE PROPS
// ----------------------------------------------------------
// Este componente es PRESENTACIONAL: recibe todo del padre.
// El padre (ArsenalLayout) es quien gestiona búsqueda,
// filtros, selección y el panel de detalle.
// ==========================================================
interface VulnPayloadsToolProps {
  /** Callback cuando el usuario selecciona un payload */
  onSelect: (payload: SelectablePayload) => void;

  /** ID del payload actualmente seleccionado (formato "vuln:sqli-auth-bypass") */
  selectedId: string | null;

  /** Query de búsqueda (gestionada por el padre) */
  searchQuery: string;

  /** Filtro por nivel de ruido (gestionado por el padre) */
  noiseFilter: NoiseLevel | 'all';

  /** Placeholders para renderizado */
  placeholders: {
    TARGET: string;
    COLLAB: string;
    PARAM: string;
  };
}

// ==========================================================
// Metadata visual por nivel de ruido
// ==========================================================
const NOISE_META: Record<NoiseLevel, { label: string; color: string; bg: string }> = {
  stealth: { label: 'Sigiloso', color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  normal:  { label: 'Normal',   color: 'text-yellow-500',  bg: 'bg-yellow-100 dark:bg-yellow-900/30' },
  noisy:   { label: 'Ruidoso',  color: 'text-red-500',     bg: 'bg-red-100 dark:bg-red-900/30' },
};

// ==========================================================
// Mapper: VulnPayload → SelectablePayload
// ==========================================================
function vulnToPayload(
  vuln: VulnPayload,
  placeholders: { TARGET: string; COLLAB: string; PARAM: string }
): SelectablePayload {
  const rendered = renderVulnPayload(vuln, {
    TARGET: placeholders.TARGET,
    COLLAB: placeholders.COLLAB,
    PARAM: placeholders.PARAM,
  });

  return {
    id: `vuln:${vuln.id}`,
    sourceId: vuln.id,
    category: 'vuln',
    subcategory: vuln.category,
    name: vuln.name,
    preview: rendered.split('\n')[0].slice(0, 100),
    fullContent: rendered,
    description: vuln.description,
    tags: vuln.tags,
    noise: vuln.noise,
    canSendToListener: false, // Las vulns no se envían a listener
    canSendToNotes: true,
  };
}

// ==========================================================
// HELPER: fuzzy match sobre VulnPayload
// ==========================================================
function matchesQuery(vuln: VulnPayload, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  const searchable = [
    vuln.name,
    vuln.id,
    vuln.category,
    vuln.payload,
    ...(vuln.tags || []),
    vuln.description || '',
  ].join(' ').toLowerCase();

  // 1. Match directo
  if (searchable.includes(q)) return true;

  // 2. Fuzzy: cada carácter del query aparece en orden
  let qIdx = 0;
  for (let i = 0; i < searchable.length && qIdx < q.length; i++) {
    if (searchable[i] === q[qIdx]) qIdx++;
  }
  return qIdx === q.length;
}

// ==========================================================
// ORDEN DE CATEGORÍAS PARA RENDERIZADO
// ==========================================================
const CATEGORY_ORDER: VulnCategory[] = [
  'sqli',
  'xss',
  'lfi',
  'rfi',
  'ssti',
  'xxe',
  'ssrf',
  'cmdi',
  'nosqli',
  'ldapi',
  'crlf',
  'openredirect',
  'prototype',
  'deserialization',
];

// ==========================================================
// COMPONENTE
// ==========================================================
export function VulnPayloadsTool({
  onSelect,
  selectedId,
  searchQuery,
  noiseFilter,
  placeholders,
}: VulnPayloadsToolProps) {
  // ========================================================
  // Filtrar payloads por búsqueda + nivel de ruido
  // ========================================================
  const filteredPayloads = useMemo(() => {
    let result = VULN_PAYLOADS;

    // Filtro por nivel de ruido
    if (noiseFilter !== 'all') {
      result = result.filter(p => p.noise === noiseFilter);
    }

    // Filtro por búsqueda
    if (searchQuery.trim()) {
      result = result.filter(p => matchesQuery(p, searchQuery));
    }

    return result;
  }, [searchQuery, noiseFilter]);

  // ========================================================
  // Agrupar por categoría
  // ========================================================
  const groupedPayloads = useMemo(() => {
    const groups: Record<string, VulnPayload[]> = {};
    filteredPayloads.forEach(p => {
      if (!groups[p.category]) groups[p.category] = [];
      groups[p.category].push(p);
    });
    return groups;
  }, [filteredPayloads]);

  // ========================================================
  // Handler: click en un payload
  // ========================================================
  const handleClick = (vuln: VulnPayload) => {
    onSelect(vulnToPayload(vuln, placeholders));
  };

  // ========================================================
  // Render: empty state con contexto del filtro activo
  // ========================================================
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
            {/* Cabecera del grupo */}
            <div className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900/95 backdrop-blur-sm px-2 py-1 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <span className="text-xs">{catMeta.icon}</span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                {catMeta.label}
              </span>
              <span className="text-[8px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-500 px-1.5 rounded-full">
                {payloads.length}
              </span>
            </div>

            {/* Payloads del grupo */}
            <div className="py-1">
              {payloads.map(vuln => {
                const payload = vulnToPayload(vuln, placeholders);
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
