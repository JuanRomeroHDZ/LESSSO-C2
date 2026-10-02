import { useState, useEffect, useMemo, useCallback } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { Lock, Unlock, RefreshCw, Clipboard, FileText, Search, KeyRound, Copy } from 'lucide-react';
import { 
  type EncodeOp, 
  type EncodeGroup, 
  HASH_PATTERNS, 
  applyOp 
} from '../../core/utils/cryptoHelpers';

const OPS: Record<EncodeOp, { label: string; icon: React.ElementType; group: EncodeGroup }> = {
  b64_encode:      { label: 'Base64 Enc',  icon: Lock, group: 'encode' },
  b64_decode:      { label: 'Base64 Dec',  icon: Unlock, group: 'decode' },
  url_encode:      { label: 'URL Enc',     icon: Lock, group: 'encode' },
  url_decode:      { label: 'URL Dec',     icon: Unlock, group: 'decode' },
  hex_encode:      { label: 'Hex Enc',     icon: Lock, group: 'encode' },
  hex_decode:      { label: 'Hex Dec',     icon: Unlock, group: 'decode' },
  html_encode:     { label: 'HTML Enc',    icon: Lock, group: 'encode' },
  html_decode:     { label: 'HTML Dec',    icon: Unlock, group: 'decode' },
  binary_encode:   { label: 'Binario',     icon: Lock, group: 'encode' },
  binary_decode:   { label: 'Bin Dec',     icon: Unlock, group: 'decode' },
  base32_encode:   { label: 'Base32 Enc',  icon: Lock, group: 'encode' },
  base32_decode:   { label: 'Base32 Dec',  icon: Unlock, group: 'decode' },
  unicode_encode:  { label: 'Unicode Enc', icon: Lock, group: 'encode' },
  unicode_decode:  { label: 'Unicode Dec', icon: Unlock, group: 'decode' },
  rot13:           { label: 'ROT13',       icon: RefreshCw, group: 'transform' },
};

