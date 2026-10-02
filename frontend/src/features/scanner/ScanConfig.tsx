import { useState, useEffect } from 'react'
import { useScanStore } from '../../core/store/useScanStore'
import { Cpu, Network, Shield, PackagePlus, HardDrive } from 'lucide-react'
import { TabButton } from '../../components/ui/TabButton'

import { BasicTab } from './components/BasicTab'
import { AdvancedTab } from './components/AdvancedTab'
import { EvasionTab } from './components/EvasionTab'
import { PayloadsTab } from './components/PayloadsTab'
import { OutputTab } from './components/OutputTab'

export function ScanConfig() {
  const [configTab, setConfigTab] = useState<'basic' | 'advanced' | 'evasion' | 'payloads' | 'output'>('basic')
  
  const { fetchInterfaces } = useScanStore()

  useEffect(() => { 
    fetchInterfaces() 
  }, [fetchInterfaces])

  return (
    <section className="flex flex-col h-full relative">
      {/* TABS COMPACTOS */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 shrink-0 overflow-x-auto custom-scrollbar bg-slate-50/50 dark:bg-[#020617] rounded-t-xl px-2 pt-2 gap-1">
        <TabButton active={configTab === 'basic'} onClick={() => setConfigTab('basic')} icon={<Network size={12}/>} label="Descubrimiento" color="teal" />
        <TabButton active={configTab === 'advanced'} onClick={() => setConfigTab('advanced')} icon={<Cpu size={12}/>} label="Técnicas Avz." color="indigo" />
        <TabButton active={configTab === 'evasion'} onClick={() => setConfigTab('evasion')} icon={<Shield size={12}/>} label="Evasión IDS" color="rose" />
        <TabButton active={configTab === 'payloads'} onClick={() => setConfigTab('payloads')} icon={<PackagePlus size={12}/>} label="Payloads Red" color="fuchsia" />
        <TabButton active={configTab === 'output'} onClick={() => setConfigTab('output')} icon={<HardDrive size={12}/>} label="Output" color="sky" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar pb-10">
        {configTab === 'basic' && <BasicTab />}
        {configTab === 'advanced' && <AdvancedTab />}
        {configTab === 'evasion' && <EvasionTab />}
        {configTab === 'payloads' && <PayloadsTab />}
        {configTab === 'output' && <OutputTab />}
      </div>
    </section>
  )
}
