import { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useScanStore } from '../../core/store/useScanStore'

const ColorizeLine = ({ line }: { line: string }) => {
  // LIMPIEZA DE ANSI Y ASCII ART
  // Si la línea contiene los códigos extraños de RustScan o está vacía, no la dibujamos para ahorrar GPU de React.
  const cleanLine = line.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').trim();
  
  if (!cleanLine || cleanLine.startsWith('Stats:') || cleanLine.includes('.~-') || cleanLine.includes('| {}') || cleanLine.includes('`-\'')) return null;
  
  if (cleanLine.includes('Discovered open port')) return <span className="text-emerald-400 font-semibold">{cleanLine}</span>;
  if (cleanLine.startsWith('Initiating') || cleanLine.startsWith('Completed') || cleanLine.includes('Open')) return <span className="text-indigo-400 italic">{cleanLine}</span>;
  if (cleanLine.startsWith('NSE:')) return <span className="text-fuchsia-400">{cleanLine}</span>;
  if (cleanLine.includes('Warning:') || cleanLine.includes('QUITTING') || cleanLine.includes('ERROR:')) return <span className="text-red-500 font-bold">{cleanLine}</span>;
  if (cleanLine.includes('Nmap scan report for')) return <span className="text-sky-300 font-bold mt-3 block border-t border-slate-700/50 pt-2">{cleanLine}</span>;

  if (cleanLine.match(/^\d+\/(tcp|udp|sctp)/)) {
    const parts = cleanLine.split(/(\s+)/);
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

  const parts = cleanLine.split(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|\d+\.\d+%|\d+:\d+:\d+)/g);
  return (
    <span className="text-slate-300 block">
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
  const { output, appendOutput, setIsScanning, commandString, progressText, setProgressText, isScanning, clearOutput } = useScanStore()
  const terminalEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [searchGrep, setSearchGrep] = useState('')  
  const [copied, setCopied] = useState(false)

  const exportRawLog = () => {
    const blob = new Blob([output.join('\n')], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `lessso_raw_${Date.now()}.txt`; a.click();
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
        // En lugar de inyectar todo de golpe, solo inyectamos si la línea tiene sustancia para no congelar a React
        if (line.trim().length > 2) {
            appendOutput(line);
        }
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
    <section className="flex flex-col h-full min-h-0 bg-[#0b1120] relative">
        <div className="bg-slate-900 px-4 py-1.5 flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-700 shrink-0 gap-3">
          <div className="flex items-center space-x-3 w-full sm:w-auto overflow-hidden">
            <span className="text-[10px] text-slate-300 font-mono flex items-center space-x-2 shrink-0">
              <span className={`h-2 w-2 rounded-full ${isScanning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></span>
              <span className="font-bold tracking-wider">LESSSO TERMINAL</span>
            </span>
            <div className="w-px h-4 bg-slate-700 mx-1 shrink-0"></div>
            
            <span className="text-[10px] font-mono text-emerald-400 bg-black/30 px-2 py-0.5 rounded border border-slate-700 truncate max-w-md hidden md:block" title="Comando actual de Nmap/Rustscan generado por tus opciones">
              $ {commandString}
            </span>

            <input type="text" value={searchGrep} onChange={(e) => setSearchGrep(e.target.value)} placeholder="Grep: filtrar..." className="bg-slate-950 border border-slate-700 text-emerald-400 text-[10px] px-2 py-1 rounded w-32 focus:ring-1 focus:ring-indigo-500 outline-none font-mono shrink-0" />
            {isScanning && progressText && <span className="text-[10px] text-indigo-300 font-bold bg-indigo-900/40 px-2 py-0.5 rounded border border-indigo-500/30 shrink-0">{progressText}</span>}
          </div>
          
          <div className="flex items-center space-x-3 w-full sm:w-auto justify-end shrink-0">
            <button onClick={copyCommand} className="text-[10px] text-slate-400 hover:text-white transition-colors uppercase font-bold">{copied ? 'Copiado!' : 'Copiar CLI'}</button>
            <button onClick={exportRawLog} disabled={output.length === 0} className="text-[10px] text-slate-400 hover:text-white transition-colors disabled:opacity-30 uppercase font-bold">Exportar Log</button>
            <button onClick={clearOutput} disabled={isScanning} className="text-[10px] text-slate-400 hover:text-white transition-colors disabled:opacity-30 uppercase font-bold">Limpiar</button>
          </div>
        </div>

        <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 font-mono text-[12px] leading-relaxed break-all whitespace-pre-wrap scroll-smooth relative custom-scrollbar">
          {filteredOutput.length > 0  
            ? filteredOutput.map((line, i) => <ColorizeLine key={i} line={line} />)  
            : <span className="text-slate-600">Terminal inactiva. Esperando comandos de LESSSO C2...</span>
          }
          <div ref={terminalEndRef} />
        </div>

        {!autoScroll && isScanning && !searchGrep && (
          <button onClick={() => setAutoScroll(true)} className="absolute bottom-6 right-6 bg-[#0b282c] text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg opacity-90 hover:opacity-100 animate-bounce uppercase tracking-wider border border-teal-500/30">↓ Ver logs recientes</button>
        )}
    </section>
  )
}
