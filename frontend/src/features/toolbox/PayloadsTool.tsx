import { useMemo } from 'react';
import {
  REVERSE_SHELLS,
  PLATFORM_META,
  type ReverseShell,
} from '../../core/data/reverse-shells';
import {
  shellToSelectable,
  fuzzyMatch,
  type SelectablePayload,
  type ArsenalPlaceholders
} from '../../core/data/arsenal-types';

interface PayloadsToolProps {
  onSelect: (payload: SelectablePayload) => void;
  selectedId: string | null;
  searchQuery: string;
  lhost: string;
  lport: string;
}

export function PayloadsTool({ onSelect, selectedId, searchQuery, lhost, lport }: PayloadsToolProps) {
  // Construimos el objeto parcial de placeholders para el mapper unificado
  const currentPlaceholders = useMemo(() => {
    return { LHOST: lhost, LPORT: lport } as ArsenalPlaceholders;
  }, [lhost, lport]);

  const filteredShells = useMemo(() => {
    if (!searchQuery.trim()) return REVERSE_SHELLS;
    return REVERSE_SHELLS.filter(s => {
      const selectable = shellToSelectable(s, currentPlaceholders);
      return fuzzyMatch(searchQuery, selectable);
    });
  }, [searchQuery, currentPlaceholders]);

  const groupedShells = useMemo(() => {
    const groups: Record<string, ReverseShell[]> = {};
    filteredShells.forEach(s => {
      const key = s.type === 'msf' ? 'msf' : s.platform;
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });
    return groups;
  }, [filteredShells]);

  const groupOrder: Array<{ key: string; label: string; icon: string }> = [
    { key: 'linux',   label: 'Linux',      icon: '🐧' },
    { key: 'windows', label: 'Windows',    icon: '🪟' },
    { key: 'macos',   label: 'macOS',      icon: '🍎' },
    { key: 'web',     label: 'Web',        icon: '🌐' },
    { key: 'msf',     label: 'Metasploit', icon: '💥' },
  ];

  const handleClick = (shell: ReverseShell) => {
    onSelect(shellToSelectable(shell, currentPlaceholders));
  };

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
            <div className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900/95 backdrop-blur-sm px-2 py-1 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <span className="text-xs">{icon}</span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                {label}
              </span>
              <span className="text-[8px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-500 px-1.5 rounded-full">
                {shells.length}
              </span>
            </div>

            <div className="py-1">
              {shells.map(shell => {
                const payload = shellToSelectable(shell, currentPlaceholders);
                const isSelected = selectedId === payload.id;
                // Forzamos el tipado para evitar el error de ts con 'msf' en PLATFORM_META
                const platformKey = shell.type === 'msf' ? 'msf' : shell.platform;
                const meta = PLATFORM_META[platformKey as keyof typeof PLATFORM_META];

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
