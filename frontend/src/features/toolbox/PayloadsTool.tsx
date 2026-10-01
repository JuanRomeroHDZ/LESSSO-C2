import { useMemo } from 'react';
import { REVERSE_SHELLS, type ReverseShell } from '../../core/data/reverse-shells';
import { shellToSelectable, fuzzyMatch, type SelectablePayload, type ArsenalPlaceholders } from '../../core/data/arsenal-types';
import { Terminal, Monitor, Apple, Globe, Flame, Search } from 'lucide-react';

interface PayloadsToolProps {
  onSelect: (payload: SelectablePayload) => void;
  selectedId: string | null;
  searchQuery: string;
  lhost: string;
  lport: string;
}

export function PayloadsTool({ onSelect, selectedId, searchQuery, lhost, lport }: PayloadsToolProps) {
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

  const groupOrder: Array<{ key: string; label: string; icon: React.ElementType }> = [
    { key: 'linux',   label: 'Linux',      icon: Terminal },
    { key: 'windows', label: 'Windows',    icon: Monitor },
    { key: 'macos',   label: 'macOS',      icon: Apple },
    { key: 'web',     label: 'Web',        icon: Globe },
    { key: 'msf',     label: 'Metasploit', icon: Flame },
  ];

  const handleClick = (shell: ReverseShell) => {
    onSelect(shellToSelectable(shell, currentPlaceholders));
  };

  if (filteredShells.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-[#09090b]">
        <Search size={32} className="mb-4 text-slate-600" />
        <p className="text-[11px] font-mono text-slate-500">
          {searchQuery ? `Sin resultados para "${searchQuery}"` : 'Sin shells disponibles'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-2 gap-3">
      {groupOrder.map(({ key, label, icon: Icon }) => {
        const shells = groupedShells[key];
        if (!shells || shells.length === 0) return null;

        return (
          <div key={key} className="flex flex-col gap-1.5">
            <div className="sticky top-0 z-10 bg-slate-50/95 dark:bg-[#020617]/95 backdrop-blur-md px-3 py-2 border border-slate-200 dark:border-slate-800/80 rounded-md flex items-center gap-2 shadow-sm">
              <Icon size={14} className="text-teal-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                {label}
              </span>
              <span className="text-[9px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-md ml-auto">
                {shells.length}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-1">
              {shells.map(shell => {
                const payload = shellToSelectable(shell, currentPlaceholders);
                const isSelected = selectedId === payload.id;
                
                return (
                  <button
                    key={shell.id}
                    onClick={() => handleClick(shell)}
                    title={payload.fullContent}
                    className={`w-full text-left px-3 py-2.5 rounded-md border transition-all flex items-start gap-3 ${
                      isSelected
                        ? 'bg-teal-500/10 border-teal-500/30 shadow-sm'
                        : 'border-transparent bg-white dark:bg-[#09090b] hover:border-slate-300 dark:hover:border-slate-800'
                    }`}
                  >
                    <div className="min-w-0 flex-1 flex flex-col gap-1">
                      <span className={`text-[11px] font-bold truncate ${
                        isSelected ? 'text-teal-600 dark:text-teal-400' : 'text-slate-700 dark:text-slate-300'
                      }`}>
                        {shell.name}
                      </span>
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
