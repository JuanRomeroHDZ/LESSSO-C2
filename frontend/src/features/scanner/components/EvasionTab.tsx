import { useScanStore } from '../../../core/store/useScanStore'
import { SectionGroup } from '../../../components/ui/SectionGroup'
import { CompactCheckbox } from '../../../components/ui/CompactCheckbox'
import { InputGroup } from '../../../components/ui/InputGroup'

export function EvasionTab() {
  const {  
    evasionFrag, evasionMTU, evasionDecoy, evasionMac, evasionSourcePort, evasionSpoofIp, 
    badsum, randomizeHosts, zombieIp, ftpBounce, proxies, ttl, setField
  } = useScanStore()

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-2">
      <SectionGroup title="Manipulación de Paquetes">
        <div className="grid grid-cols-2 gap-2">
          <CompactCheckbox label="Fragmentar (-f)" checked={evasionFrag} onChange={() => setField('evasionFrag', !evasionFrag)} highlight="rose" />
          <CompactCheckbox label="Badsum (--badsum)" checked={badsum} onChange={() => setField('badsum', !badsum)} highlight="rose" />
          <CompactCheckbox label="Randomize Hosts" checked={randomizeHosts} onChange={() => setField('randomizeHosts', !randomizeHosts)} highlight="rose" />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <InputGroup label="MTU (--mtu)" value={evasionMTU} onChange={(v: string) => setField('evasionMTU', v)} placeholder="Ej: 24 (Múlt. 8)" />
          <InputGroup label="TTL (--ttl)" value={ttl} onChange={(v: string) => setField('ttl', v)} placeholder="Ej: 64" />
          <InputGroup label="Port Origen (-g)" value={evasionSourcePort} onChange={(v: string) => setField('evasionSourcePort', v)} placeholder="Ej: 53" />
        </div>
      </SectionGroup>

      <SectionGroup title="Spoofing y Proxies">
        <div className="grid grid-cols-2 gap-3">
          <InputGroup label="Señuelos (-D)" value={evasionDecoy} onChange={(v: string) => setField('evasionDecoy', v)} placeholder="RND:10,ME" />
          <InputGroup label="Spoof MAC (--spoof-mac)" value={evasionMac} onChange={(v: string) => setField('evasionMac', v)} placeholder="00:11:22:33:44:55" />
          <InputGroup label="Spoof IP (-S)" value={evasionSpoofIp} onChange={(v: string) => setField('evasionSpoofIp', v)} placeholder="192.168.1.100" />
          <InputGroup label="Idle Scan (Zombie -sI)" value={zombieIp} onChange={(v: string) => setField('zombieIp', v)} placeholder="IP Zombie..." />
          <InputGroup label="FTP Bounce (-b)" value={ftpBounce} onChange={(v: string) => setField('ftpBounce', v)} placeholder="user:pass@ftp:21" />
          <InputGroup label="Proxies (--proxies)" value={proxies} onChange={(v: string) => setField('proxies', v)} placeholder="http://1.1.1.1:8080" />
        </div>
      </SectionGroup>
    </div>
  )
}
