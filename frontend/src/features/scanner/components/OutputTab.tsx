import { open } from '@tauri-apps/plugin-dialog'
import { useScanStore } from '../../../core/store/useScanStore'
import { SectionGroup } from '../../../components/ui/SectionGroup'
import { CompactCheckbox } from '../../../components/ui/CompactCheckbox'
import { InputGroup } from '../../../components/ui/InputGroup'
import { SelectGroup } from '../../../components/ui/SelectGroup'
import { FolderOpen } from 'lucide-react'

export function OutputTab() {
  const {  
    scanType, isVerbose, reason, packetTrace, autoScanInterval, isScanning,
    onlyOpenPorts, nmapOutputFormat, nmapOutputPrefix, nmapOutputDir,
    setField, toggleVerbose
  } = useScanStore()

  const isPing = scanType === 'ping'

  const selectOutputDir = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && !Array.isArray(selected)) setField('nmapOutputDir', selected);
    } catch (err) { console.error(err); }
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-2">
      <SectionGroup title="Opciones Visuales">
        <div className="grid grid-cols-2 gap-2">
          <CompactCheckbox label="Solo Puertos Open (--open)" checked={onlyOpenPorts} disabled={isPing} onChange={() => setField('onlyOpenPorts', !onlyOpenPorts)} highlight="sky" />
          <CompactCheckbox label="Mostrar Razón (--reason)" checked={reason} onChange={() => setField('reason', !reason)} highlight="sky" />
          <CompactCheckbox label="Packet Trace" checked={packetTrace} onChange={() => setField('packetTrace', !packetTrace)} highlight="sky" />
          <CompactCheckbox label="Verbose (-v)" checked={isVerbose} onChange={toggleVerbose} highlight="sky" />
        </div>
      </SectionGroup>

      <SectionGroup title="Exportación Nativa Nmap">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectGroup label="Formato de Salida" value={nmapOutputFormat} onChange={(v: string) => setField('nmapOutputFormat', v)} options={[
            { value: "", label: "Ninguno (Solo Memoria)" },
            { value: "-oN", label: "Normal (-oN)" },
            { value: "-oG", label: "Grepable (-oG)" },
            { value: "-oX", label: "XML (-oX)" },
            { value: "-oA", label: "Todos (-oA)" }
          ]} />
          <InputGroup label="Prefijo Archivo" value={nmapOutputPrefix} onChange={(v: string) => setField('nmapOutputPrefix', v)} disabled={!nmapOutputFormat} placeholder="scan_10.10.10.1" />
          <div className="sm:col-span-2 space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ruta de Destino Absoluta</label>
            <div className="flex gap-2">
              <input type="text" value={nmapOutputDir} disabled={!nmapOutputFormat} onChange={(e) => setField('nmapOutputDir', e.target.value)} placeholder="/home/user/auditoria/..." className="flex-1 px-3 py-2 text-xs bg-white dark:bg-[#0b1120] border border-slate-200 dark:border-slate-800 rounded-md outline-none disabled:opacity-40 font-mono shadow-sm" />
              <button onClick={selectOutputDir} disabled={!nmapOutputFormat} className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] uppercase font-bold rounded-md hover:bg-slate-300 dark:hover:bg-slate-700 disabled:opacity-40 flex items-center gap-2 transition-colors"><FolderOpen size={14}/> Explorar</button>
            </div>
          </div>
        </div>
      </SectionGroup>
      
      <SectionGroup title="Monitoreo Automático">
        <SelectGroup label="Repetir Escaneo" value={autoScanInterval.toString()} disabled={isScanning} onChange={(v: string) => setField('autoScanInterval', Number(v))} options={[
          { value: "0", label: "Un solo escaneo (Apagado)" },
          { value: "30", label: "Cada 30 segundos" },
          { value: "60", label: "Cada 1 minuto" },
          { value: "300", label: "Cada 5 minutos" }
        ]} />
      </SectionGroup>
    </div>
  )
}
