import { useMemo } from 'react'
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow'
import 'reactflow/dist/style.css'
import { useScanStore } from '../../core/store/useScanStore'

export function TopologyPanel() {
  const { parsedData, isScanning } = useScanStore()

  const { nodes, edges, isTrimmed } = useMemo(() => {
    if (!parsedData || parsedData.length === 0) return { nodes: [], edges: [], isTrimmed: false }

    const initialNodes: any[] = [
      { id: 'scanner-root', type: 'input', data: { label: '💻 Escáner Local' }, position: { x: 300, y: 50 }, style: { background: '#312e81', color: '#fff', fontWeight: 'bold', borderRadius: '8px', border: 'none', padding: '10px' } }
    ]
    const initialEdges: any[] = []

    const MAX_NODES = 100;
    const isTrimmed = parsedData.length > MAX_NODES;
    const safeData = parsedData.slice(0, MAX_NODES);

    safeData.forEach((host, index) => {
      const xPos = 50 + (index * 220);
      const isUp = host.status === 'up';
      
      const osLower = (host.os || '').toLowerCase();
      let osIcon = '📱'; let borderColor = '#cbd5e1';
      if (osLower.includes('linux')) { osIcon = '🐧'; borderColor = '#f59e0b'; }
      else if (osLower.includes('windows')) { osIcon = '🪟'; borderColor = '#3b82f6'; }
      else if (osLower.includes('mac') || osLower.includes('apple')) { osIcon = '🍎'; borderColor = '#94a3b8'; }
      else if (osLower.includes('cisco') || osLower.includes('router') || osLower.includes('switch')) { osIcon = '🖲'; borderColor = '#10b981'; }

      const totalPorts = host.ports?.length || 0;
      const criticalPorts = (host.ports || []).filter(p => ['21','22','23','445','3389'].includes(p.portid)).length;

      initialNodes.push({
        id: host.ip,
        data: { 
          label: (
            <div className="text-center flex flex-col items-center">
              <span className="text-2xl mb-1">{osIcon}</span>
              <div className="font-bold text-sm text-slate-800 dark:text-white">{host.ip}</div>
              {host.hostname && <div className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mt-1 truncate w-32">{host.hostname}</div>}
              <div className="text-[9px] opacity-70 text-slate-600 dark:text-slate-300 w-32 truncate">{host.os || 'OS Desconocido'}</div>
              <div className="flex gap-1 mt-2">
                <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">{totalPorts} Pts</span>
                {criticalPorts > 0 && <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold animate-pulse">! Crit</span>}
              </div>
            </div>
          )
        },
        position: { x: xPos, y: 250 },
        style: { 
          background: isUp ? (document.documentElement.classList.contains('dark') ? '#1e293b' : '#ffffff') : '#fee2e2',
          border: `2px solid ${isUp ? borderColor : '#ef4444'}`,
          borderRadius: '12px', padding: '10px', width: '160px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
        }
      })

      initialEdges.push({ id: `e-scanner-${host.ip}`, source: 'scanner-root', target: host.ip, animated: isUp, style: { stroke: isUp ? '#10b981' : '#ef4444', strokeWidth: 2 } })
    })

    return { nodes: initialNodes, edges: initialEdges, isTrimmed }
  }, [parsedData])

  if (isScanning || !parsedData || parsedData.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center h-full min-h-[500px]">
        <p className="text-slate-400 font-mono text-sm">Ejecuta un escaneo para generar el mapa topológico...</p>
      </div>
    )
  }

  return (
    <section className="h-full min-h-[600px] w-full bg-slate-50 dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden relative">
      {isTrimmed && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10 bg-amber-100 border border-amber-300 text-amber-800 px-4 py-2 rounded-md text-xs font-bold shadow-md">
          Mostrando 100 de {parsedData.length} hosts para evitar sobrecarga gráfica.
        </div>
      )}
      {/* OPTIMIZACIÓN: onlyRenderVisibleElements salva la GPU en mapas inmensos */}
      <ReactFlow nodes={nodes} edges={edges} fitView attributionPosition="bottom-left" onlyRenderVisibleElements={true}>
        <Background color="#94a3b8" gap={16} />
        <Controls className="bg-white dark:bg-slate-800 fill-slate-700 dark:fill-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm" />
        <MiniMap className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm" nodeColor={(n) => n.style?.borderColor as string || '#818cf8'} />
      </ReactFlow>
    </section>
  )
}
