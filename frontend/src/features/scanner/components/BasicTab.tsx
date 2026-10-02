import { useState } from 'react'
import { useScanStore } from '../../../core/store/useScanStore'
import { Save, Trash2 } from 'lucide-react'
import { SectionGroup } from '../../../components/ui/SectionGroup'
import { CompactCheckbox } from '../../../components/ui/CompactCheckbox'
import { InputGroup } from '../../../components/ui/InputGroup'
import { SelectGroup } from '../../../components/ui/SelectGroup'

export function BasicTab() {
  const [newProfileName, setNewProfileName] = useState('')
  
  const {  
    scanType, setScanType,
    scanAllPorts, toggleAllPorts, fastMode, setField, topPorts, customPorts,
    discoveryMode, setDiscoveryMode, excludeTargets, 
    savedProfiles, saveCustomProfile, loadCustomProfile, deleteCustomProfile
  } = useScanStore()

  const isPing = scanType === 'ping'

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-2">
      <SectionGroup title="Técnicas de Escaneo (Capa 3 y 4)">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <CompactCheckbox label="TCP SYN (-sS)" checked={scanType === 'syn'} onChange={() => setScanType('syn')} />
          <CompactCheckbox label="TCP Connect (-sT)" checked={scanType === 'tcp'} onChange={() => setScanType('tcp')} />
          <CompactCheckbox label="UDP Scan (-sU)" checked={scanType === 'udp'} onChange={() => setScanType('udp')} />
          <CompactCheckbox label="Solo Ping (-sn)" checked={scanType === 'ping'} onChange={() => setScanType('ping')} />
          <CompactCheckbox label="TCP ACK (-sA)" checked={scanType === 'ack'} onChange={() => setScanType('ack')} />
          <CompactCheckbox label="TCP Window (-sW)" checked={scanType === 'window'} onChange={() => setScanType('window')} />
          <CompactCheckbox label="TCP Maimon (-sM)" checked={scanType === 'maimon'} onChange={() => setScanType('maimon')} />
          <CompactCheckbox label="SCTP INIT (-sY)" checked={scanType === 'sctp'} onChange={() => setScanType('sctp')} />
        </div>
      </SectionGroup>

      <SectionGroup title="Alcance de Puertos">
        <div className="grid grid-cols-2 gap-2">
          <CompactCheckbox label="Todos (-p-)" checked={scanAllPorts} disabled={isPing || fastMode} conflictMsg={isPing ? "Requiere escaneo de puertos" : fastMode ? "Modo rápido activo" : ""} onChange={() => { toggleAllPorts(); setField('fastMode', false); }} />
          <CompactCheckbox label="Fast Mode (-F)" checked={fastMode} disabled={isPing || scanAllPorts} conflictMsg={isPing ? "Requiere escaneo" : scanAllPorts ? "Conflicto con -p-" : ""} onChange={() => { setField('fastMode', !fastMode); if(!fastMode){ setField('topPorts',''); setField('customPorts',''); } }} />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <InputGroup label="Top N Puertos" value={topPorts} onChange={(v: string) => { setField('topPorts', v); setField('customPorts',''); }} disabled={isPing || scanAllPorts || fastMode} placeholder="Ej: 1000" />
          <InputGroup label="Puertos Custom (-p)" value={customPorts} onChange={(v: string) => { setField('customPorts', v); setField('topPorts',''); }} disabled={isPing || scanAllPorts || fastMode} placeholder="Ej: 22,80,443" />
        </div>
      </SectionGroup>

      <SectionGroup title="Descubrimiento Inicial">
        <div className="grid grid-cols-2 gap-3">
          <SelectGroup label="Estrategia de Ping" value={discoveryMode} onChange={(v: string) => setDiscoveryMode(v)} options={[
            { value: "", label: "Auto (Ping Normal)" },
            { value: "-Pn", label: "No Ping (-Pn) (Evade FW)" },
            { value: "-PR", label: "ARP Ping (-PR) (LAN)" },
            { value: "-PE", label: "ICMP Echo (-PE)" }
          ]} />
          <InputGroup label="Excluir IPs (--exclude)" value={excludeTargets} onChange={(v: string) => setField('excludeTargets', v)} placeholder="Ej: 10.0.0.1, 10.0.0.5" />
        </div>
      </SectionGroup>

      <SectionGroup title="Perfiles Rápidos">
        <div className="flex gap-2">
          <input type="text" value={newProfileName} onChange={(e) => setNewProfileName(e.target.value)} placeholder="Nombre del nuevo perfil..." className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md outline-none transition-all shadow-sm" />
          <button onClick={() => { if(newProfileName) { saveCustomProfile(newProfileName); setNewProfileName(''); } }} className="px-4 py-2 bg-teal-600 text-white text-xs font-bold uppercase tracking-wider rounded-md hover:bg-teal-500 transition-colors flex items-center gap-1 shadow-sm"><Save size={14}/> Guardar</button>
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
      </SectionGroup>
    </div>
  )
}
