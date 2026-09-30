import { useState, useEffect, useMemo, useCallback } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

type EncodeOp =
  | 'b64_encode' | 'b64_decode'
  | 'url_encode' | 'url_decode'
  | 'hex_encode' | 'hex_decode'
  | 'rot13'
  | 'html_encode' | 'html_decode'
  | 'binary_encode' | 'binary_decode'
  | 'base32_encode' | 'base32_decode'
  | 'unicode_encode' | 'unicode_decode';

type EncodeGroup = 'encode' | 'decode' | 'transform';

const OPS: Record<EncodeOp, { label: string; icon: string; group: EncodeGroup }> = {
  b64_encode:      { label: 'Base64 Enc',  icon: '🔒', group: 'encode' },
  b64_decode:      { label: 'Base64 Dec',  icon: '🔓', group: 'decode' },
  url_encode:      { label: 'URL Enc',     icon: '🔒', group: 'encode' },
  url_decode:      { label: 'URL Dec',     icon: '🔓', group: 'decode' },
  hex_encode:      { label: 'Hex Enc',     icon: '🔒', group: 'encode' },
  hex_decode:      { label: 'Hex Dec',     icon: '🔓', group: 'decode' },
  html_encode:     { label: 'HTML Enc',    icon: '🔒', group: 'encode' },
  html_decode:     { label: 'HTML Dec',    icon: '🔓', group: 'decode' },
  binary_encode:   { label: 'Binario',     icon: '🔒', group: 'encode' },
  binary_decode:   { label: 'Binario Dec', icon: '🔓', group: 'decode' },
  base32_encode:   { label: 'Base32 Enc',  icon: '🔒', group: 'encode' },
  base32_decode:   { label: 'Base32 Dec',  icon: '🔓', group: 'decode' },
  unicode_encode:  { label: 'Unicode Enc', icon: '🔒', group: 'encode' },
  unicode_decode:  { label: 'Unicode Dec', icon: '🔓', group: 'decode' },
  rot13:           { label: 'ROT13',       icon: '🔄', group: 'transform' },
};

const HASH_PATTERNS: Array<{ regex: RegExp; name: string; hashcatMode: string }> = [
  { regex: /^[a-fA-F0-9]{32}$/,                        name: 'MD5',           hashcatMode: '0' },
  { regex: /^[a-fA-F0-9]{40}$/,                        name: 'SHA1',          hashcatMode: '100' },
  { regex: /^[a-fA-F0-9]{56}$/,                        name: 'SHA224',        hashcatMode: '1300' },
  { regex: /^[a-fA-F0-9]{64}$/,                        name: 'SHA256',        hashcatMode: '1400' },
  { regex: /^[a-fA-F0-9]{96}$/,                        name: 'SHA384',        hashcatMode: '10800' },
  { regex: /^[a-fA-F0-9]{128}$/,                       name: 'SHA512',        hashcatMode: '1700' },
  { regex: /^\$1\$[a-zA-Z0-9./]+\$[a-zA-Z0-9./]+$/,    name: 'MD5 Crypt',     hashcatMode: '500' },
  { regex: /^\$2[aby]\$\d{2}\$[a-zA-Z0-9./]+$/,        name: 'Bcrypt',        hashcatMode: '3200' },
  { regex: /^\$5\$[a-zA-Z0-9./]+\$[a-zA-Z0-9./]+$/,    name: 'SHA256 Crypt',  hashcatMode: '7400' },
  { regex: /^\$6\$[a-zA-Z0-9./]+\$[a-zA-Z0-9./]+$/,    name: 'SHA512 Crypt',  hashcatMode: '1800' },
  { regex: /^[a-fA-F0-9]{32}:[a-zA-Z0-9]+$/,           name: 'MD5 + Salt',    hashcatMode: '20' },
  { regex: /^sha1\$[a-zA-Z0-9]+\$[a-fA-F0-9]{40}$/,    name: 'SHA1 + Salt',   hashcatMode: '120' },
  { regex: /^\{SSHA\}[a-zA-Z0-9+/=]+$/,                name: 'SSHA',          hashcatMode: '111' },
];

