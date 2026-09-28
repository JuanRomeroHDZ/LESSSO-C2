import { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useScanStore } from '../../core/store/useScanStore'

const ColorizeLine = ({ line }: { line: string }) => {
  if (line.startsWith('Stats:')) return null;
  if (line.includes('Discovered open port')) return <span className="text-emerald-400 font-semibold">{line}</span>;
  if (line.startsWith('Initiating') || line.startsWith('Completed')) return <span className="text-indigo-400 italic">{line}</span>;
  if (line.startsWith('NSE:')) return <span className="text-fuchsia-400">{line}</span>;
  if (line.includes('Warning:') || line.includes('QUITTING') || line.includes('ERROR:')) return <span className="text-red-500 font-bold">{line}</span>;
  if (line.includes('Nmap scan report for')) return <span className="text-sky-300 font-bold mt-3 block border-t border-slate-700/50 pt-2">{line}</span>;

  if (line.match(/^\d+\/(tcp|udp|sctp)/)) {
    const parts = line.split(/(\s+)/);
    return (
      <span>
        {parts.map((part, i) => {
          if (part.match(/^\d+\/(tcp|udp|sctp)/)) return <span key={i} className="text-sky-400 font-bold">{part}</span>;
          if (part === 'open') return <span key={i} className="text-emerald-400 font-bold">{part}</span>;
          if (part === 'closed' || part === 'filtered') return <span key={i} className="text-orange-400">{part}</span>;
          if (i === 4 && part.trim() !== '') return <span key={i} className="text-pink-400">{part}</span>;  
          return <span key={i} className="text-slate-400">{part}</span>;  
        })}
      </span>
    );
  }

  const parts = line.split(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|\d+\.\d+%|\d+:\d+:\d+)/g);
  return (
    <span className="text-slate-300">
      {parts.map((part, i) => {
        if (part.match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/)) return <span key={i} className="text-blue-400 font-medium">{part}</span>;
        if (part.match(/\d+\.\d+%/)) return <span key={i} className="text-yellow-400 font-bold">{part}</span>;
        if (part.match(/\d+:\d+:\d+/)) return <span key={i} className="text-purple-400">{part}</span>;
        return part;
      })}
    </span>
  );
}

export function TerminalPanel() {
  const { output, appendOutput, setIsScanning, commandString, setCommandString, progressText, setProgressText, isScanning, clearOutput } = useScanStore()
  const terminalEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [searchGrep, setSearchGrep] = useState('') 
  const [copied, setCopied] = useState(false)

  const exportRawLog = () => {
    const blob = new Blob([output.join('\n')], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `juanmap_raw_${Date.now()}.txt`; a.click();
  }

  const copyCommand = () => {
    navigator.clipboard.writeText(commandString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  useEffect(() => {
    if (autoScroll) terminalEndRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [output.length, autoScroll])

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(isAtBottom);
  }

  useEffect(() => {
    const unlistenOutput = listen<string>('nmap-output', (event) => {
      const line = event.payload;
      if (line.startsWith('Stats:')) {
        const percentageMatch = line.match(/(\d+\.\d+)% done/);
        const etaMatch = line.match(/(\d+:\d+:\d+) remaining/);
        if (percentageMatch && etaMatch) setProgressText(`${percentageMatch[1]}% Completado | ETA: ${etaMatch[1]}`);
      } else {
        appendOutput(line);
      }
    })
    
    const unlistenFinished = listen<string>('nmap-finished', (event) => {
      appendOutput(`\n${event.payload}`);
      setIsScanning(false);
      setProgressText('Auditoría Finalizada');
    })
    
    return () => { unlistenOutput.then(f => f()); unlistenFinished.then(f => f()); }
  }, [appendOutput, setIsScanning, setProgressText])

  const filteredOutput = searchGrep ? output.filter(line => line.toLowerCase().includes(searchGrep.toLowerCase())) : output;

  return (
    <section className="flex flex-col h-full space-y-3 min-h-0">
      
      <div className="bg-slate-900 rounded-lg p-3 shadow-sm border border-slate-800 shrink-0 flex items-center justify-between group">
        <div className="flex-1 pr-4">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold block mb-1">Comando Interactivo</span>
          <input type="text" value={commandString} onChange={(e) => setCommandString(e.target.value)} disabled={isScanning} className="w-full bg-transparent text-emerald-400 font-mono text-sm outline-none border-b border-dashed border-slate-700 focus:border-emerald-400 pb-1 disabled:opacity-50" />
        </div>
        <button onClick={copyCommand} className="bg-slate-800 text-slate-300 hover:text-white px-3 py-1.5 rounded text-xs font-bold transition-colors">
          {copied ? '¡Copiado!' : 'Copiar CLI'}
        </button>
      </div>

      <div className="flex-1 bg-[#0b1120] rounded-lg shadow-sm flex flex-col border border-slate-800 min-h-0 relative">
          <div className="bg-slate-800/80 px-4 py-2 flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-700 shrink-0 gap-3">
            <div className="flex items-center space-x-3 w-full sm:w-auto">
              <span className="text-[11px] text-slate-300 font-mono flex items-center space-x-2">
                <span className={`h-2 w-2 rounded-full ${isScanning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></span>
                <span>{isScanning ? 'LIVE' : 'OFF'}</span>
              </span>
              <input type="text" value={searchGrep} onChange={(e) => setSearchGrep(e.target.value)} placeholder="Grep: filtrar texto..." className="bg-slate-900 border border-slate-700 text-slate-300 text-[11px] px-2 py-1 rounded w-40 focus:ring-1 focus:ring-indigo-500 outline-none" />
            </div>
            
            <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
              {isScanning && progressText && <span className="text-[10px] text-indigo-300 font-bold bg-indigo-900/40 px-2 py-0.5 rounded border border-indigo-500/30">{progressText}</span>}
              <button onClick={exportRawLog} disabled={output.length === 0} className="text-[11px] text-slate-400 hover:text-white transition-colors disabled:opacity-30 uppercase font-bold">Exportar Log</button>
              <button onClick={clearOutput} disabled={isScanning} className="text-[11px] text-slate-400 hover:text-white transition-colors disabled:opacity-30 uppercase font-bold">Limpiar</button>
            </div>
          </div>

          <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 font-mono text-[13px] leading-relaxed break-all whitespace-pre-wrap scroll-smooth relative">
            {filteredOutput.length > 0 
              ? filteredOutput.map((line, i) => <div key={i} className="min-h-[1.25rem]"><ColorizeLine line={line} /></div>) 
              : <span className="text-slate-600">Terminal inactiva o sin coincidencias de filtro...</span>
            }
            <div ref={terminalEndRef} />
          </div>

          {!autoScroll && isScanning && !searchGrep && (
            <button onClick={() => setAutoScroll(true)} className="absolute bottom-6 right-6 bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg opacity-90 hover:opacity-100 animate-bounce">↓ Ver nuevos logs</button>
          )}
      </div>
    </section>
  )
}
