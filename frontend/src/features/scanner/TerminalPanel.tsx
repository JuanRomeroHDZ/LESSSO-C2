import { useEffect, useRef, useState, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useScanStore } from '../../core/store/useScanStore';
import { Copy, Download, Trash2, Search, TerminalSquare } from 'lucide-react';
import { BashTerminal, TabErrorBoundary } from './components/BashTerminal';

const MAX_BASH_TABS = 5;
const SESSION_PREFIX = 'lessso-bash-';
let sessionCounter = 0;

function newSessionId(): string {
  sessionCounter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${SESSION_PREFIX}${Date.now()}-${sessionCounter}-${rand}`;
}

const ColorizeLine = ({ line }: { line: string }) => {
  // eslint-disable-next-line no-control-regex
  const cleanLine = line.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').trim();
  if (!cleanLine || cleanLine.startsWith('Stats:') || cleanLine.includes('.~-') || cleanLine.includes('| {}') || cleanLine.includes('`-\'')) return null;
  if (cleanLine.includes('Discovered open port')) return <span className="text-teal-400 font-semibold">{cleanLine}</span>;
  if (cleanLine.startsWith('Initiating') || cleanLine.startsWith('Completed') || cleanLine.includes('Open')) return <span className="text-indigo-400 italic">{cleanLine}</span>;
  if (cleanLine.startsWith('NSE:')) return <span className="text-fuchsia-400">{cleanLine}</span>;
  if (cleanLine.includes('[ERR]') || cleanLine.includes('ERROR:')) return <span className="text-rose-500 font-bold">{cleanLine}</span>;
  if (cleanLine.includes('[WARN]') || cleanLine.includes('Warning:')) return <span className="text-amber-400 font-bold">{cleanLine}</span>;
  if (cleanLine.includes('[SYS]')) return <span className="text-sky-400 font-bold">{cleanLine}</span>;
  if (cleanLine.includes('[OK]')) return <span className="text-teal-400 font-bold">{cleanLine}</span>;
  if (cleanLine.includes('Nmap scan report for')) return <span className="text-sky-400 font-bold mt-3 block border-t border-slate-800/60 pt-2">{cleanLine}</span>;

  if (cleanLine.match(/^\d+\/(tcp|udp|sctp)/)) {
    const parts = cleanLine.split(/(\s+)/);
    return (
      <span>
        {parts.map((part, i) => {
          if (part.match(/^\d+\/(tcp|udp|sctp)/)) return <span key={i} className="text-sky-400 font-bold">{part}</span>;
          if (part === 'open') return <span key={i} className="text-teal-400 font-bold">{part}</span>;
          if (part === 'closed' || part === 'filtered') return <span key={i} className="text-orange-400">{part}</span>;
          if (i === 4 && part.trim() !== '') return <span key={i} className="text-fuchsia-400">{part}</span>;
          return <span key={i} className="text-slate-400">{part}</span>;
        })}
      </span>
    );
  }
  const parts = cleanLine.split(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|\d+\.\d+%|\d+:\d+:\d+)/g);
  return (
    <span className="text-slate-300 block">
      {parts.map((part, i) => {
        if (part.match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/)) return <span key={i} className="text-blue-400 font-medium">{part}</span>;
        if (part.match(/\d+\.\d+%/)) return <span key={i} className="text-amber-400 font-bold">{part}</span>;
        if (part.match(/\d+:\d+:\d+/)) return <span key={i} className="text-purple-400">{part}</span>;
        return part;
      })}
    </span>
  );
}

