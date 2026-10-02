export type EncodeOp = 
  | 'b64_encode' | 'b64_decode' 
  | 'url_encode' | 'url_decode' 
  | 'hex_encode' | 'hex_decode' 
  | 'rot13' 
  | 'html_encode' | 'html_decode' 
  | 'binary_encode' | 'binary_decode' 
  | 'base32_encode' | 'base32_decode' 
  | 'unicode_encode' | 'unicode_decode';

export type EncodeGroup = 'encode' | 'decode' | 'transform';

export const HASH_PATTERNS: Array<{ regex: RegExp; name: string; hashcatMode: string }> = [
  { regex: /^[a-fA-F0-9]{32}$/,                       name: 'MD5',          hashcatMode: '0' },
  { regex: /^[a-fA-F0-9]{40}$/,                       name: 'SHA1',         hashcatMode: '100' },   { regex: /^[a-fA-F0-9]{56}$/,                       name: 'SHA224',       hashcatMode: '1300' },
  { regex: /^[a-fA-F0-9]{64}$/,                       name: 'SHA256',       hashcatMode: '1400' },   { regex: /^[a-fA-F0-9]{96}$/,                       name: 'SHA384',       hashcatMode: '10800' },
  { regex: /^[a-fA-F0-9]{128}$/,                      name: 'SHA512',       hashcatMode: '1700' },   { regex: /^\$1\$[a-zA-Z0-9./]+\$[a-zA-Z0-9./]+$/,   name: 'MD5 Crypt',    hashcatMode: '500' },
  { regex: /^\$2[aby]\$\d{2}\$[a-zA-Z0-9./]+$/,       name: 'Bcrypt',       hashcatMode: '3200' },   { regex: /^\$5\$[a-zA-Z0-9./]+\$[a-zA-Z0-9./]+$/,   name: 'SHA256 Crypt', hashcatMode: '7400' },
  { regex: /^\$6\$[a-zA-Z0-9./]+\$[a-zA-Z0-9./]+$/,   name: 'SHA512 Crypt', hashcatMode: '1800' },   { regex: /^[a-fA-F0-9]{32}:[a-zA-Z0-9]+$/,          name: 'MD5 + Salt',   hashcatMode: '20' },
  { regex: /^sha1\$[a-zA-Z0-9]+\$[a-fA-F0-9]{40}$/,   name: 'SHA1 + Salt',  hashcatMode: '120' },   { regex: /^\{SSHA\}[a-zA-Z0-9+/=]+$/,               name: 'SSHA',         hashcatMode: '111' },
];

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

export function applyOp(input: string, op: EncodeOp): string {
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
