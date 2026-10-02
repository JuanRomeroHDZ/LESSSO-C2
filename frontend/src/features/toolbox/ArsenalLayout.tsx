import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useScanStore } from '../../core/store/useScanStore';
import { PayloadsTool } from './PayloadsTool';
import { VulnPayloadsTool } from './VulnPayloadsTool';
import { DecodersTool } from './DecodersTool';
import { ListenerTool } from './ListenerTool';
import { CATEGORY_META, NOISE_META, type SelectablePayload } from '../../core/data/arsenal-types';
import { Terminal, Syringe, Key, Headphones, Search, X, PanelRightClose, PanelRightOpen, Star, Copy, FileText, Router, Code2, ChevronRight, Clock, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';

type ArsenalTab = 'shells' | 'vulns' | 'crypto' | 'listener';

interface TabMeta {
  id: ArsenalTab;
  icon: React.ElementType;
  label: string;
}

const TABS: TabMeta[] = [
  { id: 'shells', icon: Terminal, label: 'Shells' },
  { id: 'vulns', icon: Syringe, label: 'Vulns' },
  { id: 'crypto', icon: Key, label: 'Crypto' },
  { id: 'listener', icon: Headphones, label: 'Listener' },
];

export function ArsenalLayout() {
  const {
    arsenalSelectedId, setArsenalSelected, arsenalPinnedIds, toggleArsenalPin,
    arsenalRecentIds, pushArsenalRecent, arsenalPlaceholders, setArsenalPlaceholder,
    resetArsenalPlaceholders, setRedTeamNotes, redTeamNotes,
  } = useScanStore();

  const [activeTab, setActiveTab] = useState<ArsenalTab>('shells');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDetail, setShowDetail] = useState(true);
  const [copied, setCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [noiseFilter, setNoiseFilter] = useState<'all' | 'stealth' | 'normal' | 'noisy'>('all');
    
  const [detailWidth, setDetailWidth] = useState(400);
  const isResizing = useRef(false);

  const [selectedPayload, setSelectedPayload] = useState<SelectablePayload | null>(null);
  const [injectedPayload, setInjectedPayload] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!arsenalSelectedId) setSelectedPayload(null); }, [arsenalSelectedId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); searchInputRef.current?.focus(); searchInputRef.current?.select();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleSelect = useCallback((payload: SelectablePayload) => {
    setSelectedPayload(payload); setArsenalSelected(payload.id); pushArsenalRecent(payload.id); setShowDetail(true);
  }, [setArsenalSelected, pushArsenalRecent]);

  const handleCopy = useCallback(async () => {
    if (!selectedPayload) return;
    try {
      await navigator.clipboard.writeText(selectedPayload.fullContent);
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    } catch (err) { alert('No se pudo copiar al portapapeles'); }
  }, [selectedPayload]);

  const showToast = (msg: string) => { setToastMessage(msg); setTimeout(() => setToastMessage(null), 3000); };

  const handleSendToNotes = useCallback(() => {
    if (!selectedPayload) return;
    const categoryMeta = CATEGORY_META[selectedPayload.category];
    const title = `${categoryMeta.icon} ${selectedPayload.name} (${selectedPayload.category})`;
    const noiseLine = selectedPayload.noise ? `\n**Nivel de ruido:** ${NOISE_META[selectedPayload.noise].label}` : '';
    const toolLine = selectedPayload.tool ? `\n**Herramienta:** \`${selectedPayload.tool}\`` : '';
    const entry = `\n### ${title}${toolLine}${noiseLine}\n\n\`\`\`bash\n${selectedPayload.fullContent}\n\`\`\`\n`;
    setRedTeamNotes(redTeamNotes + entry); showToast('✅ Añadido a la bitácora!');
  }, [selectedPayload, setRedTeamNotes, redTeamNotes]);

  const handleSendToListener = useCallback(() => {
    if (!selectedPayload || !selectedPayload.canSendToListener) return;
    setInjectedPayload(selectedPayload.fullContent); setActiveTab('listener');
  }, [selectedPayload]);

  const startResizing = useCallback(() => { isResizing.current = true; }, []);
  const stopResizing = useCallback(() => { isResizing.current = false; }, []);
  const resize = useCallback((mouseMoveEvent: MouseEvent) => {
    if (isResizing.current) {
      const newWidth = document.body.clientWidth - mouseMoveEvent.clientX;
      if (newWidth > 250 && newWidth < 800) setDetailWidth(newWidth);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", resize); window.addEventListener("mouseup", stopResizing);
    return () => { window.removeEventListener("mousemove", resize); window.removeEventListener("mouseup", stopResizing); };
  }, [resize, stopResizing]);

  const renderTabContent = () => {
    if (activeTab === 'shells') return <PayloadsTool onSelect={handleSelect} selectedId={arsenalSelectedId} searchQuery={searchQuery} lhost={arsenalPlaceholders.LHOST} lport={arsenalPlaceholders.LPORT} />;
    if (activeTab === 'vulns') return <VulnPayloadsTool onSelect={handleSelect} selectedId={arsenalSelectedId} searchQuery={searchQuery} noiseFilter={noiseFilter} placeholders={{ TARGET: arsenalPlaceholders.TARGET, COLLAB: arsenalPlaceholders.COLLAB, PARAM: arsenalPlaceholders.PARAM }} />;
    if (activeTab === 'crypto') return <DecodersTool />;
    if (activeTab === 'listener') return <ListenerTool placeholders={{ LHOST: arsenalPlaceholders.LHOST, LPORT: arsenalPlaceholders.LPORT }} injectedPayload={injectedPayload} onInjectionConsumed={() => setInjectedPayload(null)} />;
    return null;
  };

  const recentPayloadsInfo = useMemo(() => arsenalRecentIds.slice(0, 5), [arsenalRecentIds]);
  const pinnedCount = arsenalPinnedIds.length;

  return (
    <div className="flex flex-1 overflow-hidden bg-slate-50 dark:bg-[#020617] relative">
       
      {toastMessage && (
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-50 bg-teal-500/10 border border-teal-500/30 text-teal-600 dark:text-teal-400 px-6 py-2 rounded-full shadow-lg font-bold text-[10px] tracking-wider uppercase animate-in fade-in slide-in-from-top-4 backdrop-blur-sm">
          {toastMessage}
        </div>
      )}

      {/* Sidebar Tabs */}
      <aside className="w-[60px] shrink-0 bg-white dark:bg-[#0b1120] border-r border-slate-200 dark:border-slate-800 flex flex-col items-center py-4 gap-2 z-10 shadow-sm">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                isActive
                  ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-600 dark:hover:text-slate-300'
              )}
            >
              <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
            </button>
          );
        })}

        <div className="flex-1" />
        <button
          onClick={() => setShowDetail(v => !v)}
          title={showDetail ? 'Ocultar panel' : 'Mostrar panel'}
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-all text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50"
        >
          {showDetail ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
        </button>
      </aside>

      {/* Main List */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-[#020617]">
        {activeTab !== 'crypto' && activeTab !== 'listener' && (
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1120] flex items-center gap-3 shrink-0 shadow-sm z-10">
            <div className="flex-1 relative flex items-center">
              <Search size={14} className="absolute left-3 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar payloads... (Ctrl+K)"
                className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono dark:text-white outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all shadow-sm"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                  <X size={14} />
                </button>
              )}
            </div>

            {activeTab === 'vulns' && (
              <select
                value={noiseFilter}
                onChange={e => setNoiseFilter(e.target.value as any)}
                className="px-3 py-2 bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold uppercase tracking-wider dark:text-slate-300 outline-none focus:border-teal-500 cursor-pointer shadow-sm"
              >
                <option value="all">🎯 Todo</option>
                <option value="stealth">🟢 Sigiloso</option>
                <option value="normal">🟡 Normal</option>
                <option value="noisy">🔴 Ruidoso</option>
              </select>
            )}

            <div className="flex flex-col text-right">
              {pinnedCount > 0 && <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest flex items-center gap-1 justify-end"><Star size={10} className="fill-current"/> {pinnedCount} Pines</span>}
              {recentPayloadsInfo.length > 0 && <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1 justify-end">🕑 {recentPayloadsInfo.length} Recientes</span>}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {renderTabContent()}
        </div>
      </div>

      {/* Detail Panel */}
      {showDetail && (
        <>
          <div className="w-1 cursor-col-resize hover:bg-teal-500 bg-slate-200 dark:bg-slate-800 z-20 transition-colors border-x border-transparent bg-clip-padding" onMouseDown={startResizing} />
          <div style={{ width: `${detailWidth}px` }} className="shrink-0 bg-white dark:bg-[#0b1120] flex flex-col overflow-hidden border-l border-slate-200 dark:border-slate-800">
            {selectedPayload ? (
              <>
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#020617] shrink-0">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-xl">{CATEGORY_META[selectedPayload.category].icon}</span>
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded-md">
                          {CATEGORY_META[selectedPayload.category].label}
                        </span>
                      </div>
                      <h3 className="text-sm font-black text-slate-900 dark:text-white truncate tracking-widest">
                        {selectedPayload.name}
                      </h3>
                       
                      <div className="flex items-center gap-1 mt-2 flex-wrap">
                        {selectedPayload.noise && (
                          <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider border", NOISE_META[selectedPayload.noise].bg, NOISE_META[selectedPayload.noise].color, "border-current/20")}>
                            {NOISE_META[selectedPayload.noise].label}
                          </span>
                        )}
                        {selectedPayload.tool && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono border border-slate-300 dark:border-slate-700">
                            {selectedPayload.tool}
                          </span>
                        )}
                        {selectedPayload.tags?.slice(0, 3).map(tag => (
                          <span key={tag} className="text-[9px] text-slate-400 font-mono bg-slate-100 dark:bg-[#020617] border border-slate-200 dark:border-slate-800 px-1.5 py-0.5 rounded-md">#{tag}</span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => toggleArsenalPin(selectedPayload.id)}
                      title={arsenalPinnedIds.includes(selectedPayload.id) ? 'Quitar pin' : 'Fijar'}
                      className={cn(
                        "shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors border shadow-sm outline-none",
                        arsenalPinnedIds.includes(selectedPayload.id)
                          ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                          : 'bg-white dark:bg-slate-900 text-slate-400 border-slate-200 dark:border-slate-800 hover:text-amber-500 hover:border-amber-500/30'
                      )}
                    >
                      <Star size={14} className={arsenalPinnedIds.includes(selectedPayload.id) ? "fill-current" : ""} />
                    </button>
                  </div>

                  {selectedPayload.description && (
                    <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 leading-relaxed bg-white dark:bg-[#0b1120] p-3 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
                      {selectedPayload.description}
                    </p>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest block flex items-center gap-1.5"><Code2 size={12}/> Código Resultante</label>
                    <pre className="text-[11px] font-mono text-slate-800 dark:text-teal-400 bg-slate-100 dark:bg-black border border-slate-200 dark:border-slate-800 rounded-lg p-3 whitespace-pre-wrap break-all leading-relaxed max-h-64 overflow-y-auto custom-scrollbar shadow-inner">
                      {selectedPayload.fullContent}
                    </pre>
                  </div>

                  <details className="group" open>
                    <summary className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest cursor-pointer hover:text-teal-500 dark:hover:text-teal-400 transition-colors flex items-center gap-1.5 select-none mb-3">
                      <ChevronRight size={14} className="transition-transform group-open:rotate-90" />
                      Inyección de Variables
                    </summary>
                    <div className="grid grid-cols-2 gap-2 mt-2 animate-in fade-in pl-1">
                      <PlaceholderField label="LHOST" value={arsenalPlaceholders.LHOST} onChange={v => setArsenalPlaceholder('LHOST', v)} />
                      <PlaceholderField label="LPORT" value={arsenalPlaceholders.LPORT} onChange={v => setArsenalPlaceholder('LPORT', v)} />
                      <PlaceholderField label="TARGET" value={arsenalPlaceholders.TARGET} onChange={v => setArsenalPlaceholder('TARGET', v)} />
                      <PlaceholderField label="USER" value={arsenalPlaceholders.USER} onChange={v => setArsenalPlaceholder('USER', v)} />
                      <PlaceholderField label="PASS" value={arsenalPlaceholders.PASS} onChange={v => setArsenalPlaceholder('PASS', v)} />
                      <PlaceholderField label="HASH" value={arsenalPlaceholders.HASH} onChange={v => setArsenalPlaceholder('HASH', v)} />
                      <PlaceholderField label="DOMAIN" value={arsenalPlaceholders.DOMAIN} onChange={v => setArsenalPlaceholder('DOMAIN', v)} />
                      <PlaceholderField label="COLLAB" value={arsenalPlaceholders.COLLAB} onChange={v => setArsenalPlaceholder('COLLAB', v)} />
                      <button onClick={resetArsenalPlaceholders} className="col-span-2 text-[9px] font-bold uppercase tracking-widest text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 border border-slate-200 dark:border-slate-800 hover:border-rose-500/20 rounded-md transition-all py-2 mt-1 bg-slate-50 dark:bg-[#020617] shadow-sm">
                        ↺ Resetear Valores
                      </button>
                    </div>
                  </details>

                  {recentPayloadsInfo.length > 0 && (
                    <div className="border-t border-slate-200 dark:border-slate-800 pt-5">
                      <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest block mb-2 flex items-center gap-1.5"><Clock size={12}/> Recientes</label>
                      <div className="flex flex-wrap gap-1.5">
                        {recentPayloadsInfo.map(id => (
                          <span key={id} className="text-[9px] font-mono font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 px-2 py-1 rounded-md truncate max-w-[140px]" title={id}>
                            {id.replace(/^[^:]+:/, '')}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="border-t border-slate-200 dark:border-slate-800 p-4 space-y-2 shrink-0 bg-slate-50 dark:bg-[#020617]">
                  <button onClick={handleCopy} className={cn("w-full text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 shadow-md outline-none", copied ? 'bg-teal-500 text-white' : 'bg-teal-600 text-white hover:bg-teal-500')}>
                    {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                    {copied ? 'Copiado!' : 'Copiar Payload'}
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={handleSendToNotes} className="w-full text-[9px] font-bold uppercase tracking-widest px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-1.5 shadow-sm outline-none">
                      <FileText size={12} /> A Bitácora
                    </button>

                    {selectedPayload.canSendToListener ? (
                      <button onClick={handleSendToListener} className="w-full text-[9px] font-bold uppercase tracking-widest px-3 py-2 rounded-lg bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-colors flex items-center justify-center gap-1.5 shadow-sm outline-none">
                        <Router size={12} /> A Listener
                      </button>
                    ) : (
                      <div className="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center opacity-50 shadow-sm cursor-not-allowed">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5"><Router size={12} /> No Ruteable</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[#0b1120]">
                <div className="w-20 h-20 bg-slate-800/50 rounded-full flex items-center justify-center mb-6 border border-slate-800">
                  <Code2 size={32} className="text-slate-600" />
                </div>
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-300 mb-2">Sin selección</h3>
                <p className="text-[11px] font-medium text-slate-500 max-w-[220px] leading-relaxed">Selecciona un payload de la lista para ver su código, inyectar variables y enviarlo al listener.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PlaceholderField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void; }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest pl-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-2.5 py-1.5 bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-md text-[11px] font-mono dark:text-teal-400 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all shadow-sm"
      />
    </div>
  );
}
