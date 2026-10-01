// ==========================================================
// LESSSO C2 — Parser de flags de Nmap / RustScan
// ----------------------------------------------------------
// Convierte `commandString` en una estructura legible para el
// reporte "Scope & Metodología". No pretende ser un parser
// completo de shell — solo extraer flags y su descripción.
//
// Ejemplo:
//   nmap -sS -sV -T4 -p- --script=vuln 10.10.10.5
//   → {
//       tool: 'nmap',
//       target: '10.10.10.5',
//       flags: [
//         { flag: '-sS',  desc: 'TCP SYN scan (stealth)' },
//         { flag: '-sV',  desc: 'Detección de versiones de servicio' },
//         { flag: '-T4',  desc: 'Timing template agresivo (T4)' },
//         { flag: '-p-',  desc: 'Escaneo de los 65535 puertos TCP' },
//         { flag: '--script=vuln', desc: 'Ejecuta scripts NSE de la categoría vuln' },
//       ],
//     }
// ==========================================================

export interface ParsedFlag {
  flag: string
  desc: string
}

export interface ParsedCommand {
  tool: 'nmap' | 'rustscan' | 'unknown'
  target: string
  flags: ParsedFlag[]
  /** Argumentos crudos sin parsear (por si el reporte los quiere mostrar). */
  raw: string
}

// Diccionario de descripciones. Clave = flag exacto (case-sensitive
// salvo los que empiezan con `--` que van en minúscula).
const FLAG_DESCRIPTIONS: Record<string, string> = {
  // Modos de escaneo
  '-sS': 'TCP SYN scan (stealth, requiere privilegios)',
  '-sT': 'TCP connect scan (sin privilegios)',
  '-sU': 'UDP scan',
  '-sA': 'TCP ACK scan (mapeo de firewall)',
  '-sW': 'TCP Window scan',
  '-sM': 'TCP Maimon scan',
  '-sN': 'TCP Null scan',
  '-sF': 'TCP FIN scan',
  '-sX': 'TCP Xmas scan',
  '-sn': 'Ping scan (sin escaneo de puertos)',
  '-sV': 'Detección de versiones de servicio',
  '-sC': 'Ejecuta scripts NSE de la categoría default',
  '-O': 'Detección de sistema operativo',
  '-A': 'Modo agresivo (OS + versiones + scripts + traceroute)',

  // Puertos
  '-p-': 'Escaneo de los 65535 puertos TCP',
  '-p': 'Especificación manual de puertos',
  '-F': 'Fast scan (top 100 puertos)',
  '--top-ports': 'Escaneo de los N puertos más comunes',
  '--exclude-ports': 'Excluye puertos del escaneo',

  // Timing / performance
  '-T0': 'Timing paranoico (T0) — evasión IDS',
  '-T1': 'Timing sigiloso (T1)',
  '-T2': 'Timing educado (T2) — reduce carga',
  '-T3': 'Timing normal (T3, default)',
  '-T4': 'Timing agresivo (T4) — recomendado en LAN',
  '-T5': 'Timing insane (T5) — muy agresivo',
  '--min-rate': 'Tasa mínima de paquetes por segundo',
  '--max-rate': 'Tasa máxima de paquetes por segundo',
  '--min-parallelism': 'Paralelismo mínimo de sondas',
  '--max-retries': 'Reintentos máximos por puerto',

  // Scripts NSE
  '--script': 'Ejecuta scripts NSE (categoría o nombre)',
  '--script-args': 'Argumentos para los scripts NSE',
  '--script-trace': 'Traza la ejecución de scripts NSE',

  // Evasión
  '-f': 'Fragmenta los paquetes (evasión)',
  '--mtu': 'Tamaño de MTU personalizado',
  '-D': 'Señuelos (decoys) para el escaneo',
  '-S': 'IP de origen falsa',
  '-e': 'Interfaz de red a usar',
  '--spoof-mac': 'MAC address falsa',
  '--data-length': 'Longitud extra de datos',
  '--badsum': 'Checksum inválido (para detectar firewalls)',
  '--proxies': 'Cadena de proxies',

  // Output
  '-oN': 'Salida normal a archivo',
  '-oX': 'Salida XML a archivo',
  '-oG': 'Salida greppable a archivo',
  '-oA': 'Salida en todos los formatos',
  '-v': 'Modo verbose',
  '-vv': 'Modo muy verbose',
  '-d': 'Modo debug',
  '--reason': 'Muestra la razón del estado del puerto',
  '--open': 'Muestra solo puertos abiertos',

  // Host discovery
  '-Pn': 'Sin ping (asume host up)',
  '-PS': 'TCP SYN ping',
  '-PA': 'TCP ACK ping',
  '-PU': 'UDP ping',
  '-PE': 'ICMP echo ping',
  '-PP': 'ICMP timestamp ping',
  '-PM': 'ICMP netmask ping',
  '--traceroute': 'Traceroute a cada host',
  '--disable-arp-ping': 'Deshabilita ARP ping',
  '--send-ip': 'Fuerza envío a nivel IP',

  // Misc
  '--privileged': 'Asume que el usuario es root',
  '--unprivileged': 'Asume que el usuario NO es root',
  '--system-dns': 'Usa el resolver del sistema',
  '--dns-servers': 'Servidores DNS personalizados',
  '--randomize-hosts': 'Aleatoriza el orden de hosts',
  '-n': 'Sin resolución DNS',
  '-R': 'Resolución DNS para todos los hosts',
  '--resolve-all': 'Resuelve todos los hosts',

  // RustScan
  '-a': 'Target(s) a escanear (RustScan)',
  '-b': 'Batch size de puertos por ronda (RustScan)',
  '--accessible': 'Modo accesible (sin colores/animaciones, RustScan)',
  '--ulimit': 'Límite de file descriptors (RustScan)',
}

