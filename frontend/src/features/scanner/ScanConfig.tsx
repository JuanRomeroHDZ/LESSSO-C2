import { useState, useEffect } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { useScanStore } from '../../core/store/useScanStore'
import { AlertCircle, Info, Save, FolderOpen, Trash2 } from 'lucide-react'

export function ScanConfig() {
  const [configTab, setConfigTab] = useState<'basic' | 'advanced' | 'evasion' | 'payloads' | 'output'>('basic')
  const [newProfileName, setNewProfileName] = useState('')
  
  const { 
    scanType, timing, useOSDetection, useServiceDetection, scanAllPorts, nseCategory, nseArgs, isVerbose,
    excludeTargets, topPorts, customPorts, fastMode, discoveryMode, minRate, maxRetries, networkInterface, aggressiveMode, traceroute, reason, packetTrace, dnsResolution, hostTimeout, scanDelay,
    versionIntensity, maxOsTries,
    evasionFrag, evasionMTU, evasionDecoy, evasionMac, evasionSourcePort, evasionSpoofIp, badsum, randomizeHosts, zombieIp, ftpBounce,
    customTcpFlags, proxies, customDns, dataString, dataHex, dataLength,
    savedProfiles, autoScanInterval, isScanning, availableInterfaces, fetchInterfaces,
    onlyOpenPorts, osScanGuess, scriptDefault, minHostgroup, maxHostgroup,
    nmapOutputFormat, nmapOutputPrefix, nmapOutputDir,
    setScanType, setTiming, setDiscoveryMode, setField, toggleOSDetection, toggleServiceDetection, toggleAllPorts, toggleVerbose, setNseCategory, setNseArgs,
    saveCustomProfile, loadCustomProfile, deleteCustomProfile
  } = useScanStore()

  useEffect(() => {
    fetchInterfaces();
  }, [fetchInterfaces]);

  const selectOutputDir = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && !Array.isArray(selected)) setField('nmapOutputDir', selected);
    } catch (err) { console.error(err); }
  }

  // --- LÓGICA DE EXCLUSIÓN INTELIGENTE ---
  const isPing = scanType === 'ping';
  const isAggressive = aggressiveMode;

  const effectiveOs = useOSDetection || isAggressive;
  const effectiveSv = useServiceDetection || isAggressive;
  const effectiveSc = scriptDefault || isAggressive;
  const effectiveTraceroute = traceroute || isAggressive;

  return (
    <section className="flex flex-col h-full relative">
      <div className="flex border-b border-slate-200 dark:border-slate-800 shrink-0 overflow-x-auto custom-scrollbar bg-white dark:bg-[#020617] rounded-t-xl px-2 pt-2">
        <button onClick={() => setConfigTab('basic')} className={`pb-2 px-3 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${configTab === 'basic' ? 'border-teal-500 text-teal-600 dark:text-teal-400' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Descubrimiento</button>
        <button onClick={() => setConfigTab('advanced')} className={`pb-2 px-3 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${configTab === 'advanced' ? 'border-teal-500 text-teal-600 dark:text-teal-400' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Técnicas Avz.</button>
        <button onClick={() => setConfigTab('evasion')} className={`pb-2 px-3 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${configTab === 'evasion' ? 'border-rose-500 text-rose-600 dark:text-rose-400' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Evasión (WAF/IDS)</button>
        <button onClick={() => setConfigTab('payloads')} className={`pb-2 px-3 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${configTab === 'payloads' ? 'border-fuchsia-500 text-fuchsia-600 dark:text-fuchsia-400' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Payloads Red</button>
        <button onClick={() => setConfigTab('output')} className={`pb-2 px-3 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-colors whitespace-nowrap ${configTab === 'output' ? 'border-sky-500 text-sky-600 dark:text-sky-400' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Output</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar pb-10">

        {/* -------------------------------------------------------------------------
            PESTAÑA: BASIC
        -------------------------------------------------------------------------- */}
        {configTab === 'basic' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-2">
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-1">Protocolo Base</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <SmartCheckbox label="TCP SYN (-sS)" desc="Rápido y sigiloso. Requiere root." checked={scanType === 'syn'} onChange={() => setScanType('syn')} />
                <SmartCheckbox label="TCP Connect (-sT)" desc="Más lento y ruidoso. No requiere root." checked={scanType === 'tcp'} onChange={() => setScanType('tcp')} />
                <SmartCheckbox label="UDP Scan (-sU)" desc="Para DNS, SNMP, DHCP, etc." checked={scanType === 'udp'} onChange={() => setScanType('udp')} />
                <SmartCheckbox label="SCTP INIT (-sY)" desc="Para telecomunicaciones." checked={scanType === 'sctp'} onChange={() => setScanType('sctp')} />
                <SmartCheckbox label="Solo Ping (-sn)" desc="Descubrimiento de hosts. Omite puertos." checked={scanType === 'ping'} onChange={() => setScanType('ping')} />
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-1">Alcance de Puertos</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SmartCheckbox 
                  label="Todos (-p-)" desc="Escanea los 65,535 puertos." 
                  checked={scanAllPorts} disabled={isPing || fastMode} 
                  conflictMsg={isPing ? "Bloqueado por Solo Ping" : fastMode ? "Bloqueado por Modo Rápido" : ""}
                  onChange={() => { toggleAllPorts(); setField('fastMode', false); }} 
                />
                <SmartCheckbox 
                  label="Fast Mode (-F)" desc="Solo los 100 más comunes." 
                  checked={fastMode} disabled={isPing || scanAllPorts} 
                  conflictMsg={isPing ? "Bloqueado por Solo Ping" : scanAllPorts ? "Bloqueado por Todos (-p-)" : ""}
                  onChange={() => { setField('fastMode', !fastMode); if(!fastMode){ setField('topPorts',''); setField('customPorts',''); } }} 
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Top N Puertos</label>
                  <input type="text" value={topPorts} disabled={isPing || scanAllPorts || fastMode} onChange={(e) => { setField('topPorts', e.target.value); setField('customPorts',''); }} placeholder="Ej: 1000" className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none disabled:opacity-40 transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Puertos Custom (-p)</label>
                  <input type="text" value={customPorts} disabled={isPing || scanAllPorts || fastMode} onChange={(e) => { setField('customPorts', e.target.value); setField('topPorts',''); }} placeholder="Ej: 22,80,443" className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none disabled:opacity-40 transition-all font-mono" />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-1">Tiempos y Exclusiones</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 p-3 bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700/50 rounded-lg">
                  <label className="text-[10px] font-bold text-slate-500 uppercase flex justify-between">
                    <span>Plantilla de Tiempo (T)</span> <span className="text-teal-600 dark:text-teal-400">T{timing}</span>
                  </label>
                  <input type="range" min="0" max="5" step="1" value={timing} onChange={(e) => setTiming(Number(e.target.value))} className="w-full accent-teal-500 mt-2" />
                  <p className="text-[9px] text-slate-400 mt-1">T0 (Paranoico) a T5 (Insano).</p>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Descubrimiento Inicial</label>
                  <select value={discoveryMode} onChange={(e) => setDiscoveryMode(e.target.value)} className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs dark:text-slate-200 outline-none">
                    <option value="">Auto (Ping Normal)</option>
                    <option value="-Pn">No Ping (-Pn) (Evade FW block)</option>
                    <option value="-PR">ARP Ping (-PR) (Red Local)</option>
                    <option value="-PE">ICMP Echo (-PE)</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Excluir IPs (--exclude)</label>
                <input type="text" value={excludeTargets} onChange={(e) => setField('excludeTargets', e.target.value)} placeholder="Ej: 192.168.1.1, 10.0.0.5" className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none font-mono" />
              </div>
            </div>

            {/* Perfiles Personalizados */}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-1">Mis Perfiles Guardados</h3>
              <div className="flex gap-2">
                <input type="text" value={newProfileName} onChange={(e) => setNewProfileName(e.target.value)} placeholder="Nombre del nuevo perfil..." className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none transition-all" />
                <button onClick={() => { if(newProfileName) { saveCustomProfile(newProfileName); setNewProfileName(''); } }} className="px-4 py-2 bg-teal-600 text-white text-xs font-bold uppercase rounded-lg hover:bg-teal-500 transition-colors flex items-center gap-1"><Save size={14}/> Guardar</button>
              </div>
              {savedProfiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {savedProfiles.map(p => (
                    <div key={p.id} className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden shadow-sm">
                      <button onClick={() => loadCustomProfile(p.id)} className="px-3 py-1.5 text-[10px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">{p.name}</button>
                      <button onClick={() => deleteCustomProfile(p.id)} className="px-2 py-1.5 text-[10px] text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 border-l border-slate-200 dark:border-slate-700 transition-colors"><Trash2 size={12}/></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* -------------------------------------------------------------------------
            PESTAÑA: ADVANCED
        -------------------------------------------------------------------------- */}
        {configTab === 'advanced' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-2">
            <div className="bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20 p-4 rounded-xl">
              <SmartCheckbox 
                label="Modo Agresivo (-A)" 
                desc="Habilita Detección OS, Versiones, Scripts Default y Traceroute simultáneamente." 
                checked={aggressiveMode} 
                onChange={() => setField('aggressiveMode', !aggressiveMode)} 
              />
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-1">Reconocimiento Activo</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SmartCheckbox label="Detección OS (-O)" checked={effectiveOs} disabled={isPing || isAggressive} overrideMsg={isAggressive ? "Forzado por Modo Agresivo (-A)" : ""} conflictMsg={isPing ? "Bloqueado por Solo Ping" : ""} onChange={toggleOSDetection} />
                <div className="flex flex-col gap-2">
                  <SmartCheckbox label="OS Guess (--osscan-guess)" desc="Fuerza una suposición si Nmap no está seguro." checked={osScanGuess} disabled={!effectiveOs} conflictMsg={!effectiveOs ? "Requiere Detección OS (-O)" : ""} onChange={() => setField('osScanGuess', !osScanGuess)} />
                </div>
                <SmartCheckbox label="Detección de Servicios (-sV)" checked={effectiveSv} disabled={isPing || isAggressive} overrideMsg={isAggressive ? "Forzado por Modo Agresivo (-A)" : ""} conflictMsg={isPing ? "Bloqueado por Solo Ping" : ""} onChange={toggleServiceDetection} />
                <SmartCheckbox label="Scripts Default (-sC)" checked={effectiveSc} disabled={isPing || isAggressive} overrideMsg={isAggressive ? "Forzado por Modo Agresivo (-A)" : ""} conflictMsg={isPing ? "Bloqueado por Solo Ping" : ""} onChange={() => setField('scriptDefault', !scriptDefault)} />
                <SmartCheckbox label="Traceroute (--traceroute)" checked={effectiveTraceroute} disabled={isAggressive} overrideMsg={isAggressive ? "Forzado por Modo Agresivo (-A)" : ""} onChange={() => setField('traceroute', !traceroute)} />
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-1">Motor de Scripts (NSE)</h3>
              <div className="flex flex-col gap-3 p-4 bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700/50 rounded-xl">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Categoría de Script</label>
                  <select value={nseCategory} onChange={(e) => setNseCategory(e.target.value)} disabled={isPing || effectiveSc} className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-xs dark:text-slate-200 outline-none disabled:opacity-40">
                    <option value="">Ninguno / Manual</option>
                    <option value="default">Default (Seguros)</option>
                    <option value="vuln">Vuln (Búsqueda CVEs y Exploits)</option>
                    <option value="brute">Brute (Fuerza Bruta de logins)</option>
                    <option value="discovery">Discovery (Información profunda)</option>
                  </select>
                </div>
                {nseCategory && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Argumentos NSE (--script-args)</label>
                    <input type="text" value={nseArgs} onChange={(e) => setNseArgs(e.target.value)} placeholder="Ej: http.useragent=LESSSO" className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono outline-none" />
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-1">Tiempos y Rendimiento Avanzado</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase">Max OS Tries</label><input type="number" value={maxOsTries} onChange={(e) => setField('maxOsTries', e.target.value)} placeholder="Ej: 1" className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none" /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase">Ver. Intensity</label><input type="number" min="0" max="9" value={versionIntensity} disabled={!effectiveSv} onChange={(e) => setField('versionIntensity', e.target.value)} placeholder="0-9" className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none disabled:opacity-40" /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase">Min Rate</label><input type="text" value={minRate} onChange={(e) => setField('minRate', e.target.value)} placeholder="Ej: 1000" className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none font-mono" /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase">Max Retries</label><input type="text" value={maxRetries} onChange={(e) => setField('maxRetries', e.target.value)} placeholder="0" className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none font-mono" /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase">Min Hostgroup</label><input type="text" value={minHostgroup} onChange={(e) => setField('minHostgroup', e.target.value)} placeholder="Ej: 64" className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none font-mono" /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase">Max Hostgroup</label><input type="text" value={maxHostgroup} onChange={(e) => setField('maxHostgroup', e.target.value)} placeholder="Ej: 256" className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none font-mono" /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase">Host Timeout</label><input type="text" value={hostTimeout} onChange={(e) => setField('hostTimeout', e.target.value)} placeholder="10m" className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none font-mono" /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase">Scan Delay</label><input type="text" value={scanDelay} onChange={(e) => setField('scanDelay', e.target.value)} placeholder="1s" className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none font-mono" /></div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-1">Utilidades Visuales</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SmartCheckbox label="Solo Puertos Open (--open)" desc="Ignora los filtrados o cerrados en la salida." checked={onlyOpenPorts} disabled={isPing} conflictMsg={isPing ? "Bloqueado por Solo Ping" : ""} onChange={() => setField('onlyOpenPorts', !onlyOpenPorts)} />
                <SmartCheckbox label="Mostrar Razón (--reason)" desc="Muestra por qué nmap determinó el estado." checked={reason} onChange={() => setField('reason', !reason)} />
                <SmartCheckbox label="Packet Trace (--packet-trace)" desc="Modo debug. Muestra cada paquete volando." checked={packetTrace} onChange={() => setField('packetTrace', !packetTrace)} />
                <SmartCheckbox label="Verbose (-v)" desc="Output en tiempo real en la terminal." checked={isVerbose} onChange={toggleVerbose} />
              </div>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------------------
            PESTAÑA: EVASION
        -------------------------------------------------------------------------- */}
        {configTab === 'evasion' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-2">
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-1">Firewall & IDS Bypass</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SmartCheckbox label="Fragmentar Paquetes (-f)" desc="Corta cabeceras en fragmentos de 8 bytes para cegar al IDS." checked={evasionFrag} onChange={() => setField('evasionFrag', !evasionFrag)} />
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">MTU Personalizado</label>
                  <input type="text" value={evasionMTU} onChange={(e) => setField('evasionMTU', e.target.value)} placeholder="Ej: 24 (Múltiplo de 8)" className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none font-mono" />
                </div>
                <SmartCheckbox label="Badsum (--badsum)" desc="Envía sumas de control falsas. Si hay respuesta, hay un FW pasivo." checked={badsum} onChange={() => setField('badsum', !badsum)} />
                <SmartCheckbox label="Aleatorizar Hosts (--randomize-hosts)" desc="Desordena la lista de IPs para evadir bloqueos por ráfagas." checked={randomizeHosts} onChange={() => setField('randomizeHosts', !randomizeHosts)} />
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-rose-500 dark:text-rose-500 border-b border-rose-200 dark:border-rose-900/50 pb-1">Ataques Indirectos (Proxies & Zombies)</h3>
              <div className="grid grid-cols-1 gap-3 p-4 bg-rose-50 dark:bg-rose-500/5 border border-rose-200 dark:border-rose-500/20 rounded-xl">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-rose-700 dark:text-rose-400 uppercase">Escaneo Zombie (Idle Scan -sI)</label>
                  <input type="text" value={zombieIp} onChange={(e) => setField('zombieIp', e.target.value)} placeholder="IP de la máquina Zombie..." className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 rounded-lg outline-none font-mono" />
                  <p className="text-[9px] text-rose-600 dark:text-rose-500">Utiliza un host intermedio inactivo para escanear. Tu IP real no toca al objetivo.</p>
                </div>
                <div className="space-y-1 mt-2">
                  <label className="text-[10px] font-bold text-rose-700 dark:text-rose-400 uppercase">FTP Bounce (-b)</label>
                  <input type="text" value={ftpBounce} onChange={(e) => setField('ftpBounce', e.target.value)} placeholder="usuario:pass@servidor:puerto" className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 rounded-lg outline-none font-mono" />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-1">Falsificación (Spoofing)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase">Señuelos (Decoys -D)</label><input type="text" value={evasionDecoy} onChange={(e) => setField('evasionDecoy', e.target.value)} placeholder="RND:10,ME" className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none font-mono" /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase">Spoof MAC (-S)</label><input type="text" value={evasionMac} onChange={(e) => setField('evasionMac', e.target.value)} placeholder="00:11:22:33:44:55" className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none font-mono" /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase">Spoof IP Origin (-S)</label><input type="text" value={evasionSpoofIp} onChange={(e) => setField('evasionSpoofIp', e.target.value)} placeholder="192.168.1.100" className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none font-mono" /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-500 uppercase">Falsificar Pto Origen (-g)</label><input type="text" value={evasionSourcePort} onChange={(e) => setField('evasionSourcePort', e.target.value)} placeholder="Ej: 53 (DNS)" className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none font-mono" /></div>
              </div>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------------------
            PESTAÑA: PAYLOADS Y RED
        -------------------------------------------------------------------------- */}
        {configTab === 'payloads' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-2">
            
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-fuchsia-600 dark:text-fuchsia-500 border-b border-fuchsia-200 dark:border-fuchsia-900/50 pb-1">Inyección de Datos Custom</h3>
              <div className="grid grid-cols-1 gap-3 p-4 bg-fuchsia-50 dark:bg-fuchsia-500/5 border border-fuchsia-200 dark:border-fuchsia-500/20 rounded-xl">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-fuchsia-700 dark:text-fuchsia-400 uppercase">Inyectar String</label>
                  <input type="text" value={dataString} onChange={(e) => setField('dataString', e.target.value)} disabled={isPing} placeholder="Ej: LESSSO_PROBE" className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-fuchsia-300 dark:border-fuchsia-800 rounded-lg outline-none font-mono disabled:opacity-50" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-fuchsia-700 dark:text-fuchsia-400 uppercase">Inyectar Hex</label>
                    <input type="text" value={dataHex} onChange={(e) => setField('dataHex', e.target.value)} disabled={isPing} placeholder="Ej: 0xDEADBEEF" className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-fuchsia-300 dark:border-fuchsia-800 rounded-lg outline-none font-mono disabled:opacity-50" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-fuchsia-700 dark:text-fuchsia-400 uppercase">Largo de Data Rnd</label>
                    <input type="text" value={dataLength} onChange={(e) => setField('dataLength', e.target.value)} disabled={isPing} placeholder="Ej: 128" className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-fuchsia-300 dark:border-fuchsia-800 rounded-lg outline-none font-mono disabled:opacity-50" />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-1">Manipulación de Capa 3 y 4</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Banderas TCP (--scanflags)</label>
                  <input type="text" value={customTcpFlags} onChange={(e) => setField('customTcpFlags', e.target.value)} disabled={isPing} placeholder="URGACKPSHRSTSYNFIN" className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none font-mono disabled:opacity-50" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Proxies (--proxies)</label>
                  <input type="text" value={proxies} onChange={(e) => setField('proxies', e.target.value)} placeholder="http://1.1.1.1:8080" className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none font-mono" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Resolución DNS (-n / -R)</label>
                  <select value={dnsResolution} onChange={(e) => setField('dnsResolution', e.target.value)} className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none font-mono">
                    <option value="">Automático</option>
                    <option value="-n">Nunca (-n) Ultra Rápido</option>
                    <option value="-R">Siempre (-R)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">DNS Custom (--dns-servers)</label>
                  <input type="text" value={customDns} onChange={(e) => setField('customDns', e.target.value)} placeholder="8.8.8.8,1.1.1.1" className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none font-mono" />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Interfaz Local a usar (-e)</label>
                  <input list="ifaces" value={networkInterface} onChange={(e) => setField('networkInterface', e.target.value)} placeholder="Ej: tun0" className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none font-mono" />
                  <datalist id="ifaces">
                    {availableInterfaces.map(iface => <option key={iface} value={iface} />)}
                  </datalist>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------------------
            PESTAÑA: OUTPUT Y NMAP NATIVO
        -------------------------------------------------------------------------- */}
        {configTab === 'output' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-2">
            
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-sky-600 dark:text-sky-500 border-b border-sky-200 dark:border-sky-900/50 pb-1">Exportación Nmap Nativa</h3>
              <div className="grid grid-cols-1 gap-3 p-4 bg-sky-50 dark:bg-sky-500/5 border border-sky-200 dark:border-sky-500/20 rounded-xl">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight mb-2">Genera los archivos originales de Nmap (.nmap, .gnmap, .xml) en disco simultáneamente a la lectura en interfaz.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Formato de Salida</label>
                    <select value={nmapOutputFormat} onChange={(e) => setField('nmapOutputFormat', e.target.value)} className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none">
                      <option value="">Ninguno</option>
                      <option value="-oN">Normal (-oN)</option>
                      <option value="-oG">Grepable (-oG)</option>
                      <option value="-oX">XML (-oX)</option>
                      <option value="-oA">Todos los formatos (-oA)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Nombre Base (Prefijo)</label>
                    <input type="text" value={nmapOutputPrefix} disabled={!nmapOutputFormat} onChange={(e) => setField('nmapOutputPrefix', e.target.value)} placeholder="ej_scan_10.10.10.1" className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none disabled:opacity-40" />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Carpeta de Destino Absoluta</label>
                    <div className="flex gap-2">
                      <input type="text" value={nmapOutputDir} disabled={!nmapOutputFormat} onChange={(e) => setField('nmapOutputDir', e.target.value)} placeholder="/home/user/auditoria/..." className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none disabled:opacity-40" />
                      <button onClick={selectOutputDir} disabled={!nmapOutputFormat} className="px-4 py-2 bg-sky-600 text-white text-xs font-bold rounded-lg hover:bg-sky-500 disabled:opacity-40 flex items-center gap-2"><FolderOpen size={14}/> Explorar</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 border-b border-slate-200 dark:border-slate-800 pb-1">Automatización</h3>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Auto Monitor (Recurrencia)</label>
                <select value={autoScanInterval} onChange={(e) => setField('autoScanInterval', Number(e.target.value))} disabled={isScanning} className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none disabled:opacity-40">
                  <option value={0}>Un solo escaneo (Apagado)</option>
                  <option value={30}>Repetir cada 30 segundos</option>
                  <option value={60}>Repetir cada 1 minuto</option>
                  <option value={300}>Repetir cada 5 minutos</option>
                </select>
                <p className="text-[9px] text-slate-500 mt-1">Útil para detectar puertos que se abren intermitentemente.</p>
              </div>
            </div>

          </div>
        )}

      </div>
    </section>
  )
}

// ==========================================================
// COMPONENTE VISUAL INTELIGENTE PARA LOS CHECKBOXES
// ==========================================================
function SmartCheckbox({ label, desc, checked, disabled, onChange, conflictMsg, overrideMsg }: any) {
  return (
    <label className={`flex flex-col p-3 rounded-xl border-2 transition-all cursor-pointer ${
      disabled && !overrideMsg ? 'bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800 opacity-60' :
      checked ? 'bg-teal-50 dark:bg-teal-500/10 border-teal-500/50 shadow-sm' : 'bg-white dark:bg-[#020617] border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
    }`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-bold uppercase tracking-wider ${checked && !disabled ? 'text-teal-700 dark:text-teal-400' : 'text-slate-700 dark:text-slate-300'}`}>
          {label}
        </span>
        <input 
          type="checkbox" 
          checked={checked} 
          disabled={disabled} 
          onChange={onChange} 
          className="w-4 h-4 accent-teal-600 rounded" 
        />
      </div>
      {desc && !overrideMsg && !conflictMsg && (
        <span className="text-[10px] text-slate-500 dark:text-slate-500 mt-1 leading-snug">{desc}</span>
      )}
      {conflictMsg && disabled && !overrideMsg && (
        <span className="text-[10px] font-bold text-rose-500 dark:text-rose-400 mt-1.5 leading-tight flex items-center gap-1">
          <AlertCircle size={12}/> {conflictMsg}
        </span>
      )}
      {overrideMsg && (
         <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mt-1.5 leading-tight flex items-center gap-1">
          <Info size={12}/> {overrideMsg}
        </span>
      )}
    </label>
  )
}
