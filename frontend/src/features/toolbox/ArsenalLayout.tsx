import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useScanStore } from '../../core/store/useScanStore';
import { PayloadsTool } from './PayloadsTool';
import { VulnPayloadsTool } from './VulnPayloadsTool';
import { DecodersTool } from './DecodersTool';
import { ListenerTool } from './ListenerTool';
import {
  CATEGORY_META,
  NOISE_META,
  type SelectablePayload,
} from '../../core/data/arsenal-types';

type ArsenalTab = 'shells' | 'vulns' | 'crypto' | 'listener';

interface TabMeta {
  id: ArsenalTab;
  icon: string;
  label: string;
  color: string;
}

const TABS: TabMeta[] = [
  { id: 'shells',   icon: '🐚', label: 'Shells',   color: 'emerald' },
  { id: 'vulns',    icon: '💉', label: 'Vulns',    color: 'red' },
  { id: 'crypto',   icon: '🔐', label: 'Crypto',   color: 'fuchsia' },
  { id: 'listener', icon: '🎧', label: 'Listener', color: 'purple' },
];

export function ArsenalLayout() {
  const {
    arsenalSelectedId,
    setArsenalSelected,
    arsenalPinnedIds,
    toggleArsenalPin,
    arsenalRecentIds,
    pushArsenalRecent,
    arsenalPlaceholders,
    setArsenalPlaceholder,
    resetArsenalPlaceholders,
    setRedTeamNotes,
    redTeamNotes,
  } = useScanStore();

  const [activeTab, setActiveTab] = useState<ArsenalTab>('shells');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDetail, setShowDetail] = useState(true);
  const [copied, setCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [noiseFilter, setNoiseFilter] = useState<'all' | 'stealth' | 'normal' | 'noisy'>('all');
  
  // FIX M1: Panel redimensionable
  const [detailWidth, setDetailWidth] = useState(360);
  const isResizing = useRef(false);

  const [selectedPayload, setSelectedPayload] = useState<SelectablePayload | null>(null);
  const [injectedPayload, setInjectedPayload] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!arsenalSelectedId) setSelectedPayload(null);
  }, [arsenalSelectedId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleSelect = useCallback((payload: SelectablePayload) => {
    setSelectedPayload(payload);
    setArsenalSelected(payload.id);
    pushArsenalRecent(payload.id);
    setShowDetail(true);
  }, [setArsenalSelected, pushArsenalRecent]);

  const handleCopy = useCallback(async () => {
    if (!selectedPayload) return;
    try {
      await navigator.clipboard.writeText(selectedPayload.fullContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Error copiando:', err);
      alert('No se pudo copiar al portapapeles');
    }
  }, [selectedPayload]);

  // FIX M2: Auto-scroll y Toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSendToNotes = useCallback(() => {
    if (!selectedPayload) return;

    const categoryMeta = CATEGORY_META[selectedPayload.category];
    const title = `${categoryMeta.icon} ${selectedPayload.name} (${selectedPayload.category})`;
    const noiseLine = selectedPayload.noise ? `\n**Nivel de ruido:** ${NOISE_META[selectedPayload.noise].label}` : '';
    const toolLine = selectedPayload.tool ? `\n**Herramienta:** \`${selectedPayload.tool}\`` : '';

    const entry = `\n### ${title}${toolLine}${noiseLine}\n\n\`\`\`bash\n${selectedPayload.fullContent}\n\`\`\`\n`;

    setRedTeamNotes(redTeamNotes + entry);
    showToast('✅ Añadido a la bitácora!');
  }, [selectedPayload, setRedTeamNotes, redTeamNotes]);

  const handleSendToListener = useCallback(() => {
    if (!selectedPayload || !selectedPayload.canSendToListener) return;
    setInjectedPayload(selectedPayload.fullContent);
    setActiveTab('listener');
  }, [selectedPayload]);

  // Funciones para el Resizer (M1)
  const startResizing = useCallback(() => {
    isResizing.current = true;
  }, []);

  const stopResizing = useCallback(() => {
    isResizing.current = false;
  }, []);

  const resize = useCallback((mouseMoveEvent: MouseEvent) => {
    if (isResizing.current) {
      // Calculamos el ancho desde la derecha
      const newWidth = document.body.clientWidth - mouseMoveEvent.clientX;
      if (newWidth > 250 && newWidth < 800) {
        setDetailWidth(newWidth);
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  const renderTabContent = () => {
    if (activeTab === 'shells') {
      return (
        <PayloadsTool
          onSelect={handleSelect}
          selectedId={arsenalSelectedId}
          searchQuery={searchQuery}
          lhost={arsenalPlaceholders.LHOST}
          lport={arsenalPlaceholders.LPORT}
        />
      );
    }
    if (activeTab === 'vulns') {
      return (
        <VulnPayloadsTool
          onSelect={handleSelect}
          selectedId={arsenalSelectedId}
          searchQuery={searchQuery}
          noiseFilter={noiseFilter}
          placeholders={{
            TARGET: arsenalPlaceholders.TARGET,
            COLLAB: arsenalPlaceholders.COLLAB,
            PARAM: arsenalPlaceholders.PARAM,
          }}
        />
      );
    }
    if (activeTab === 'crypto') {
      return <DecodersTool />;
    }
    if (activeTab === 'listener') {
      return (
        <ListenerTool
          placeholders={{
            LHOST: arsenalPlaceholders.LHOST,
            LPORT: arsenalPlaceholders.LPORT,
          }}
          injectedPayload={injectedPayload}
          onInjectionConsumed={() => setInjectedPayload(null)}
        />
      );
    }
    return null;
  };

  const recentPayloadsInfo = useMemo(() => {
    return arsenalRecentIds.slice(0, 5);
  }, [arsenalRecentIds]);

  const pinnedCount = arsenalPinnedIds.length;

  return (
    <div className="flex flex-1 overflow-hidden bg-slate-50 dark:bg-slate-950 relative">
      
      {/* Toast Notification (M2) */}
      {toastMessage && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-emerald-100 dark:bg-emerald-900/80 text-emerald-800 dark:text-emerald-200 px-4 py-2 rounded shadow-lg font-bold text-xs animate-in fade-in slide-in-from-top-4">
          {toastMessage}
        </div>
      )}

      {/* Columna 1: Tabs verticales */}
      <aside className="w-20 shrink-0 bg-slate-100 dark:bg-slate-900/50 border-r border-slate-200 dark:border-slate-800 flex flex-col items-center py-3 gap-2">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
              className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center transition-all ${
                isActive
                  ? 'bg-[#0b282c] text-white shadow-lg shadow-[#0b282c]/30'
                  : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <span className="text-xl">{tab.icon}</span>
              <span className="text-[7px] font-bold uppercase mt-0.5">{tab.label}</span>
            </button>
          );
        })}

        <div className="flex-1" />
        <button
          onClick={() => setShowDetail(v => !v)}
          title={showDetail ? 'Ocultar panel de detalle' : 'Mostrar panel de detalle'}
          className="w-14 h-14 rounded-xl flex items-center justify-center transition-all text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
        >
          <span className="text-xl">{showDetail ? '→' : '←'}</span>
        </button>
      </aside>

      {/* Columna 2: Lista + búsqueda */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-slate-950">
        {activeTab !== 'crypto' && activeTab !== 'listener' && (
          <div className="p-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center gap-2 shrink-0">
            <div className="flex-1 relative">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="🔍 Buscar payloads... (Ctrl+K)"
                className="w-full px-3 py-1.5 pl-8 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-[11px] dark:text-white outline-none focus:border-emerald-500"
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {activeTab === 'vulns' && (
              <select
                value={noiseFilter}
                onChange={e => setNoiseFilter(e.target.value as any)}
                className="px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-bold dark:text-white outline-none"
              >
                <option value="all">🎯 Todo ruido</option>
                <option value="stealth">🟢 Sigiloso</option>
                <option value="normal">🟡 Normal</option>
                <option value="noisy">🔴 Ruidoso</option>
              </select>
            )}

            <span className="text-[9px] font-bold text-slate-500 whitespace-nowrap">
              {pinnedCount > 0 && `📌 ${pinnedCount} · `}
              {recentPayloadsInfo.length > 0 && `🕐 ${recentPayloadsInfo.length}`}
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {renderTabContent()}
        </div>
      </div>

      {/* Columna 3: Panel de detalle (Resizable M1) */}
      {showDetail && (
        <>
          {/* Handle de redimensionamiento */}
          <div 
            className="w-1 cursor-col-resize hover:bg-teal-500/50 bg-slate-200 dark:bg-slate-800 z-10 transition-colors"
            onMouseDown={startResizing}
          />
          <div 
            style={{ width: `${detailWidth}px` }} 
            className="shrink-0 bg-white dark:bg-slate-900 flex flex-col overflow-hidden"
          >
            {selectedPayload ? (
              <>
                <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 shrink-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">
                          {CATEGORY_META[selectedPayload.category].icon}
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                          {CATEGORY_META[selectedPayload.category].label}
                        </span>
                      </div>
                      <h3 className="text-[12px] font-black text-slate-800 dark:text-white truncate">
                        {selectedPayload.name}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {selectedPayload.noise && (
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${NOISE_META[selectedPayload.noise].bg} ${NOISE_META[selectedPayload.noise].color}`}>
                            {NOISE_META[selectedPayload.noise].label}
                          </span>
                        )}
                        {selectedPayload.tool && (
                          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
                            {selectedPayload.tool}
                          </span>
                        )}
                        {selectedPayload.tags?.slice(0, 3).map(tag => (
                          <span key={tag} className="text-[8px] text-slate-400">#{tag}</span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => toggleArsenalPin(selectedPayload.id)}
                      title={arsenalPinnedIds.includes(selectedPayload.id) ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                      className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                        arsenalPinnedIds.includes(selectedPayload.id)
                          ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-500'
                          : 'text-slate-300 hover:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
                      }`}
                    >
                      ★
                    </button>
                  </div>

                  {selectedPayload.description && (
                    <p className="text-[10px] text-slate-500 italic leading-snug">
                      {selectedPayload.description}
                    </p>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
                  <div>
                    <label className="text-[9px] font-bold uppercase text-slate-500 tracking-widest block mb-1.5">
                      Contenido
                    </label>
                    <pre className="text-[10px] font-mono text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded p-2.5 whitespace-pre-wrap break-all leading-relaxed max-h-64 overflow-y-auto custom-scrollbar">
                      {selectedPayload.fullContent}
                    </pre>
                  </div>

                  {selectedPayload.category !== 'vuln' || selectedPayload.category === 'vuln' ? (
                    <details className="group">
                      <summary className="text-[9px] font-bold uppercase text-slate-500 tracking-widest cursor-pointer hover:text-emerald-500 transition-colors flex items-center gap-1">
                        <span className="transition-transform group-open:rotate-90">▶</span>
                        Placeholders
                      </summary>
                      <div className="grid grid-cols-2 gap-1.5 mt-2 animate-in fade-in">
                        <PlaceholderField
                          label="LHOST"
                          value={arsenalPlaceholders.LHOST}
                          onChange={v => setArsenalPlaceholder('LHOST', v)}
                        />
                        <PlaceholderField
                          label="LPORT"
                          value={arsenalPlaceholders.LPORT}
                          onChange={v => setArsenalPlaceholder('LPORT', v)}
                        />
                        <PlaceholderField
                          label="TARGET"
                          value={arsenalPlaceholders.TARGET}
                          onChange={v => setArsenalPlaceholder('TARGET', v)}
                        />
                        <PlaceholderField
                          label="USER"
                          value={arsenalPlaceholders.USER}
                          onChange={v => setArsenalPlaceholder('USER', v)}
                        />
                        <PlaceholderField
                          label="PASS"
                          value={arsenalPlaceholders.PASS}
                          onChange={v => setArsenalPlaceholder('PASS', v)}
                        />
                        <PlaceholderField
                          label="HASH"
                          value={arsenalPlaceholders.HASH}
                          onChange={v => setArsenalPlaceholder('HASH', v)}
                        />
                        <PlaceholderField
                          label="DOMAIN"
                          value={arsenalPlaceholders.DOMAIN}
                          onChange={v => setArsenalPlaceholder('DOMAIN', v)}
                        />
                        <PlaceholderField
                          label="COLLAB"
                          value={arsenalPlaceholders.COLLAB}
                          onChange={v => setArsenalPlaceholder('COLLAB', v)}
                        />
                        <PlaceholderField
                          label="PORT"
                          value={arsenalPlaceholders.PORT}
                          onChange={v => setArsenalPlaceholder('PORT', v)}
                        />
                        <button
                          onClick={resetArsenalPlaceholders}
                          className="col-span-2 text-[9px] font-bold uppercase text-slate-500 hover:text-red-500 transition-colors py-1"
                        >
                          ↺ Reset placeholders
                        </button>
                      </div>
                    </details>
                  ) : null}

                  <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2">
                    <div>
                      <label className="text-[9px] font-bold uppercase text-slate-500 tracking-widest block mb-1">
                        🕐 Recientes
                      </label>
                      {recentPayloadsInfo.length === 0 ? (
                        <p className="text-[10px] text-slate-400 italic">Sin payloads recientes</p>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {recentPayloadsInfo.map(id => (
                            <span
                              key={id}
                              className="text-[8px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded truncate max-w-[140px]"
                              title={id}
                            >
                              {id.replace(/^[^:]+:/, '')}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200 dark:border-slate-800 p-2 space-y-1.5 shrink-0 bg-slate-50 dark:bg-slate-950">
                  <button
                    onClick={handleCopy}
                    className={`w-full text-[10px] font-bold uppercase px-3 py-2 rounded transition-colors ${
                      copied
                        ? 'bg-emerald-500 text-white'
                        : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50'
                    }`}
                  >
                    {copied ? '✓ Copiado' : '📋 Copiar al portapapeles'}
                  </button>

                  <button
                    onClick={handleSendToNotes}
                    className="w-full text-[10px] font-bold uppercase px-3 py-2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    📝 Enviar a Bitácora
                  </button>

                  {selectedPayload.canSendToListener && (
                    <button
                      onClick={handleSendToListener}
                      className="w-full text-[10px] font-bold uppercase px-3 py-2 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                    >
                      🎧 Enviar a Listener
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                <span className="text-5xl mb-4 opacity-30">📌</span>
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Sin selección
                </h3>
                <p className="text-[10px] text-slate-500 max-w-xs">
                  Selecciona un payload de la lista para ver su contenido completo, copiarlo, enviarlo a la bitácora o inyectarlo en un listener.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PlaceholderField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[8px] font-bold text-slate-500 uppercase block mb-0.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-1.5 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-mono dark:text-white outline-none focus:border-emerald-500"
      />
    </div>
  );
}