/**
 * Dado un token tipo `-sS` o `--script=vuln`, devuelve la
 * descripción correspondiente.
 */
function describeFlag(token: string): string {
  if (FLAG_DESCRIPTIONS[token]) return FLAG_DESCRIPTIONS[token]

  // Flags con valor separado por `=`: `--script=vuln`
  const eqIdx = token.indexOf('=')
  if (eqIdx > 0) {
    const key = token.slice(0, eqIdx).toLowerCase()
    const val = token.slice(eqIdx + 1)
    if (FLAG_DESCRIPTIONS[key]) {
      return `${FLAG_DESCRIPTIONS[key]} → "${val}"`
    }
  }

  // Flags combinadas tipo `-sST4` (raro, pero posible)
  if (/^-[a-zA-Z]{2,}$/.test(token) && !token.startsWith('--')) {
    return 'Flags combinadas (ver comando)'
  }

  return 'Flag no reconocida (ver documentación de nmap)'
}

/**
 * Heurística para detectar el target: primer token que no empieza
 * con `-`, no es el nombre de la herramienta, no es un valor de
 * flag (`--script=vuln` cuenta como flag), y no está después de
 * un `--` (que separa args de RustScan).
 */
function extractTarget(tokens: string[]): string {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (i === 0) continue // skip tool
    if (t === '--') continue
    if (t.startsWith('-')) continue
    // Valores que pertenecen a un flag anterior (ej: -p 80,443)
    const prev = tokens[i - 1]
    if (prev && /^(-p|--top-ports|--exclude-ports|--script-args|--mtu|--data-length|--proxies|--dns-servers|--min-rate|--max-rate|--min-parallelism|--max-retries|-D|-S|-e|--spoof-mac|-b|--ulimit|-a)$/.test(prev)) {
      continue
    }
    // Si contiene `=` es un flag con valor
    if (t.includes('=')) continue
    return t
  }
  return '<sin target>'
}

/**
 * Parsea un `commandString` completo.
 */
export function parseFlags(commandString: string): ParsedCommand {
  const raw = (commandString || '').trim()
  if (!raw) {
    return { tool: 'unknown', target: '<sin target>', flags: [], raw: '' }
  }

  // Tokenizamos respetando comillas simples/dobles.
  const tokens = tokenize(raw)
  const first = (tokens[0] || '').toLowerCase()

  let tool: ParsedCommand['tool'] = 'unknown'
  if (first === 'nmap') tool = 'nmap'
  else if (first === 'rustscan') tool = 'rustscan'

  const flags: ParsedFlag[] = []
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i]
    if (t === '--') break
    if (!t.startsWith('-')) continue
    flags.push({ flag: t, desc: describeFlag(t) })
  }

  return {
    tool,
    target: extractTarget(tokens),
    flags,
    raw,
  }
}

/**
 * Tokenizador simple que respeta comillas simples y dobles.
 * No maneja escapes con backslash (no son comunes en nmap).
 */
function tokenize(input: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: '"' | "'" | null = null

  for (let i = 0; i < input.length; i++) {
    const c = input[i]

    if (quote) {
      if (c === quote) {
        quote = null
      } else {
        cur += c
      }
      continue
    }

    if (c === '"' || c === "'") {
      quote = c as '"' | "'"
      continue
    }

    if (/\s/.test(c)) {
      if (cur) {
        out.push(cur)
        cur = ''
      }
      continue
    }

    cur += c
  }

  if (cur) out.push(cur)
  return out
}