export function TerminalPanel() {
  const { output, appendOutput, setIsScanning, commandString, progressText, setProgressText, isScanning, clearOutput } = useScanStore()
  const terminalEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [autoScroll, setAutoScroll] = useState(true)
  const [searchGrep, setSearchGrep] = useState('')
  const [copied, setCopied] = useState(false)

  const [activeTab, setActiveTab] = useState<'scanner' | string>('scanner');
  const [bashTabs, setBashTabs] = useState<{ id: string; name: string }[]>([]);
  const [autoLogEnabled, setAutoLogEnabled] = useState(false);

  useEffect(() => {
    if (!isScanning && output.length > 0 && autoLogEnabled) exportRawLog(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScanning]);

  const addBashTab = () => {
    if (bashTabs.length >= MAX_BASH_TABS) { alert(`Máximo ${MAX_BASH_TABS} terminales simultáneas.`); return; }
    const id = newSessionId();
    setBashTabs((prev) => [...prev, { id, name: `Bash ${bashTabs.length + 1}` }]);
    setActiveTab(id);
  };

  const removeBashTab = useCallback((idToRemove: string) => {
    setBashTabs((prev) => prev.filter((t) => t.id !== idToRemove));
    setActiveTab((current) => (current === idToRemove ? 'scanner' : current));
  }, []);

  const exportRawLog = (isSilent: boolean = false) => {
    if (output.length === 0) return;
    const blob = new Blob([output.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');  
    a.href = url;  
    a.download = `nmap_log_${Date.now()}.txt`;  
    a.click();  
    URL.revokeObjectURL(url);
    if (!isSilent) alert('Log exportado a Descargas.');
  };

  const copyCommand = () => {
    navigator.clipboard.writeText(commandString);  
    setCopied(true);  
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (autoScroll && activeTab === 'scanner') terminalEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [output.length, autoScroll, activeTab]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  };

  useEffect(() => {
    const unlistenOutput = listen<string>('nmap-output', (event) => {
      const line = event.payload;
      if (line.startsWith('Stats:')) {
        const perc = line.match(/(\d+\.\d+)% done/);
        const eta = line.match(/(\d+:\d+:\d+) remaining/);
        if (perc && eta) setProgressText(`${perc[1]}% | ETA: ${eta[1]}`);
      } else if (line.trim().length > 2) appendOutput(line);
    });

    const unlistenFinished = listen<string>('nmap-finished', (event) => {
      appendOutput(`\n${event.payload}`);  
      setIsScanning(false);  
      setProgressText('Completado');
    });

    return () => {  
      unlistenOutput.then(f => f());  
      unlistenFinished.then(f => f());  
    };
  }, [appendOutput, setIsScanning, setProgressText]);

  const filteredOutput = searchGrep ? output.filter((line) => line.toLowerCase().includes(searchGrep.toLowerCase())) : output;

  return (
    <section className="flex flex-col h-full min-h-0 bg-[#020617] relative border-t border-slate-800/80">
      
      {/* TABS BAR */}
      <div className="bg-slate-950 flex justify-between items-center pr-3 shrink-0 border-b border-slate-800/80 z-10">
        <div className="flex overflow-x-auto custom-scrollbar">
          <button
            onClick={() => setActiveTab('scanner')}
            className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'scanner' ? 'bg-[#020617] text-teal-400 border-t-2 border-teal-500' : 'text-slate-500 hover:bg-slate-900 border-t-2 border-transparent'
            }`}
          >
            <TerminalSquare size={14} className={isScanning ? "text-teal-500 animate-pulse" : ""} />
            ESCANER NMAP
          </button>

          {bashTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors whitespace-nowrap flex items-center gap-2 border-r border-slate-800/50 ${
                activeTab === tab.id ? 'bg-[#020617] text-sky-400 border-t-2 border-sky-500' : 'text-slate-500 hover:bg-slate-900 border-t-2 border-transparent'
              }`}
            >
              <span className="text-sky-500">~</span> {tab.name}
            </button>
          ))}

          <button
            onClick={addBashTab}
            disabled={bashTabs.length >= MAX_BASH_TABS}
            className="px-4 py-2 text-slate-500 hover:text-sky-400 hover:bg-slate-900 disabled:opacity-30 transition-colors flex items-center"
          >
            +
          </button>
        </div>

        <label className="flex items-center space-x-1.5 cursor-pointer" title="Guardar logs autom.">
          <input type="checkbox" checked={autoLogEnabled} onChange={() => setAutoLogEnabled(!autoLogEnabled)} className="rounded text-fuchsia-500 accent-fuchsia-500 w-3 h-3" />
          <span className={`text-[9px] font-bold uppercase tracking-wider ${autoLogEnabled ? 'text-fuchsia-400' : 'text-slate-500'}`}>Auto-Log</span>
        </label>
      </div>

      {/* SCANNER TAB */}
      <div className={`flex-col flex-1 h-full min-h-0 w-full ${activeTab === 'scanner' ? 'flex' : 'hidden'}`}>
        <div className="bg-slate-900/50 px-4 py-2 flex justify-between items-center border-b border-slate-800/80 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="text-[11px] font-mono text-slate-400 truncate max-w-md hidden md:block">
              <span className="text-teal-500 mr-2">❯</span>{commandString}
            </span>
            <div className="relative flex items-center">
              <Search size={12} className="absolute left-2 text-slate-500" />
              <input
                type="text"
                value={searchGrep}
                onChange={(e) => setSearchGrep(e.target.value)}
                placeholder="Grep..."
                className="bg-[#020617] border border-slate-800 text-teal-400 text-[10px] pl-6 pr-2 py-1 rounded w-32 focus:ring-1 focus:ring-teal-500/50 outline-none font-mono"
              />
            </div>
            {isScanning && progressText && (
              <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 shrink-0">
                {progressText}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={copyCommand} className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors" title={copied ? 'Copiado!' : 'Copiar CLI'}>
              <Copy size={14} className={copied ? "text-teal-400" : ""} />
            </button>
            <button onClick={() => exportRawLog(false)} disabled={output.length === 0} className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors disabled:opacity-30" title="Descargar Log">
              <Download size={14} />
            </button>
            <button onClick={clearOutput} disabled={isScanning} className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors disabled:opacity-30" title="Limpiar">
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto min-h-0 w-full p-4 font-mono text-[12px] leading-relaxed break-all whitespace-pre-wrap scroll-smooth relative custom-scrollbar">
          {filteredOutput.length > 0 ? filteredOutput.map((line, i) => <ColorizeLine key={i} line={line} />) : <span className="text-slate-600">Esperando ejecución...</span>}
          <div ref={terminalEndRef} />
        </div>

        {!autoScroll && isScanning && !searchGrep && (
          <button onClick={() => setAutoScroll(true)} className="absolute bottom-6 right-6 bg-teal-500 text-slate-950 text-[10px] font-bold px-4 py-2 rounded-full shadow-lg hover:bg-teal-400 animate-bounce uppercase tracking-wider">
            ↓ Seguir logs
          </button>
        )}
      </div>

      {/* PESTAÑAS BASH */}
      {bashTabs.map((tab) => (
        <TabErrorBoundary
          key={tab.id}
          label={tab.name}
          onClose={() => removeBashTab(tab.id)}
        >
          <BashTerminal
            sessionId={tab.id}
            isActive={activeTab === tab.id}
            onRemove={removeBashTab}
            autoLog={autoLogEnabled}
          />
        </TabErrorBoundary>
      ))}
    </section>
  );
}
