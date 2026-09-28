import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { useScanStore } from '../../core/store/useScanStore'

export function ScanConfig() {
  const [configTab, setConfigTab] = useState<'basic' | 'advanced' | 'evasion' | 'payloads' | 'output'>('basic')
  const [newProfileName, setNewProfileName] = useState('')
  
  const { 
    scanType, timing, useOSDetection, useServiceDetection, scanAllPorts, nseCategory, nseArgs, isVerbose,
    excludeTargets, topPorts, customPorts, fastMode, discoveryMode, minRate, maxRetries, networkInterface, aggressiveMode, traceroute, reason, packetTrace, dnsResolution, hostTimeout, scanDelay,
    versionIntensity, maxOsTries,
    evasionFrag, evasionMTU, evasionDecoy, evasionMac, evasionSourcePort, evasionSpoofIp, badsum, randomizeHosts, zombieIp, ftpBounce,
    customTcpFlags, proxies, customDns, dataString, dataHex, dataLength,
    savedProfiles, autoScanInterval, isScanning,
    onlyOpenPorts, osScanGuess, scriptDefault, minHostgroup, maxHostgroup,
    nmapOutputFormat, nmapOutputPrefix, nmapOutputDir,
    setScanType, setTiming, setDiscoveryMode, setField, toggleOSDetection, toggleServiceDetection, toggleAllPorts, toggleVerbose, setNseCategory, setNseArgs,
    saveCustomProfile, loadCustomProfile, deleteCustomProfile
  } = useScanStore()

  const selectOutputDir = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && !Array.isArray(selected)) setField('nmapOutputDir', selected);
    } catch (err) { console.error(err); }
  }

  return (
    <section className="flex flex-col h-full relative">
      <div className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-2 shrink-0">
         <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">⚙️ Configuración del Motor</h2>
      </div>

      <div className="flex border-b border-slate-200 dark:border-slate-700 shrink-0 overflow-x-auto custom-scrollbar px-2 pt-2 bg-white dark:bg-slate-950">
        <button onClick={() => setConfigTab('basic')} className={`pb-1.5 px-2 text-[9px] font-bold uppercase border-b-2 ${configTab === 'basic' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Básico</button>
        <button onClick={() => setConfigTab('advanced')} className={`pb-1.5 px-2 text-[9px] font-bold uppercase border-b-2 ${configTab === 'advanced' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Avz.</button>
        <button onClick={() => setConfigTab('evasion')} className={`pb-1.5 px-2 text-[9px] font-bold uppercase border-b-2 ${configTab === 'evasion' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Evasión</button>
        <button onClick={() => setConfigTab('payloads')} className={`pb-1.5 px-2 text-[9px] font-bold uppercase border-b-2 ${configTab === 'payloads' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Red</button>
        <button onClick={() => setConfigTab('output')} className={`pb-1.5 px-2 text-[9px] font-bold uppercase border-b-2 ${configTab === 'output' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Out</button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        {scanType === 'ping' && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border-l-2 border-amber-500 text-amber-700 dark:text-amber-400 p-1.5 text-[10px] rounded shrink-0">
            <p className="font-bold flex items-center">Ping Sweep (-sn) Activo. Sin escaneo de puertos.</p>
          </div>
        )}

        {configTab === 'basic' && (
          <div className="space-y-3 animate-in fade-in">
            <div className="space-y-1"><label className="text-[9px] font-bold text-slate-500 uppercase">Protocolo Base</label><div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded" title="TCP SYN (Rápido/Sigiloso), TCP Connect (Lento/Fiable), UDP (Servicios como DNS/SNMP)">{(['syn', 'tcp', 'udp', 'sctp', 'ping'] as const).map((type) => (<button key={type} onClick={() => setScanType(type)} className={`flex-1 py-1 text-[10px] font-bold rounded-sm uppercase ${scanType === type ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-500'}`}>{type}</button>))}</div></div>
            <div className="space-y-1 p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded"><label className="text-[9px] font-bold text-slate-500 uppercase flex justify-between" title="T0 (Paranoico) a T5 (Insano). HTB suele soportar T4 bien."><span>Plantilla Rate (T)</span> <span>T{timing}</span></label><input type="range" min="0" max="5" step="1" value={timing} onChange={(e) => setTiming(Number(e.target.value))} className="w-full accent-indigo-600" /></div>
            <div className="grid grid-cols-2 gap-2">
              <label title="Escanea los 100 puertos más comunes (-F)" className="flex items-center space-x-1.5 cursor-pointer bg-slate-50 dark:bg-slate-800/50 px-2 py-1 rounded border border-slate-200 dark:border-slate-700/50"><input type="checkbox" checked={fastMode} disabled={scanType==='ping' || scanAllPorts} onChange={() => { setField('fastMode', !fastMode); if(!fastMode){ setField('topPorts',''); setField('customPorts',''); } }} className="rounded text-indigo-600 disabled:opacity-30 w-3 h-3" /><span className="text-[9px] font-bold uppercase dark:text-slate-300">Fast (-F)</span></label>
              <div className="space-y-0.5"><input type="text" value={topPorts} disabled={scanType==='ping' || scanAllPorts || fastMode} onChange={(e) => { setField('topPorts', e.target.value); setField('customPorts',''); }} placeholder="Top Pts (100)" className="w-full px-2 py-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded dark:text-slate-200 outline-none disabled:opacity-30" title="Escanea el top N de puertos TCP/UDP" /></div>
              <div className="space-y-0.5 col-span-2"><input type="text" value={customPorts} disabled={scanType==='ping' || scanAllPorts || fastMode} onChange={(e) => { setField('customPorts', e.target.value); setField('topPorts',''); }} placeholder="Puertos Custom (-p) Ej: 22,80,443" className="w-full px-2 py-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded dark:text-slate-200 outline-none disabled:opacity-30 font-mono" /></div>
            </div>
            <div className="space-y-0.5"><label className="text-[9px] font-bold text-slate-500 uppercase">Excluir IPs</label><input type="text" value={excludeTargets} onChange={(e) => setField('excludeTargets', e.target.value)} placeholder="192.168.1.1" className="w-full px-2 py-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded dark:text-slate-200 outline-none" title="Ignora estos hosts durante el escaneo (--exclude)" /></div>
            <div className="space-y-0.5"><label className="text-[9px] font-bold text-slate-500 uppercase">Descubrimiento Inicial</label><select value={discoveryMode} onChange={(e) => setDiscoveryMode(e.target.value)} className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-[10px] dark:text-slate-200 outline-none" title="Si el objetivo bloquea Pings, usa '-Pn' para forzar el escaneo de puertos de todas formas."><option value="">Auto</option><option value="-Pn">No Ping (-Pn)</option><option value="-PR">ARP Ping (-PR)</option><option value="-PE">ICMP Echo (-PE)</option></select></div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <label className="flex items-center space-x-1.5 cursor-pointer" title="Intenta detectar el Sistema Operativo del objetivo (-O)"><input type="checkbox" checked={useOSDetection} disabled={scanType === 'ping'} onChange={toggleOSDetection} className="rounded text-indigo-600 disabled:opacity-30 w-3 h-3" /><span className={`text-[10px] font-medium ${scanType === 'ping' ? 'text-slate-400 line-through' : 'dark:text-slate-300'}`}>OS (-O)</span></label>
              <label className="flex items-center space-x-1.5 cursor-pointer" title="Consulta los banners para adivinar la versión exacta de la aplicación corriendo (-sV)"><input type="checkbox" checked={useServiceDetection} disabled={scanType === 'ping'} onChange={toggleServiceDetection} className="rounded text-indigo-600 disabled:opacity-30 w-3 h-3" /><span className={`text-[10px] font-medium ${scanType === 'ping' ? 'text-slate-400 line-through' : 'dark:text-slate-300'}`}>Vers. (-sV)</span></label>
              <label className="flex items-center space-x-1.5 cursor-pointer" title="Escanea los 65,535 puertos completos. Puede tardar mucho en red remota."><input type="checkbox" checked={scanAllPorts} disabled={scanType === 'ping'} onChange={() => {toggleAllPorts(); setField('fastMode', false);}} className="rounded text-indigo-600 disabled:opacity-30 w-3 h-3" /><span className={`text-[10px] font-medium ${scanType === 'ping' ? 'text-slate-400 line-through' : 'dark:text-slate-300'}`}>Todos (-p-)</span></label>
              <label className="flex items-center space-x-1.5 cursor-pointer" title="Oculta puertos filtrados/cerrados del output (--open)"><input type="checkbox" checked={onlyOpenPorts} disabled={scanType === 'ping'} onChange={() => setField('onlyOpenPorts', !onlyOpenPorts)} className="rounded text-indigo-600 disabled:opacity-30 w-3 h-3" /><span className={`text-[10px] font-medium ${scanType === 'ping' ? 'text-slate-400 line-through' : 'dark:text-slate-300'}`}>Solo Open</span></label>
              <label className="flex items-center space-x-1.5 cursor-pointer" title="Muestra resultados en tiempo real en la terminal (-v)"><input type="checkbox" checked={isVerbose} onChange={toggleVerbose} className="rounded text-indigo-600 w-3 h-3" /><span className="text-[10px] font-medium dark:text-slate-300">Verbose (-v)</span></label>
            </div>
            
            <div className="mt-2 p-2 bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700/50 rounded space-y-1">
              <label className="text-[9px] font-bold text-slate-500 uppercase">Mis Perfiles</label>
              <div className="flex gap-1.5">
                <input type="text" value={newProfileName} onChange={(e) => setNewProfileName(e.target.value)} placeholder="Nombre..." className="flex-1 px-2 py-1 text-[10px] border border-slate-300 dark:border-slate-600 rounded outline-none dark:bg-slate-900 dark:text-white" />
                <button onClick={() => { if(newProfileName) { saveCustomProfile(newProfileName); setNewProfileName(''); } }} className="px-2 py-1 bg-indigo-600 text-white text-[10px] font-bold uppercase rounded">+</button>
              </div>
              {savedProfiles.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {savedProfiles.map(p => (
                    <div key={p.id} className="flex items-center bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded overflow-hidden">
                      <button onClick={() => loadCustomProfile(p.id)} className="px-1.5 py-0.5 text-[8px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100">{p.name}</button>
                      <button onClick={() => deleteCustomProfile(p.id)} className="px-1 py-0.5 text-[8px] text-red-500 border-l border-slate-200">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {configTab === 'advanced' && (
          <div className="space-y-3 animate-in fade-in">
            <div className="grid grid-cols-2 gap-1.5 bg-indigo-50 dark:bg-indigo-900/10 p-2 rounded border border-indigo-100 dark:border-indigo-800/50">
              <label className="flex items-center space-x-1.5 cursor-pointer" title="Habilita OS, Versiones, Scripts Default y Traceroute todo de golpe (-A)"><input type="checkbox" checked={aggressiveMode} onChange={() => setField('aggressiveMode', !aggressiveMode)} className="rounded text-indigo-600 w-3 h-3" /><span className="text-[9px] font-bold dark:text-slate-300 uppercase">Agresivo (-A)</span></label>
              <label className="flex items-center space-x-1.5 cursor-pointer" title="Lanza scripts seguros por defecto (como banner grabbing, smb-os-discovery) (-sC)"><input type="checkbox" checked={scriptDefault} disabled={scanType === 'ping' || aggressiveMode} onChange={() => setField('scriptDefault', !scriptDefault)} className="rounded text-indigo-600 disabled:opacity-30 w-3 h-3" /><span className="text-[9px] font-bold dark:text-slate-300 uppercase">Def. Scripts (-sC)</span></label>
              <label className="flex items-center space-x-1.5 cursor-pointer" title="Imprime en pantalla cada paquete de red enviado y recibido (--packet-trace)"><input type="checkbox" checked={packetTrace} onChange={() => setField('packetTrace', !packetTrace)} className="rounded text-indigo-600 w-3 h-3" /><span className="text-[9px] font-bold dark:text-slate-300 uppercase">Packet Trace</span></label>
              <label className="flex items-center space-x-1.5 cursor-pointer" title="Rastrea la ruta de red hacia el objetivo (--traceroute)"><input type="checkbox" checked={traceroute} onChange={() => setField('traceroute', !traceroute)} className="rounded text-indigo-600 w-3 h-3" /><span className="text-[9px] font-bold dark:text-slate-300 uppercase">Traceroute</span></label>
              <label className="flex items-center space-x-1.5 cursor-pointer" title="Muestra el motivo exacto por el cual Nmap consideró el puerto abierto/cerrado (--reason)"><input type="checkbox" checked={reason} onChange={() => setField('reason', !reason)} className="rounded text-indigo-600 w-3 h-3" /><span className="text-[9px] font-bold dark:text-slate-300 uppercase">Razón</span></label>
            </div>
            <div className="space-y-1.5 p-2 border rounded transition-colors bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/50">
              <label className="text-[9px] font-bold text-slate-500 uppercase flex justify-between" title="Nmap Scripting Engine (Lanza tests de vulnerabilidades específicos)">Motor Scripts (NSE)</label>
              <select value={nseCategory} onChange={(e) => setNseCategory(e.target.value)} disabled={scanType === 'ping' || scriptDefault || aggressiveMode} className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-[10px] dark:text-slate-200 outline-none disabled:opacity-50">
                <option value="">Ninguno / Manual</option><option value="default">Default</option><option value="vuln">Vuln (Búsqueda de CVEs)</option><option value="brute">Brute (Ataque Diccionario)</option><option value="discovery">Discovery (Descubrimiento Extra)</option>
              </select>
              {nseCategory && <input type="text" value={nseArgs} onChange={(e) => setNseArgs(e.target.value)} placeholder="Args: http.useragent=LESSSO" className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 rounded text-[10px] font-mono outline-none" title="Argumentos extra para los scripts" />}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="space-y-0.5"><label className="text-[9px] font-bold text-slate-500 uppercase">Max OS Tries</label><input type="number" value={maxOsTries} onChange={(e) => setField('maxOsTries', e.target.value)} placeholder="Ej: 1" className="w-full px-2 py-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-300 rounded outline-none" /></div>
              <div className="space-y-0.5"><label className="text-[9px] font-bold text-slate-500 uppercase" title="0 a 9. Qué tanto insistirá en averiguar la versión de un servicio (--version-intensity)">Ver. Intensity</label><input type="number" min="0" max="9" value={versionIntensity} disabled={!useServiceDetection} onChange={(e) => setField('versionIntensity', e.target.value)} placeholder="0 a 9" className="w-full px-2 py-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-300 rounded outline-none disabled:opacity-30" /></div>
              <div className="space-y-0.5 flex flex-col justify-end pb-1"><label className="flex items-center space-x-1.5 cursor-pointer" title="Forzar una suposición de SO aunque Nmap no esté seguro (--osscan-guess)"><input type="checkbox" checked={osScanGuess} disabled={!useOSDetection} onChange={() => setField('osScanGuess', !osScanGuess)} className="rounded text-indigo-600 disabled:opacity-30 w-3 h-3" /><span className="text-[9px] font-bold dark:text-slate-300 uppercase">OS Adivinar</span></label></div>
              <div className="space-y-0.5"><label className="text-[9px] font-bold text-slate-500 uppercase" title="Fuerza un envío de N paquetes por segundo mínimo (--min-rate). Cuidado: Puede congestionar la red y saltar puertos.">Min Rate</label><input type="text" value={minRate} onChange={(e) => setField('minRate', e.target.value)} placeholder="Ej: 1000" className="w-full px-2 py-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-300 rounded outline-none font-mono" /></div>
              <div className="space-y-0.5"><label className="text-[9px] font-bold text-slate-500 uppercase" title="Máximo de reintentos por puerto (--max-retries). En 0 lo hace hiper rápido pero impreciso.">Max Retries</label><input type="text" value={maxRetries} onChange={(e) => setField('maxRetries', e.target.value)} placeholder="0" className="w-full px-2 py-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-300 rounded outline-none font-mono" /></div>
              <div className="space-y-0.5"><label className="text-[9px] font-bold text-slate-500 uppercase">Min Hostgroup</label><input type="text" value={minHostgroup} onChange={(e) => setField('minHostgroup', e.target.value)} placeholder="Ej: 64" className="w-full px-2 py-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-300 rounded outline-none font-mono" /></div>
              <div className="space-y-0.5"><label className="text-[9px] font-bold text-slate-500 uppercase">Max Hostgroup</label><input type="text" value={maxHostgroup} onChange={(e) => setField('maxHostgroup', e.target.value)} placeholder="Ej: 256" className="w-full px-2 py-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-300 rounded outline-none font-mono" /></div>
              <div className="space-y-0.5"><label className="text-[9px] font-bold text-slate-500 uppercase">Host Timeout</label><input type="text" value={hostTimeout} onChange={(e) => setField('hostTimeout', e.target.value)} placeholder="10m" className="w-full px-2 py-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-300 rounded outline-none" /></div>
              <div className="space-y-0.5"><label className="text-[9px] font-bold text-slate-500 uppercase" title="Pausa N tiempo entre paquete y paquete (--scan-delay). Excelente para evadir Firewalls o WAFs.">Scan Delay</label><input type="text" value={scanDelay} onChange={(e) => setField('scanDelay', e.target.value)} placeholder="1s" className="w-full px-2 py-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-300 rounded outline-none" /></div>
              <div className="space-y-0.5"><label className="text-[9px] font-bold text-slate-500 uppercase">Custom DNS</label><input type="text" value={customDns} onChange={(e) => setField('customDns', e.target.value)} placeholder="8.8.8.8" className="w-full px-2 py-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-300 rounded outline-none" /></div>
            </div>
          </div>
        )}

        {configTab === 'evasion' && (
          <div className="space-y-3 animate-in fade-in">
             <div className="grid grid-cols-2 gap-1.5"><label className="flex items-center space-x-1.5 cursor-pointer bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded border border-slate-200 dark:border-slate-700/50" title="Fragmenta los paquetes en pedazos de 8 bytes para confundir a los IDS (-f)"><input type="checkbox" checked={evasionFrag} onChange={() => setField('evasionFrag', !evasionFrag)} className="rounded text-indigo-600 w-3 h-3" /><span className="text-[9px] font-bold uppercase dark:text-slate-300">Frag (-f)</span></label><label className="flex items-center space-x-1.5 cursor-pointer bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded border border-slate-200 dark:border-slate-700/50" title="Envía paquetes con checksums falsos (--badsum). Si hay respuesta, hay un firewall muy avanzado en medio."><input type="checkbox" checked={badsum} onChange={() => setField('badsum', !badsum)} className="rounded text-indigo-600 w-3 h-3" /><span className="text-[9px] font-bold uppercase dark:text-slate-300">Badsum</span></label><label className="flex items-center space-x-1.5 cursor-pointer bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded border border-slate-200 dark:border-slate-700/50 col-span-2"><input type="checkbox" checked={randomizeHosts} onChange={() => setField('randomizeHosts', !randomizeHosts)} className="rounded text-indigo-600 w-3 h-3" /><span className="text-[9px] font-bold uppercase dark:text-slate-300">Aleatorizar Hosts</span></label></div>
             <div className="space-y-1.5 pt-1 border-t border-slate-200 dark:border-slate-700"><div className="space-y-0.5"><label className="text-[9px] font-bold text-slate-500 uppercase text-rose-500" title="Escaneo silencioso mediante un host zombie en la red (-sI). Tu IP nunca toca el objetivo.">Idle / Zombie (-sI)</label><input type="text" value={zombieIp} onChange={(e) => setField('zombieIp', e.target.value)} placeholder="IP_Zombie" className="w-full px-2 py-1 text-[10px] bg-rose-50 dark:bg-rose-900/20 border border-rose-300 rounded outline-none" /></div><div className="space-y-0.5"><label className="text-[9px] font-bold text-slate-500 uppercase text-rose-500">FTP Bounce (-b)</label><input type="text" value={ftpBounce} onChange={(e) => setField('ftpBounce', e.target.value)} placeholder="user:pass@server:port" className="w-full px-2 py-1 text-[10px] bg-rose-50 dark:bg-rose-900/20 border border-rose-300 rounded outline-none" /></div></div>
             <div className="space-y-0.5"><label className="text-[9px] font-bold text-slate-500 uppercase">MTU Personalizado</label><input type="text" value={evasionMTU} onChange={(e) => setField('evasionMTU', e.target.value)} placeholder="Ej: 24" className="w-full px-2 py-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-300 rounded outline-none" /></div>
             <div className="space-y-0.5"><label className="text-[9px] font-bold text-slate-500 uppercase" title="Genera IPs falsas (Señuelos) para confundir a los equipos de defensa (-D).">Decoys (-D)</label><input type="text" value={evasionDecoy} onChange={(e) => setField('evasionDecoy', e.target.value)} placeholder="RND:10,ME" className="w-full px-2 py-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-300 rounded outline-none" /></div>
             <div className="space-y-0.5"><label className="text-[9px] font-bold text-slate-500 uppercase" title="Falsificar la dirección IP o la dirección MAC (--spoof-mac / -S)">Spoof MAC / Source IP (-S)</label><div className="flex gap-1"><input type="text" value={evasionMac} onChange={(e) => setField('evasionMac', e.target.value)} placeholder="MAC" className="w-1/2 px-2 py-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-300 rounded outline-none" /><input type="text" value={evasionSpoofIp} onChange={(e) => setField('evasionSpoofIp', e.target.value)} placeholder="IP" className="w-1/2 px-2 py-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-300 rounded outline-none" /></div></div>
             <div className="space-y-0.5"><label className="text-[9px] font-bold text-slate-500 uppercase">Source Port Falso (-g)</label><input type="text" value={evasionSourcePort} onChange={(e) => setField('evasionSourcePort', e.target.value)} placeholder="Ej: 53" className="w-full px-2 py-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-300 rounded outline-none" /></div>
          </div>
        )}

        {configTab === 'payloads' && (
          <div className="space-y-3 animate-in fade-in">
             <div className="space-y-1.5 p-2 border rounded bg-fuchsia-50 dark:bg-fuchsia-900/10 border-fuchsia-200 dark:border-fuchsia-800/50"><label className="text-[10px] font-bold text-fuchsia-700 dark:text-fuchsia-400 uppercase flex justify-between">Inyección Data</label><div className="space-y-0.5"><label className="text-[8px] font-bold text-slate-500 uppercase">String</label><input type="text" value={dataString} onChange={(e) => setField('dataString', e.target.value)} disabled={scanType === 'ping'} className="w-full px-2 py-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-300 rounded outline-none disabled:opacity-50" /></div><div className="flex gap-1"><div className="w-1/2 space-y-0.5"><label className="text-[8px] font-bold text-slate-500 uppercase">Hex</label><input type="text" value={dataHex} onChange={(e) => setField('dataHex', e.target.value)} disabled={scanType === 'ping'} className="w-full px-2 py-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-300 rounded outline-none disabled:opacity-50" /></div><div className="w-1/2 space-y-0.5"><label className="text-[8px] font-bold text-slate-500 uppercase">Length</label><input type="text" value={dataLength} onChange={(e) => setField('dataLength', e.target.value)} disabled={scanType === 'ping'} className="w-full px-2 py-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-300 rounded outline-none disabled:opacity-50" /></div></div></div>
             <div className="space-y-0.5"><label className="text-[9px] font-bold text-slate-500 uppercase">Banderas TCP (--scanflags)</label><input type="text" value={customTcpFlags} onChange={(e) => setField('customTcpFlags', e.target.value)} disabled={scanType === 'ping'} placeholder="URGACKPSHRSTSYNFIN" className="w-full px-2 py-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-300 rounded outline-none font-mono disabled:opacity-50" /></div>
             <div className="space-y-0.5"><label className="text-[9px] font-bold text-slate-500 uppercase">Proxies (--proxies)</label><input type="text" value={proxies} onChange={(e) => setField('proxies', e.target.value)} placeholder="http://1.1.1.1:8080" className="w-full px-2 py-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-300 rounded outline-none font-mono" /></div>
             <div className="space-y-0.5"><label className="text-[9px] font-bold text-slate-500 uppercase">Resolución DNS (-n / -R)</label><select value={dnsResolution} onChange={(e) => setField('dnsResolution', e.target.value)} className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 rounded text-[10px] outline-none font-mono" title="Siempre usa '-n' (No resolución DNS) en el CPTS para ganar muchísima velocidad."><option value="">Automático</option><option value="-n">Nunca (-n) Ultra Rápido</option><option value="-R">Siempre (-R)</option></select></div>
             <div className="space-y-0.5"><label className="text-[9px] font-bold text-slate-500 uppercase">Interfaz Local (-e)</label><input type="text" value={networkInterface} onChange={(e) => setField('networkInterface', e.target.value)} placeholder="tun0" className="w-full px-2 py-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-300 rounded outline-none font-mono" /></div>
          </div>
        )}

        {configTab === 'output' && (
          <div className="space-y-3 animate-in fade-in">
            <div className="bg-sky-50 dark:bg-sky-900/10 p-2.5 rounded border border-sky-200 dark:border-sky-800/50">
              <label className="text-[10px] font-bold text-sky-700 dark:text-sky-400 uppercase flex justify-between mb-1.5">Exportación Nmap</label>
              <p className="text-[9px] text-slate-500 dark:text-slate-400 mb-3 leading-tight">Nmap generará los archivos nativos en la ruta elegida.</p>
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase">Formato de Salida</label>
                  <select value={nmapOutputFormat} onChange={(e) => setField('nmapOutputFormat', e.target.value)} className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-[10px] dark:text-slate-200 outline-none">
                    <option value="">No Exportar</option><option value="-oN">Normal (-oN)</option><option value="-oG">Grepable (-oG)</option><option value="-oX">XML (-oX)</option><option value="-oA">Todos (-oA)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase">Carpeta de Destino</label>
                  <div className="flex gap-1.5">
                    <input type="text" value={nmapOutputDir} disabled={!nmapOutputFormat} onChange={(e) => setField('nmapOutputDir', e.target.value)} placeholder="/home/..." className="flex-1 px-2 py-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded dark:text-slate-200 outline-none disabled:opacity-50" />
                    <button onClick={selectOutputDir} disabled={!nmapOutputFormat} className="px-2 py-1 bg-sky-600 text-white text-[10px] font-bold rounded hover:bg-sky-500 disabled:opacity-50">Examinar</button>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase">Nombre del Archivo</label>
                  <input type="text" value={nmapOutputPrefix} disabled={!nmapOutputFormat} onChange={(e) => setField('nmapOutputPrefix', e.target.value)} placeholder="reporte" className="w-full px-2 py-1 text-[10px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded dark:text-slate-200 outline-none disabled:opacity-50" />
                </div>
              </div>
            </div>
            
            <div className="bg-slate-100 dark:bg-slate-800 p-2.5 rounded border border-slate-200 dark:border-slate-700 mt-4">
               <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase flex justify-between mb-1.5">Auto Monitor</label>
               <select value={autoScanInterval} onChange={(e) => setField('autoScanInterval', Number(e.target.value))} disabled={isScanning} className="w-full bg-white dark:bg-slate-900 text-[10px] font-bold p-1.5 rounded outline-none text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600">
                  <option value={0}>Apagado</option><option value={30}>Cada 30 seg</option><option value={60}>Cada 1 min</option><option value={300}>Cada 5 min</option>
               </select>
            </div>
          </div>
        )}

      </div>
    </section>
  )
}
