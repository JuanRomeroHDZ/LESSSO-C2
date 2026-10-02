import { useScanStore } from '../../../core/store/useScanStore'
import { SectionGroup } from '../../../components/ui/SectionGroup'
import { InputGroup } from '../../../components/ui/InputGroup'
import { SelectGroup } from '../../../components/ui/SelectGroup'

export function PayloadsTab() {
  const {  
    scanType, networkInterface, customTcpFlags, customDns, dataString, dataHex, dataLength,
    dnsResolution, availableInterfaces, setField
  } = useScanStore()

  const isPing = scanType === 'ping'

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-2">
      <SectionGroup title="Inyección de Datos (Hex / String)">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <InputGroup label="Data String" value={dataString} onChange={(v: string) => setField('dataString', v)} disabled={isPing} placeholder="Ej: LESSSO_PROBE" />
          <InputGroup label="Data Hex" value={dataHex} onChange={(v: string) => setField('dataHex', v)} disabled={isPing} placeholder="Ej: 0xDEADBEEF" />
          <InputGroup label="Rnd Length" value={dataLength} onChange={(v: string) => setField('dataLength', v)} disabled={isPing} placeholder="Ej: 128" />
        </div>
      </SectionGroup>

      <SectionGroup title="Capa 3 / Capa 4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <InputGroup label="Banderas TCP (--scanflags)" value={customTcpFlags} onChange={(v: string) => setField('customTcpFlags', v)} disabled={isPing} placeholder="URGACKPSHRSTSYNFIN" />
          <SelectGroup label="Resolución DNS" value={dnsResolution} onChange={(v: string) => setField('dnsResolution', v)} options={[
            { value: "", label: "Automático" },
            { value: "-n", label: "Nunca (-n) Ultra Rápido" },
            { value: "-R", label: "Siempre (-R)" }
          ]} />
          <InputGroup label="DNS Custom (--dns-servers)" value={customDns} onChange={(v: string) => setField('customDns', v)} placeholder="8.8.8.8,1.1.1.1" />
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Interfaz de Red (-e)</label>
            <input list="ifaces" value={networkInterface} onChange={(e) => setField('networkInterface', e.target.value)} placeholder="Ej: tun0" className="w-full px-3 py-2 text-xs bg-white dark:bg-[#0b1120] border border-slate-200 dark:border-slate-800 rounded-md outline-none font-mono shadow-sm" />
            <datalist id="ifaces">{availableInterfaces.map(iface => <option key={iface} value={iface} />)}</datalist>
          </div>
        </div>
      </SectionGroup>
    </div>
  )
}
