import { useMemo } from 'react';
import {
  REVERSE_SHELLS,
  renderShell,
  PLATFORM_META,
  type ReverseShell,
} from '../../core/data/reverse-shells';
import type { SelectablePayload } from '../../core/data/arsenal-types';

// ==========================================================
// TIPOS DE PROPS
// ----------------------------------------------------------
// Este componente es PRESENTACIONAL: recibe todo del padre.
// El padre (ArsenalLayout) es quien gestiona búsqueda,
// filtros, selección y el panel de detalle.
// ==========================================================
interface PayloadsToolProps {
  /** Callback cuando el usuario selecciona un payload */
  onSelect: (payload: SelectablePayload) => void;

  /** ID del payload actualmente seleccionado (formato "shell:bash-tcp") */
  selectedId: string | null;

  /** Query de búsqueda (gestionada por el padre) */
  searchQuery: string;

  /** Valores actuales de LHOST/LPORT (vienen del padre) */
  lhost: string;
  lport: string;
}

// ==========================================================
// Mapper: ReverseShell → SelectablePayload
// ==========================================================
function shellToPayload(shell: ReverseShell, lhost: string, lport: string): SelectablePayload {
  const rendered = renderShell(shell, lhost, lport);
  return {
    id: `shell:${shell.id}`,
    sourceId: shell.id,
    category: 'shell',
    subcategory: shell.platform,
    name: shell.name,
    preview: rendered.split('\n')[0].slice(0, 100),
    fullContent: rendered,
    description: shell.description,
    tags: shell.tags,
    platform: shell.platform,
    canSendToListener: shell.type === 'reverse' || shell.type === 'bind',
    canSendToNotes: true,
  };
}

// ==========================================================
// HELPER: fuzzy match para búsqueda
// ----------------------------------------------------------
// Esta función opera sobre ReverseShell (no sobre
// SelectablePayload). Por eso vive localmente aquí.
// ==========================================================
function matchesQuery(shell: ReverseShell, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  const searchable = [shell.name, shell.id, shell.platform, ...(shell.tags || [])]
    .join(' ')
    .toLowerCase();

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
// COMPONENTE
// ==========================================================
export function PayloadsTool({ onSelect, selectedId, searchQuery, lhost, lport }: PayloadsToolProps) {
  // ========================================================
  // Filtrar shells por búsqueda
  // ========================================================
  const filteredShells = useMemo(() => {
    return REVERSE_SHELLS.filter(s => matchesQuery(s, searchQuery));
  }, [searchQuery]);

  // ========================================================
  // Agrupar por plataforma
  // ========================================================
  const groupedShells = useMemo(() => {
    const groups: Record<string, ReverseShell[]> = {};
    filteredShells.forEach(s => {
      const key = s.type === 'msf' ? 'msf' : s.platform;
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });
    return groups;
  }, [filteredShells]);

  // ========================================================
  // Orden de renderizado de grupos
  // ========================================================
  const groupOrder: Array<{ key: string; label: string; icon: string }> = [
    { key: 'linux',   label: 'Linux',      icon: '🐧' },
    { key: 'windows', label: 'Windows',    icon: '🪟' },
    { key: 'macos',   label: 'macOS',      icon: '🍎' },
    { key: 'web',     label: 'Web',        icon: '🌐' },
    { key: 'msf',     label: 'Metasploit', icon: '💥' },
  ];

  // ========================================================
  // Handler: click en un payload
  // ========================================================
  const handleClick = (shell: ReverseShell) => {
    onSelect(shellToPayload(shell, lhost, lport));
  };

  // ========================================================
  // Render
  // ========================================================
  if (filteredShells.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <span className="text-3xl mb-2 opacity-40">🔍</span>
        <p className="text-[11px] text-slate-500 italic">
          {searchQuery ? `Sin resultados para "${searchQuery}"` : 'Sin shells disponibles'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {groupOrder.map(({ key, label, icon }) => {
        const shells = groupedShells[key];
        if (!shells || shells.length === 0) return null;

        return (
          <div key={key} className="mb-2 last:mb-0">
            {/* Cabecera del grupo */}
            <div className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900/95 backdrop-blur-sm px-2 py-1 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <span className="text-xs">{icon}</span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                {label}
              </span>
              <span className="text-[8px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-500 px-1.5 rounded-full">
                {shells.length}
              </span>
            </div>

            {/* Payloads del grupo */}
            <div className="py-1">
              {shells.map(shell => {
                const payload = shellToPayload(shell, lhost, lport);
                const isSelected = selectedId === payload.id;
                const meta = PLATFORM_META[shell.platform];

                return (
                  <button
                    key={shell.id}
                    onClick={() => handleClick(shell)}
                    title={payload.fullContent}
                    className={`w-full text-left px-3 py-1.5 border-l-2 transition-colors flex items-start gap-2 ${
                      isSelected
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500'
                        : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <span className="text-xs shrink-0 mt-0.5">{meta.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold truncate ${
                          isSelected ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'
                        }`}>
                          {shell.name}
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
