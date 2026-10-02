import { useScanStore } from '../../../core/store/useScanStore'
import { SectionGroup } from '../../../components/ui/SectionGroup'
import { CompactCheckbox } from '../../../components/ui/CompactCheckbox'
import { InputGroup } from '../../../components/ui/InputGroup'
import { SelectGroup } from '../../../components/ui/SelectGroup'

export function AdvancedTab() {
  const {  
    scanType, timing, useOSDetection, useServiceDetection, nseCategory, nseArgs, 
    aggressiveMode, traceroute, minParallelism, maxParallelism, hostTimeout, scanDelay,
    versionIntensity, maxOsTries, minRate, maxRetries,
    osScanGuess, scriptDefault, minHostgroup, maxHostgroup,
    setTiming, setField, toggleOSDetection, toggleServiceDetection, setNseCategory, setNseArgs
  } = useScanStore()

  const isPing = scanType === 'ping'
  const isAggressive = aggressiveMode
  const effectiveOs = useOSDetection || isAggressive
  const effectiveSv = useServiceDetection || isAggressive
  const effectiveSc = scriptDefault || isAggressive
  const effectiveTraceroute = traceroute || isAggressive

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-2">
      <div className="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 p-3 rounded-xl shadow-sm">
        <CompactCheckbox label="Modo Agresivo (-A) (OS, SV, SC, Traceroute)" checked={aggressiveMode} onChange={() => setField('aggressiveMode', !aggressiveMode)} highlight="indigo" />
      </div>

      <SectionGroup title="Reconocimiento Activo">
        <div className="grid grid-cols-2 gap-2">
          <CompactCheckbox label="Detección OS (-O)" checked={effectiveOs} disabled={isPing || isAggressive} overrideMsg={isAggressive ? "Forzado (-A)" : ""} conflictMsg={isPing ? "Bloqueado (-sn)" : ""} onChange={toggleOSDetection} />
          <CompactCheckbox label="OS Guess (--osscan-guess)" checked={osScanGuess} disabled={!effectiveOs} conflictMsg={!effectiveOs ? "Requiere (-O)" : ""} onChange={() => setField('osScanGuess', !osScanGuess)} />
          <CompactCheckbox label="Servicios (-sV)" checked={effectiveSv} disabled={isPing || isAggressive} overrideMsg={isAggressive ? "Forzado (-A)" : ""} conflictMsg={isPing ? "Bloqueado (-sn)" : ""} onChange={toggleServiceDetection} />
          <CompactCheckbox label="Scripts Nmap (-sC)" checked={effectiveSc} disabled={isPing || isAggressive} overrideMsg={isAggressive ? "Forzado (-A)" : ""} conflictMsg={isPing ? "Bloqueado (-sn)" : ""} onChange={() => setField('scriptDefault', !scriptDefault)} />
          <CompactCheckbox label="Traceroute" checked={effectiveTraceroute} disabled={isAggressive} overrideMsg={isAggressive ? "Forzado (-A)" : ""} onChange={() => setField('traceroute', !traceroute)} />
        </div>
      </SectionGroup>

      <SectionGroup title="Motor NSE (--script)">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectGroup label="Categoría de Script" disabled={isPing || effectiveSc} value={nseCategory} onChange={(v: string) => setNseCategory(v)} options={[
            { value: "", label: "Ninguno / Manual" },
            { value: "default", label: "Default (Seguros)" },
            { value: "vuln", label: "Vuln (Búsqueda CVEs/Exploits)" },
            { value: "brute", label: "Brute (Fuerza Bruta)" },
            { value: "discovery", label: "Discovery (Info Profunda)" }
          ]} />
          <InputGroup label="Argumentos (--script-args)" value={nseArgs} onChange={(v: string) => setNseArgs(v)} disabled={!nseCategory} placeholder="Ej: http.useragent=LESSSO" />
        </div>
      </SectionGroup>

      <SectionGroup title="Tiempos (Timing Template)">
        <div className="flex items-center gap-4 bg-white dark:bg-[#0b1120] border border-slate-200 dark:border-slate-800 p-3 rounded-lg shadow-sm">
          <span className="text-[11px] font-bold uppercase text-indigo-600 dark:text-indigo-400">T{timing}</span>
          <input type="range" min="0" max="5" step="1" value={timing} onChange={(e) => setTiming(Number(e.target.value))} className="flex-1 accent-indigo-500" />
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{timing < 2 ? 'Sigiloso' : timing === 3 ? 'Normal' : 'Agresivo'}</span>
        </div>
      </SectionGroup>

      <SectionGroup title="Rendimiento y Paralelismo (Fine-Tuning)">
        <div className="grid grid-cols-3 lg:grid-cols-4 gap-3">
          <InputGroup label="Min Parallelism" value={minParallelism} onChange={(v: string) => setField('minParallelism', v)} placeholder="Ej: 10" />
          <InputGroup label="Max Parallelism" value={maxParallelism} onChange={(v: string) => setField('maxParallelism', v)} placeholder="Ej: 100" />
          <InputGroup label="Min Rate" value={minRate} onChange={(v: string) => setField('minRate', v)} placeholder="Ej: 1000" />
          <InputGroup label="Scan Delay" value={scanDelay} onChange={(v: string) => setField('scanDelay', v)} placeholder="Ej: 1s" />
          <InputGroup label="Host Timeout" value={hostTimeout} onChange={(v: string) => setField('hostTimeout', v)} placeholder="Ej: 10m" />
          <InputGroup label="Max Retries" value={maxRetries} onChange={(v: string) => setField('maxRetries', v)} placeholder="Ej: 2" />
          <InputGroup label="Min Hostgroup" value={minHostgroup} onChange={(v: string) => setField('minHostgroup', v)} placeholder="Ej: 64" />
          <InputGroup label="Max Hostgroup" value={maxHostgroup} onChange={(v: string) => setField('maxHostgroup', v)} placeholder="Ej: 256" />
          <InputGroup label="Max OS Tries" value={maxOsTries} onChange={(v: string) => setField('maxOsTries', v)} placeholder="Ej: 1" />
          <InputGroup label="Ver. Intensity" value={versionIntensity} disabled={!effectiveSv} onChange={(v: string) => setField('versionIntensity', v)} placeholder="0-9" />
        </div>
      </SectionGroup>
    </div>
  )
}
