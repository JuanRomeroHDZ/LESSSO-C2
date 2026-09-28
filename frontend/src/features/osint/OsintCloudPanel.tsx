import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

export function OsintCloudPanel() {
  const [subTab, setSubTab] = useState<'osint' | 'cloud'>('osint')

  // === ESTADOS: OSINT ===
  const [waybackTarget, setWaybackTarget] = useState('')
  const [waybackResults, setWaybackResults] = useState<string[]>([])
  const [isSearchingWayback, setIsSearchingWayback] = useState(false)

  const [s3Bucket, setS3Bucket] = useState('')
  const [s3Result, setS3Result] = useState<{ status: string, color: string, message: string } | null>(null)
  const [isCheckingS3, setIsCheckingS3] = useState(false)

  const [corsTarget, setCorsTarget] = useState('')
  const [corsResult, setCorsResult] = useState<string>('')
  const [isCheckingCors, setIsCheckingCors] = useState(false)

  const [sslTarget, setSslTarget] = useState('')
  const [sslResults, setSslResults] = useState<string[]>([])
  const [isCheckingSsl, setIsCheckingSsl] = useState(false)

  // === ESTADOS: CLOUD & APIS ===
  const [dockerUrl, setDockerUrl] = useState('')
  const [dockerResults, setDockerResults] = useState<string[]>([])
  const [isCheckingDocker, setIsCheckingDocker] = useState(false)

  const [swaggerUrl, setSwaggerUrl] = useState('')
  const [swaggerResults, setSwaggerResults] = useState<string[]>([])
  const [isCheckingSwagger, setIsCheckingSwagger] = useState(false)

  // --- FUNCIONES OSINT ---
  const handleWaybackSearch = async () => {
    if (!waybackTarget) return;
    setIsSearchingWayback(true); setWaybackResults([]);
    try {
      const rawUrl = `https://web.archive.org/cdx/search/cdx?url=*.${waybackTarget}/*&output=json&fl=original&collapse=urlkey&limit=100`;
      const rawResponse = await invoke<string>('http_get', { url: rawUrl });
      const data = JSON.parse(rawResponse);
      const urls = data.slice(1).map((row: string[]) => row[0]);
      setWaybackResults(urls.length > 0 ? urls : ['No se encontraron endpoints en el historial.']);
    } catch (err) { setWaybackResults([`Error o dominio sin historial: ${err}`]); } 
    finally { setIsSearchingWayback(false); }
  }

  const handleS3Check = async () => {
    if (!s3Bucket) return;
    setIsCheckingS3(true); setS3Result(null);
    try {
      const url = `https://${s3Bucket}.s3.amazonaws.com/`;
      await fetch(url, { method: 'GET', mode: 'no-cors' });
      setS3Result({ status: 'ENCONTRADO', color: 'text-yellow-500', message: `El bucket existe. Verifica manualmente si es público: ${url}` });
    } catch (err) { setS3Result({ status: 'NO ENCONTRADO', color: 'text-slate-400', message: 'El bucket no existe o no tiene resolución DNS pública.' }); } 
    finally { setIsCheckingS3(false); }
  }

  const handleCorsCheck = async () => {
    if (!corsTarget) return;
    setIsCheckingCors(true); setCorsResult('Enviando petición OPTIONS maliciosa...\n');
    try {
      let target = corsTarget;
      if (!target.startsWith('http')) target = 'https://' + target;
      const rawResponse = await invoke<string>('http_cors_check', { url: target });
      const allowOriginMatch = rawResponse.match(/Access-Control-Allow-Origin:\s*([^\r\n]+)/i);
      const allowCredsMatch = rawResponse.match(/Access-Control-Allow-Credentials:\s*([^\r\n]+)/i);
      const allowOrigin = allowOriginMatch ? allowOriginMatch[1] : null;
      const allowCreds = allowCredsMatch ? allowCredsMatch[1] : null;
      let res = `[+] Petición exitosa a ${target}\n[>] Access-Control-Allow-Origin: ${allowOrigin || 'Ausente'}\n[>] Access-Control-Allow-Credentials: ${allowCreds || 'Ausente'}\n\n`;
      if (allowOrigin === '*' || allowOrigin === 'https://evil-juanmap-domain.com') {
        res += `[!] VULNERABILIDAD CORS DETECTADA: El servidor confía en orígenes arbitrarios.\n`;
        if (allowCreds === 'true') res += `[!] CRÍTICO: Permite credenciales (Cookies/Tokens) desde el origen falso.`;
      } else { res += `[+] SEGURO: El servidor no reflejó el origen falso ni usó comodines inseguros.`; }
      setCorsResult(res);
    } catch (err) { setCorsResult(`[-] Error de conexión.\nError: ${err}`); } 
    finally { setIsCheckingCors(false); }
  }

  const handleSslCheck = async () => {
    if (!sslTarget) return;
    setIsCheckingSsl(true); setSslResults(['Conectando al puerto 443 y extrayendo certificado...']);
    try {
      const cleanDomain = sslTarget.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const sans = await invoke<string[]>('extract_ssl_sans', { domain: cleanDomain });
      setSslResults(sans.length > 0 ? [`[+] Subdominios SAN ocultos descubiertos en ${cleanDomain}:`, ...sans] : ['No se encontraron subdominios alternativos en el certificado.']);
    } catch (err) { setSslResults([`Error: ${err}`]); } 
    finally { setIsCheckingSsl(false); }
  }

  // --- FUNCIONES CLOUD & APIS (Corregidas y añadidas) ---
  const handleDockerCheck = async () => {
    if (!dockerUrl) return;
    setIsCheckingDocker(true); setDockerResults(['Consultando Registry API...']);
    try {
      let cleanUrl = dockerUrl.replace(/\/$/, '');
      if (!cleanUrl.startsWith('http')) cleanUrl = 'http://' + cleanUrl;
      const rawResponse = await invoke<string>('http_get', { url: `${cleanUrl}/v2/_catalog` });
      const data = JSON.parse(rawResponse);
      const repos = data.repositories || [];
      if (repos.length === 0) {
        setDockerResults(['[+] Registry accesible pero no contiene repositorios públicos.']);
        return;
      }
      let output: string[] = [`[!] ALERTA: Registry Abierto. ${repos.length} Repositorios encontrados:`];
      for (const repo of repos) {
        try {
          const rawTags = await invoke<string>('http_get', { url: `${cleanUrl}/v2/${repo}/tags/list` });
          const tagData = JSON.parse(rawTags);
          output.push(` 📦 ${repo} -> Tags: [${(tagData.tags || []).join(', ')}]`);
        } catch(e) { output.push(` 📦 ${repo} -> (Error extrayendo tags)`); }
      }
      setDockerResults(output);
    } catch (err) { setDockerResults([`Error: No parece ser un Docker Registry válido o requiere autenticación. (${err})`]); } 
    finally { setIsCheckingDocker(false); }
  }

  const handleSwaggerCheck = async () => {
    if (!swaggerUrl) return;
    setIsCheckingSwagger(true); setSwaggerResults(['Descargando y parseando esquema OpenAPI...']);
    try {
      let target = swaggerUrl;
      if (!target.startsWith('http')) target = 'https://' + target;
      const rawResponse = await invoke<string>('http_get', { url: target });
      const data = JSON.parse(rawResponse);
      let output: string[] = [
        `[+] API: ${data.info?.title || 'Sin Título'} (v${data.info?.version || '?'})`,
        `[+] Host Base: ${(data.servers || []).map((s:any)=>s.url).join(', ') || data.host || 'No especificado'}\n`
      ];
      if (data.paths) {
        for (const [path, methods] of Object.entries(data.paths)) {
          for (const method of Object.keys(methods as any)) {
            let colorPrefix = method === 'get' ? '🔵 GET   ' : method === 'post' ? '🟢 POST  ' : method === 'put' ? '🟡 PUT   ' : method === 'delete' ? '🔴 DELETE' : `⚪ ${method.toUpperCase()}`;
            output.push(`${colorPrefix} -> ${path}`);
          }
        }
      } else { output.push('No se encontraron rutas (paths) en el esquema.'); }
      setSwaggerResults(output);
    } catch (err) { setSwaggerResults([`Error: No se pudo parsear el archivo JSON. Verifica la URL. (${err})`]); } 
    finally { setIsCheckingSwagger(false); }
  }

  return (
    <section className="flex flex-col h-full space-y-4">
      <div className="flex space-x-2 border-b border-slate-200 dark:border-slate-800 pb-2 shrink-0">
        <button onClick={() => setSubTab('osint')} className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase transition-colors ${subTab === 'osint' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400' : 'bg-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>🌍 Web & OSINT</button>
        <button onClick={() => setSubTab('cloud')} className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase transition-colors ${subTab === 'cloud' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-400' : 'bg-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>☁️ APIs & Contenedores</button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">
        {subTab === 'osint' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* SSL SAN Extractor */}
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 flex flex-col">
                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase mb-4 flex items-center"><svg className="w-4 h-4 mr-2 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>SSL/TLS SAN Extractor</h2>
                <div className="flex gap-2 shrink-0 mb-4">
                  <input type="text" value={sslTarget} onChange={e => setSslTarget(e.target.value)} placeholder="Ej: google.com" className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm font-mono dark:text-white outline-none" />
                  <button onClick={handleSslCheck} disabled={!sslTarget || isCheckingSsl} className="px-6 py-2 bg-emerald-600 disabled:bg-emerald-400 text-white text-xs font-bold rounded shadow-sm hover:bg-emerald-500 transition-colors whitespace-nowrap"> {isCheckingSsl ? 'Extrayendo...' : 'Buscar SANs'} </button>
                </div>
                <div className="bg-slate-900 rounded-md border border-slate-800 overflow-y-auto custom-scrollbar p-3 h-32">
                  <ul className="space-y-1">{sslResults.map((line, i) => <li key={i} className={`text-[11px] font-mono break-all ${line.startsWith('[+]') ? 'text-emerald-400 font-bold mb-2' : 'text-slate-300'}`}>{line}</li>)}</ul>
                </div>
              </div>

              {/* CORS */}
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase mb-4 flex items-center"><svg className="w-4 h-4 mr-2 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>Auditoría CORS Avanzada</h2>
                <div className="space-y-3">
                  <input type="text" value={corsTarget} onChange={e => setCorsTarget(e.target.value)} placeholder="https://api.objetivo.com/data" className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm dark:text-white outline-none font-mono" />
                  <button onClick={handleCorsCheck} disabled={!corsTarget || isCheckingCors} className="w-full px-4 py-2 bg-rose-600 disabled:bg-rose-400 text-white text-xs font-bold rounded shadow-sm hover:bg-rose-500 transition-colors"> {isCheckingCors ? 'Enviando Probe...' : 'Inyectar Origen Falso'} </button>
                  <textarea value={corsResult} readOnly placeholder="Resultados CORS..." className="w-full h-24 p-3 text-[10px] bg-slate-900 text-emerald-400 rounded-md outline-none font-mono resize-none custom-scrollbar" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* S3 */}
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase mb-4 flex items-center"><svg className="w-4 h-4 mr-2 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>Escáner de Buckets S3</h2>
                <div className="space-y-3">
                  <input type="text" value={s3Bucket} onChange={e => setS3Bucket(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="Nombre del bucket (ej. mi-empresa)" className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm dark:text-white outline-none" />
                  <button onClick={handleS3Check} disabled={!s3Bucket || isCheckingS3} className="w-full px-4 py-2 bg-orange-600 disabled:bg-orange-400 text-white text-xs font-bold rounded shadow-sm hover:bg-orange-500 transition-colors"> {isCheckingS3 ? 'Verificando...' : 'Comprobar Existencia S3'} </button>
                  {s3Result && ( <div className="mt-4 p-3 bg-slate-100 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700"> <span className={`text-[11px] font-bold block ${s3Result.color}`}>{s3Result.status}</span> <span className="text-[11px] text-slate-500 mt-1 block">{s3Result.message}</span> </div> )}
                </div>
              </div>

              {/* Wayback */}
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 flex flex-col">
                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase mb-4 flex items-center shrink-0"><svg className="w-4 h-4 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>Wayback Machine (Endpoints)</h2>
                <div className="flex gap-2 shrink-0 mb-4">
                  <input type="text" value={waybackTarget} onChange={e => setWaybackTarget(e.target.value)} placeholder="ej. tesla.com" className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm dark:text-white outline-none" />
                  <button onClick={handleWaybackSearch} disabled={!waybackTarget || isSearchingWayback} className="px-6 py-2 bg-blue-600 disabled:bg-blue-400 text-white text-xs font-bold rounded shadow-sm hover:bg-blue-500 transition-colors whitespace-nowrap"> {isSearchingWayback ? 'Buscando...' : 'Extraer'} </button>
                </div>
                <div className="flex-1 bg-slate-900 rounded-md border border-slate-800 overflow-y-auto custom-scrollbar p-3 h-32">
                  <ul className="space-y-1"> {waybackResults.map((url, i) => ( <li key={i} className="text-[10px] font-mono text-sky-400 break-all"><a href={url.startsWith('http') ? url : `http://${url}`} target="_blank" rel="noreferrer" className="hover:text-white hover:underline">{url}</a></li> ))} </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {subTab === 'cloud' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 flex flex-col">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase mb-4 flex items-center"><svg className="w-4 h-4 mr-2 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>Mapeo de Docker Registries Expuestos</h2>
              <div className="flex gap-2 shrink-0 mb-4">
                <input type="text" value={dockerUrl} onChange={e => setDockerUrl(e.target.value)} placeholder="Ej: http://10.0.0.5:5000" className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm font-mono dark:text-white outline-none" />
                <button onClick={handleDockerCheck} disabled={!dockerUrl || isCheckingDocker} className="px-6 py-2 bg-sky-600 disabled:bg-sky-400 text-white text-xs font-bold rounded shadow-sm hover:bg-sky-500 transition-colors whitespace-nowrap">{isCheckingDocker ? 'Conectando...' : 'Extraer Imágenes'}</button>
              </div>
              <div className="bg-slate-900 rounded-md border border-slate-800 overflow-y-auto custom-scrollbar p-3 min-h-[150px] max-h-[250px]">
                <ul className="space-y-1"> {dockerResults.map((line, i) => ( <li key={i} className={`text-[11px] font-mono break-all ${line.includes('ALERTA') ? 'text-red-400 font-bold' : 'text-emerald-400'}`}>{line}</li> ))} </ul>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 flex flex-col">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase mb-4 flex items-center"><svg className="w-4 h-4 mr-2 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>Descubrimiento de APIs REST (Swagger/OpenAPI)</h2>
              <div className="flex gap-2 shrink-0 mb-4">
                <input type="text" value={swaggerUrl} onChange={e => setSwaggerUrl(e.target.value)} placeholder="Ej: petstore.swagger.io/v2/swagger.json" className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm font-mono dark:text-white outline-none" />
                <button onClick={handleSwaggerCheck} disabled={!swaggerUrl || isCheckingSwagger} className="px-6 py-2 bg-emerald-600 disabled:bg-emerald-400 text-white text-xs font-bold rounded shadow-sm hover:bg-emerald-500 transition-colors whitespace-nowrap">{isCheckingSwagger ? 'Descargando...' : 'Parsear Endpoints'}</button>
              </div>
              <div className="bg-slate-900 rounded-md border border-slate-800 overflow-y-auto custom-scrollbar p-3 min-h-[200px] max-h-[400px]">
                <ul className="space-y-1"> {swaggerResults.map((line, i) => ( <li key={i} className={`text-[11px] font-mono break-all ${line.startsWith('[+]') ? 'text-sky-300 font-bold mb-2' : 'text-slate-300'}`}>{line}</li> ))} </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