export function DecodersTool() {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [detectedType, setDetectedType] = useState('Texto Plano');
  const [hashMode, setHashMode] = useState('0');
  const [hashWordlist, setHashWordlist] = useState('/usr/share/wordlists/rockyou.txt');
  const [activeGroup, setActiveGroup] = useState<EncodeGroup>('decode');
  const [isDragging, setIsDragging] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  useEffect(() => {
    const text = inputText.trim();
    if (!text) { setDetectedType('Texto Plano'); return; }
    if (text.split('.').length === 3 && text.startsWith('eyJ')) { setDetectedType('JSON Web Token (JWT)'); return; }
    for (const p of HASH_PATTERNS) { if (p.regex.test(text)) { setDetectedType(`Hash: ${p.name}`); setHashMode(p.hashcatMode); return; } }
    if (/^[A-Za-z0-9+/=]+$/.test(text) && text.length % 4 === 0 && !text.includes(' ')) { setDetectedType('Posible Base64'); return; }
    if (/^[A-Z2-7]+=*$/.test(text) && text.length % 8 === 0) { setDetectedType('Posible Base32'); return; }
    if (text.includes('%') && text.length > 5) { setDetectedType('URL Encoded'); return; }
    if (/^[a-fA-F0-9\s]+$/.test(text) && text.replace(/\s/g, '').length % 2 === 0) { setDetectedType('Posible Hex'); return; }
    if (/^[01\s]+$/.test(text)) { setDetectedType('Posible Binario'); return; }
    if (/\\u[0-9a-fA-F]{4}/.test(text)) { setDetectedType('Unicode Escape'); return; }
    setDetectedType('Texto Plano');
  }, [inputText]);

  const handleOp = (op: EncodeOp) => { setOutputText(applyOp(inputText, op)); };

  const handleJWT = () => {
    try {
      const parts = inputText.split('.'); if (parts.length !== 3) throw new Error('No JWT');
      const header = JSON.parse(decodeURIComponent(escape(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')))));
      const payload = JSON.parse(decodeURIComponent(escape(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))));
      setOutputText(`--- HEADER ---\n${JSON.stringify(header, null, 2)}\n\n--- PAYLOAD ---\n${JSON.stringify(payload, null, 2)}\n\n--- SIGNATURE ---\n${parts[2]}`);
    } catch { setOutputText('Error: No es un JSON Web Token (JWT) válido.'); }
  };

  const copyToClipboard = async (text: string) => { 
      try { 
          await navigator.clipboard.writeText(text); 
          setCopiedText(true); 
          setTimeout(() => setCopiedText(false), 1500); 
      } catch {} 
  };
  const pasteFromClipboard = async () => { try { const text = await navigator.clipboard.readText(); setInputText(text); } catch { alert("Error pegando del portapapeles."); } };
  const swapInputOutput = () => { setInputText(outputText); setOutputText(inputText); };
  const clearAll = () => { setInputText(''); setOutputText(''); setDetectedType('Texto Plano'); };

  const browseHashWordlist = async () => {
    try {
      const selected = await openDialog({ title: 'Seleccionar Wordlist', filters: [{ name: 'Text', extensions: ['txt', 'list'] }] });
      if (selected && !Array.isArray(selected)) setHashWordlist(selected);
    } catch {}
  };

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const reader = new FileReader();
      reader.onload = (event) => { if (event.target && typeof event.target.result === 'string') setInputText(event.target.result); };
      reader.readAsText(e.dataTransfer.files[0]);
    }
  }, []);

  const opsInGroup = useMemo(() => (Object.keys(OPS) as EncodeOp[]).filter(op => OPS[op].group === activeGroup), [activeGroup]);
  const isHash = detectedType.startsWith('Hash:');

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar p-4 bg-[#09090b]">
      <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
        <h3 className="text-xs tracking-widest font-black text-fuchsia-500 uppercase flex items-center gap-2">
          <Unlock size={14}/> Criptografía
        </h3>
        <span className="text-[10px] font-bold text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded border border-slate-700">
          {detectedType}
        </span>
      </div>

      <div className="relative shrink-0 mb-4" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Pega un Hash, Base64, URL, JWT, Hex... o arrastra un archivo .txt aquí"
          className={`w-full h-32 p-3 pr-12 text-xs border rounded-lg outline-none font-mono resize-none transition-colors custom-scrollbar ${
            isDragging ? 'bg-fuchsia-900/20 border-fuchsia-500 text-fuchsia-300' : 'bg-[#020617] border-slate-800 text-slate-300 focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50'
          }`}
        />
        <button onClick={pasteFromClipboard} className="absolute top-2 right-2 text-slate-500 hover:text-fuchsia-400 p-2 bg-[#09090b] border border-slate-800 rounded-md transition-colors" title="Pegar del portapapeles">
          <Clipboard size={14} />
        </button>
      </div>

      <div className="flex gap-2 mb-4 shrink-0">
        <button onClick={clearAll} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-slate-900 border border-slate-800 text-slate-500 rounded-md hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30 transition-colors">Limpiar</button>
        <button onClick={swapInputOutput} disabled={!outputText} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-slate-900 border border-slate-800 text-slate-500 rounded-md hover:text-white transition-colors disabled:opacity-30 flex items-center gap-1.5"><RefreshCw size={12}/> Swap</button>
        <button onClick={() => handleJWT()} disabled={detectedType !== 'JSON Web Token (JWT)'} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400 rounded-md hover:bg-fuchsia-500/20 transition-colors disabled:opacity-30">Decodificar JWT</button>
      </div>

      <div className="flex border-b border-slate-800 mb-4 shrink-0">
        {(['encode', 'decode', 'transform'] as const).map(group => (
          <button
            key={group}
            onClick={() => setActiveGroup(group)}
            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${
              activeGroup === group ? 'text-fuchsia-400 border-b-2 border-fuchsia-500 bg-fuchsia-500/5' : 'text-slate-500 hover:text-slate-300 border-b-2 border-transparent'
            }`}
          >
            {group === 'encode' ? 'Codificar' : group === 'decode' ? 'Decodificar' : 'Transformar'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 mb-5 shrink-0">
        {opsInGroup.map(op => {
          const Icon = OPS[op].icon;
          return (
            <button key={op} onClick={() => handleOp(op)} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider rounded-md bg-slate-900 border border-slate-800 text-slate-400 hover:bg-fuchsia-500/10 hover:border-fuchsia-500/30 hover:text-fuchsia-400 transition-colors flex items-center justify-center gap-2">
              <Icon size={12} /> {OPS[op].label}
            </button>
          );
        })}
      </div>

      <div className="relative shrink-0 mb-6">
        <textarea value={outputText} readOnly placeholder="Resultado..." className="w-full h-32 p-3 pr-12 text-[11px] bg-fuchsia-500/5 border border-fuchsia-500/20 rounded-lg outline-none text-fuchsia-300 font-mono resize-none custom-scrollbar" />
        {outputText && (
          <button onClick={() => copyToClipboard(outputText)} className="absolute top-2 right-2 text-fuchsia-500 hover:text-fuchsia-300 p-2 bg-[#09090b] border border-fuchsia-500/30 rounded-md transition-colors" title="Copiar">
            {copiedText ? '✓' : <Copy size={14} />}
          </button>
        )}
      </div>

      <div className="pt-4 border-t border-slate-800 shrink-0">
        <h3 className="text-[10px] tracking-widest font-black text-rose-500 uppercase mb-3 flex items-center gap-2">
          <KeyRound size={14} /> Generador Hashcat
          {isHash && <span className="text-[8px] font-bold bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md normal-case ml-2 text-rose-400 tracking-normal">(Auto-detectado)</span>}
        </h3>

        <div className="flex gap-3 mb-3">
          <div className="flex-1">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Hash Mode (-m)</label>
            <input type="text" value={hashMode} onChange={e => setHashMode(e.target.value)} placeholder="0" className="w-full px-3 py-2 bg-[#020617] border border-slate-800 rounded-md text-xs font-mono text-white outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/50" />
          </div>
          <div className="flex-1">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Ataque (-a)</label>
            <select className="w-full px-3 py-2 bg-[#020617] border border-slate-800 rounded-md text-xs font-mono text-white outline-none focus:border-rose-500/50">
              <option value="0">0 (Diccionario)</option><option value="3">3 (Máscara)</option><option value="6">6 (Híbrido)</option>
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Wordlist</label>
          <div className="flex gap-2">
            <input type="text" value={hashWordlist} onChange={e => setHashWordlist(e.target.value)} placeholder="Ruta a wordlist..." className="flex-1 px-3 py-2 bg-[#020617] border border-slate-800 rounded-md text-[10px] font-mono text-slate-300 outline-none focus:border-rose-500/50" />
            <button onClick={browseHashWordlist} className="px-3 py-2 bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-bold uppercase tracking-wider rounded-md hover:bg-slate-700 transition-colors flex items-center gap-1.5"><FileText size={12}/> Ruta</button>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={() => copyToClipboard(`hashcat -m ${hashMode} -a 0 '${inputText}' "${hashWordlist}"`)} disabled={!inputText} className="flex-1 bg-rose-500/10 text-rose-500 border border-rose-500/20 px-4 py-2.5 rounded-md text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/20 transition-colors shadow-sm disabled:opacity-30 flex items-center justify-center gap-2">
            <Clipboard size={14}/> Copiar CLI Hashcat
          </button>
          <a href={inputText ? `https://crackstation.net/` : '#'} target="_blank" rel="noopener noreferrer" className="px-4 py-2.5 bg-blue-500/10 text-blue-500 border border-blue-500/20 text-[10px] font-black uppercase tracking-widest rounded-md hover:bg-blue-500/20 transition-colors text-center flex items-center justify-center gap-2" title="Buscar en CrackStation">
            <Search size={14}/> CrackStation
          </a>
        </div>
      </div>
    </div>
  );
}
