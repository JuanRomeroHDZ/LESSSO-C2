import { describe, it, expect } from 'vitest';
// NOTA: Como la lógica de DecodersTool estaba acoplada al componente, 
// lo ideal en la Fase 1 será extraer "applyOp" a "utils/crypto.ts".
// Por ahora, simulamos las pruebas estructurales de lo que hace.

function applyOpFake(input: string, op: string): string {
    switch (op) {
      case 'b64_encode':     return btoa(unescape(encodeURIComponent(input)));
      case 'b64_decode':     return decodeURIComponent(escape(atob(input)));
      case 'url_encode':     return encodeURIComponent(input);
      case 'url_decode':     return decodeURIComponent(input);
      case 'rot13':          return input.replace(/[a-zA-Z]/g, c => String.fromCharCode((c <= 'Z' ? 90 : 122) >= c.charCodeAt(0) + 13 ? c.charCodeAt(0) + 13 : c.charCodeAt(0) - 13));
      default:               return input;
    }
}

describe('Decoders Logic', () => {
  it('Debe codificar y decodificar Base64 correctamente (incluso UTF-8)', () => {
    const original = 'P@$$w0rd! ñandú';
    const encoded = applyOpFake(original, 'b64_encode');
    expect(encoded).toBe('UEAkJHcwcmQhIMOxYW5kw7o=');
    expect(applyOpFake(encoded, 'b64_decode')).toBe(original);
  });

  it('Debe codificar y decodificar URLs correctamente', () => {
    const original = 'http://example.com/?q=hacker script';
    const encoded = applyOpFake(original, 'url_encode');
    expect(encoded).toBe('http%3A%2F%2Fexample.com%2F%3Fq%3Dhacker%20script');
    expect(applyOpFake(encoded, 'url_decode')).toBe(original);
  });

  it('Debe aplicar ROT13 correctamente', () => {
    const original = 'HackTheBox';
    const encoded = applyOpFake(original, 'rot13');
    expect(encoded).toBe('UnpxGurObk');
    expect(applyOpFake(encoded, 'rot13')).toBe(original); // ROT13 doble = original
  });
});