function applyOp(input: string, op: EncodeOp): string {
  try {
    switch (op) {
      case 'b64_encode':     return btoa(unescape(encodeURIComponent(input)));
      case 'b64_decode':     return decodeURIComponent(escape(atob(input)));
      case 'url_encode':     return encodeURIComponent(input);
      case 'url_decode':     return decodeURIComponent(input);
      case 'hex_encode':     return Array.from(input).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
      case 'hex_decode':     return input.replace(/[^0-9a-fA-F]/g, '').match(/.{1,2}/g)?.map(b => String.fromCharCode(parseInt(b, 16))).join('') ?? '';
      case 'html_encode':    return input.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
      case 'html_decode':    return input.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, m => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' }[m] || m));
      case 'binary_encode':  return Array.from(input).map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
      case 'binary_decode':  return input.split(/\s+/).filter(b => /^[01]+$/.test(b)).map(b => String.fromCharCode(parseInt(b, 2))).join('');
      case 'base32_encode':  return base32Encode(input);
      case 'base32_decode':  return base32Decode(input);
      case 'unicode_encode': return Array.from(input).map(c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join('');
      case 'unicode_decode': return input.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      case 'rot13':          return input.replace(/[a-zA-Z]/g, c => String.fromCharCode((c <= 'Z' ? 90 : 122) >= c.charCodeAt(0) + 13 ? c.charCodeAt(0) + 13 : c.charCodeAt(0) - 13));
    }
  } catch (err) {
    return `ERROR: ${err instanceof Error ? err.message : 'operación inválida'}`;
  }
}

function base32Encode(input: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = new TextEncoder().encode(input);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  while (bits.length % 5 !== 0) bits += '0';
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += alphabet[parseInt(bits.slice(i, i + 5), 2)];
  while (out.length % 8 !== 0) out += '=';
  return out;
}

function base32Decode(input: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.replace(/=+$/, '').toUpperCase();
  let bits = '';
  for (const c of clean) {
    const idx = alphabet.indexOf(c);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return new TextDecoder().decode(new Uint8Array(bytes));
}

export function DecodersTool() {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [detectedType, setDetectedType] = useState('Texto Plano');
  const [hashMode, setHashMode] = useState('0');
  const [hashWordlist, setHashWordlist] = useState('/usr/share/wordlists/rockyou.txt');
  const [activeGroup, setActiveGroup] = useState<EncodeGroup>('decode');
  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const text = inputText.trim();
    if (!text) {
      setDetectedType('Texto Plano');
      return;
    }
    if (text.split('.').length === 3 && text.startsWith('eyJ')) {
      setDetectedType('JSON Web Token (JWT)');
      return;
    }
    for (const p of HASH_PATTERNS) {
      if (p.regex.test(text)) {
        setDetectedType(`Hash: ${p.name}`);
        setHashMode(p.hashcatMode);
        return;
      }
    }
    if (/^[A-Za-z0-9+/=]+$/.test(text) && text.length % 4 === 0 && !text.includes(' ')) {
      setDetectedType('Posible Base64');
      return;
    }
    if (/^[A-Z2-7]+=*$/.test(text) && text.length % 8 === 0) {
      setDetectedType('Posible Base32');
      return;
    }
    if (text.includes('%') && text.length > 5) {
      setDetectedType('URL Encoded');
      return;
    }
    if (/^[a-fA-F0-9\s]+$/.test(text) && text.replace(/\s/g, '').length % 2 === 0) {
      setDetectedType('Posible Hex');
      return;
    }
    if (/^[01\s]+$/.test(text)) {
      setDetectedType('Posible Binario');
      return;
    }
    if (/\\u[0-9a-fA-F]{4}/.test(text)) {
      setDetectedType('Unicode Escape');
      return;
    }
    setDetectedType('Texto Plano');
  }, [inputText]);

  const handleOp = (op: EncodeOp) => {
    const result = applyOp(inputText, op);
    setOutputText(result);
  };

  const handleJWT = () => {
    try {
      const parts = inputText.split('.');
      if (parts.length !== 3) throw new Error('No es un JWT válido');
      const header = JSON.parse(decodeURIComponent(escape(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')))));
      const payload = JSON.parse(decodeURIComponent(escape(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))));
      setOutputText(`--- HEADER ---\n${JSON.stringify(header, null, 2)}\n\n--- PAYLOAD ---\n${JSON.stringify(payload, null, 2)}\n\n--- SIGNATURE ---\n${parts[2]}`);
    } catch {
      setOutputText('Error: No es un JSON Web Token (JWT) válido.');
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInputText(text);
    } catch {
      alert("No se pudo pegar del portapapeles.");
    }
  };

  const swapInputOutput = () => {
    setInputText(outputText);
    setOutputText(inputText);
  };

  const clearAll = () => {
    setInputText('');
    setOutputText('');
    setDetectedType('Texto Plano');
  };

  const browseHashWordlist = async () => {
    try {
      const selected = await openDialog({
        title: 'Seleccionar Wordlist para Hashcat',
        filters: [{ name: 'Text Files', extensions: ['txt', 'list'] }],
      });
      if (selected && !Array.isArray(selected)) setHashWordlist(selected);
    } catch {}
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target && typeof event.target.result === 'string') {
          setInputText(event.target.result);
        }
      };
      reader.readAsText(file);
    }
  }, []);

  const opsInGroup = useMemo(() => {
    return (Object.keys(OPS) as EncodeOp[]).filter(op => OPS[op].group === activeGroup);
  }, [activeGroup]);

  const isHash = detectedType.startsWith('Hash:');

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar p-3 relative">
      <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-1.5 mb-3">
        <h3 className="text-[10px] tracking-widest font-black text-fuchsia-600 dark:text-fuchsia-400 uppercase">
          🔐 Criptografía
        </h3>
        <span className="text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
          {detectedType}
        </span>
      </div>

      <div
        className="relative shrink-0"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Pega un Hash, Base64, URL, JWT, Hex... o arrastra un archivo .txt aquí"
          className={`w-full h-24 p-2 pr-12 text-xs border rounded-md outline-none font-mono resize-none transition-colors ${
            isDragging
              ? 'bg-fuchsia-50 border-fuchsia-400 dark:bg-fuchsia-900/20 dark:border-fuchsia-500'
              : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 dark:text-slate-200'
          }`}
        />
        <button
          onClick={pasteFromClipboard}
          className="absolute top-2 right-2 text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          title="Pegar"
        >
          📋
        </button>
      </div>

      <div className="flex gap-1 my-2 shrink-0">
        <button
          onClick={clearAll}
          className="px-2 py-0.5 text-[9px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-500 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          Limpiar
        </button>
        <button
          onClick={swapInputOutput}
          disabled={!outputText}
          className="px-2 py-0.5 text-[9px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-500 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-30"
        >
          ↕ Swap
        </button>
        <button
          onClick={() => handleJWT()}
          disabled={detectedType !== 'JSON Web Token (JWT)'}
          className="px-2 py-0.5 text-[9px] font-bold uppercase bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-600 dark:text-fuchsia-400 rounded hover:bg-fuchsia-200 dark:hover:bg-fuchsia-900/50 transition-colors disabled:opacity-30"
        >
          Decodificar JWT
        </button>
      </div>

      <div className="flex border-b border-slate-200 dark:border-slate-800 mb-2 shrink-0">
        {(['encode', 'decode', 'transform'] as const).map(group => (
          <button
            key={group}
            onClick={() => setActiveGroup(group)}
            className={`px-3 py-1 text-[9px] font-bold uppercase transition-colors ${
              activeGroup === group
                ? 'text-fuchsia-600 dark:text-fuchsia-400 border-b-2 border-fuchsia-500'
                : 'text-slate-400 hover:text-slate-600 border-b-2 border-transparent'
            }`}
          >
            {group === 'encode' ? 'Codificar' : group === 'decode' ? 'Decodificar' : 'Transformar'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1.5 mb-3 shrink-0">
        {opsInGroup.map(op => (
          <button
            key={op}
            onClick={() => handleOp(op)}
            className="px-2 py-1.5 text-[10px] font-bold rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-fuchsia-100 dark:hover:bg-fuchsia-900/30 hover:text-fuchsia-600 dark:hover:text-fuchsia-400 transition-colors"
          >
            {OPS[op].icon} {OPS[op].label}
          </button>
        ))}
      </div>

      <div className="relative shrink-0">
        <textarea
          value={outputText}
          readOnly
          placeholder="Resultado..."
          className="w-full h-32 p-2 pr-12 text-[11px] bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/50 rounded-md outline-none text-indigo-900 dark:text-indigo-300 font-mono resize-none custom-scrollbar"
        />
        {outputText && (
          <button
            onClick={() => copyToClipboard(outputText)}
            className="absolute top-2 right-2 text-[10px] font-bold uppercase bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            {copied ? '✓' : '📋'}
          </button>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
        <h3 className="text-[10px] tracking-widest font-black text-rose-600 dark:text-rose-400 uppercase mb-2 flex items-center gap-2">
          🔨 Generador Hashcat
          {isHash && (
            <span className="text-[8px] font-bold text-rose-400 normal-case">
              (Auto-detectado)
            </span>
          )}
        </h3>

        <div className="flex gap-2 mb-2">
          <div className="flex-1">
            <label className="text-[8px] font-bold text-slate-500 uppercase">Hash Mode (-m)</label>
            <input
              type="text"
              value={hashMode}
              onChange={e => setHashMode(e.target.value)}
              placeholder="0 (MD5)"
              className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs font-mono dark:text-white outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="text-[8px] font-bold text-slate-500 uppercase">Ataque (-a)</label>
            <select className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs font-mono dark:text-white outline-none">
              <option value="0">0 (Diccionario)</option>
              <option value="3">3 (Máscara)</option>
              <option value="6">6 (Híbrido)</option>
            </select>
          </div>
        </div>

        <label className="text-[8px] font-bold text-slate-500 uppercase">Wordlist</label>
        <div className="flex gap-1.5 mb-2">
          <input
            type="text"
            value={hashWordlist}
            onChange={e => setHashWordlist(e.target.value)}
            placeholder="Ruta a wordlist..."
            className="flex-1 px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-[10px] font-mono dark:text-white outline-none"
          />
          <button
            onClick={browseHashWordlist}
            className="px-2 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold rounded hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
          >
            Examinar...
          </button>
        </div>

        <div className="flex gap-1.5">
          <button
            onClick={() => copyToClipboard(`hashcat -m ${hashMode} -a 0 '${inputText}' "${hashWordlist}"`)}
            disabled={!inputText}
            className="flex-1 bg-[#0b282c] text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-[#081e21] transition-colors shadow-sm disabled:opacity-40"
          >
            Copiar Comando Hashcat
          </button>
          <a
            href={inputText ? `https://crackstation.net/` : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors text-center"
            title="Buscar en CrackStation"
          >
            🔍 CrackStation
          </a>
        </div>
      </div>
    </div>
  );
}
