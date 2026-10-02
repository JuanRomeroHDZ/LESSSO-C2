import { useMemo, useCallback, useState } from 'react'
import ReactFlow, { Background, Controls, MiniMap, BackgroundVariant } from 'reactflow'
import type { Node, Edge, NodeTypes, EdgeTypes } from 'reactflow'
import 'reactflow/dist/style.css'
import { useScanStore } from '../../core/store/useScanStore'
import { Printer, EyeOff, Eye } from 'lucide-react'

const MAX_NODES = 25

export function TopologyPanel() {
  const { parsedData, isScanning, theme } = useScanStore()
  
  // NUEVO: Estado para alternar entre ver todos los hosts o solo los vivos
  const [showOffline, setShowOffline] = useState(false)
  
  const nodeTypes = useMemo<NodeTypes>(() => ({}), []);
  const edgeTypes = useMemo<EdgeTypes>(() => ({}), []);

  const { nodes, edges, isTrimmed, offlineCount } = useMemo(() => {
    if (!Array.isArray(parsedData) || parsedData.length === 0) {
      return { nodes: [] as Node[], edges: [] as Edge[], isTrimmed: false, offlineCount: 0 }
    }

    const initialNodes: Node[] = [
      {
        id: 'scanner-root',
        type: 'input',
        data: { label: '💻 Escáner LESSSO' },
        position: { x: 300, y: 50 },
        style: {
          background: theme === 'dark' ? '#020617' : '#ffffff',
          color: theme === 'dark' ? '#2dd4bf' : '#0f172a',
          fontWeight: '900',
          borderRadius: '12px',
          border: theme === 'dark' ? '2px solid #2dd4bf' : '2px solid #0f172a',
          padding: '16px 24px',
          fontFamily: 'monospace',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        },
      },
    ]
    const initialEdges: Edge[] = []

    // LÓGICA DE FILTRADO
    const activeData = parsedData.filter(h => h.status === 'up');
    const offlineCount = parsedData.length - activeData.length;
    
    // Si showOffline es true, usamos todos los datos, si no, solo los vivos.
    const workingData = showOffline ? parsedData : activeData;

    const isTrimmed = workingData.length > MAX_NODES
    const safeData = workingData.slice(0, MAX_NODES)
    const isDark = theme === 'dark'

    safeData.forEach((host, index) => {
      // Al haber filtrado los muertos, el xPos acomodará los vivos sin dejar huecos
      const xPos = 50 + index * 220
      const isUp = host.status === 'up'
      const osLower = (host.os || '').toLowerCase()
      const openPorts = (host.ports || []).filter((p) => p.state === 'open').map((p) => p.portid)

      let osIcon = '📱'
      let borderColor = '#334155'

      if (openPorts.includes('80') || openPorts.includes('443') || openPorts.includes('8080')) { osIcon = '🌐' }  
      else if (openPorts.includes('3306') || openPorts.includes('5432') || openPorts.includes('1433')) { osIcon = '🗄' }  
      else if (osLower.includes('cisco') || osLower.includes('router') || openPorts.includes('23')) { osIcon = '🖲'; borderColor = '#10b981' }  
      else if (osLower.includes('linux')) { osIcon = '🐧'; borderColor = '#f59e0b' }  
      else if (osLower.includes('windows')) { osIcon = '🪟'; borderColor = '#3b82f6' }  
      else if (osLower.includes('mac') || osLower.includes('apple')) { osIcon = '🍎'; borderColor = '#94a3b8' }

      const totalPorts = host.ports?.length || 0
      const criticalPorts = (host.ports || []).filter((p) => ['21', '22', '23', '445', '3389'].includes(p.portid)).length

      initialNodes.push({
        id: host.ip,
        data: {
          label: (
            <div className={`text-center flex flex-col items-center ${!isUp ? 'opacity-50 grayscale' : ''}`}>
              <span className="text-3xl mb-2">{osIcon}</span>
              <div className="font-black text-[13px] text-slate-800 dark:text-white tracking-widest font-mono">
                {host.ip}
              </div>
              {host.hostname && (
                <div className="text-[10px] font-bold text-teal-600 dark:text-teal-400 mt-1 truncate w-32 uppercase tracking-wider">
                  {host.hostname}
                </div>
              )}
              <div className="text-[9px] opacity-70 text-slate-600 dark:text-slate-400 w-32 truncate mt-1">
                {host.os || 'OS Desconocido'}
              </div>
              <div className="flex gap-1.5 mt-3">
                <span className={`text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border ${isUp ? 'bg-teal-500/10 border-teal-500/20 text-teal-700 dark:text-teal-400' : 'bg-slate-500/10 border-slate-500/20 text-slate-500 dark:text-slate-400'}`}>
                  {isUp ? `${totalPorts} Pts` : 'Down'}
                </span>
                {criticalPorts > 0 && isUp && (
                  <span className="text-[9px] bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider animate-pulse">
                    ! Crit
                  </span>
                )}
              </div>
            </div>
          ),
        },
        position: { x: xPos, y: 250 },
        style: {
          background: isUp ? (isDark ? '#020617' : '#ffffff') : (isDark ? '#4c0519' : '#fee2e2'),
          border: `2px solid ${isUp ? borderColor : '#e11d48'}`,
          borderRadius: '12px',
          padding: '16px',
          width: '180px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        },
      })

      initialEdges.push({
        id: `e-scanner-${host.ip}`,
        source: 'scanner-root',
        target: host.ip,
        animated: isUp,
        style: { stroke: isUp ? '#2dd4bf' : '#e11d48', strokeWidth: 2, strokeDasharray: isUp ? 'none' : '5 5' },
      })
    })

    return { nodes: initialNodes, edges: initialEdges, isTrimmed, offlineCount }
  }, [parsedData, theme, showOffline])

  const handlePrint = useCallback(() => { window.print() }, [])

  if (isScanning && (!parsedData || parsedData.length === 0)) {
    return (
      <div className="bg-slate-50 dark:bg-[#020617] rounded-xl border border-slate-200 dark:border-slate-800/80 flex flex-col items-center justify-center h-full min-h-[500px] shadow-sm">
        <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-500 font-mono text-sm uppercase tracking-widest font-bold">Generando Mapa Táctico...</p>
      </div>
    )
  }

  if (!parsedData || parsedData.length === 0) {
    return (
      <div className="bg-slate-50 dark:bg-[#020617] rounded-xl border border-slate-200 dark:border-slate-800/80 flex items-center justify-center h-full min-h-[500px] shadow-sm">
        <p className="text-slate-500 font-mono text-xs uppercase tracking-widest font-bold">Ejecuta un escaneo en "Reconocimiento" para generar el mapa.</p>
      </div>
    )
  }

  return (
    <section className="h-full min-h-[600px] w-full bg-slate-50 dark:bg-[#020617] rounded-xl border border-slate-200 dark:border-slate-800/80 overflow-hidden relative shadow-sm print:block print:h-auto print:overflow-visible">
      <style>{`
        @media print {
          body, html, #root, main, section, div { height: auto !important; min-height: auto !important; overflow: visible !important; }
          .print-hidden { display: none !important; }
          .print-force-colors { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .react-flow__controls, .react-flow__minimap { display: none !important; }
        }
      `}</style>

      <div className="absolute top-4 left-4 z-20 flex gap-2 print:hidden">
        <button onClick={handlePrint} className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-md shadow-lg hover:bg-teal-500 transition-colors">
          <Printer size={14} /> Imprimir Topología
        </button>
        
        {/* BOTÓN TOGGLE OFFLINE */}
        {offlineCount > 0 && (
          <button 
            onClick={() => setShowOffline(!showOffline)} 
            className={`flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded-md shadow-lg transition-colors border ${
              showOffline 
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-300 dark:hover:bg-slate-700' 
                : 'bg-white dark:bg-[#0b1120] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 border-slate-200 dark:border-slate-800'
            }`}
          >
            {showOffline ? (
              <><Eye size={14} /> Ocultar Inactivos</>
            ) : (
              <><EyeOff size={14} /> Ver Inactivos ({offlineCount})</>
            )}
          </button>
        )}
      </div>

      {isTrimmed && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10 bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider shadow-md backdrop-blur-sm print:hidden">
          Mostrando {MAX_NODES} de {showOffline ? parsedData.length : parsedData.length - offlineCount} hosts
        </div>
      )}

      <div className="w-full h-full print-force-colors">
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView attributionPosition="bottom-left" onlyRenderVisibleElements={false}>
          <Background color={theme === 'dark' ? '#1e293b' : '#cbd5e1'} gap={16} variant={BackgroundVariant.Dots} />
          <Controls className="bg-white dark:bg-slate-900 fill-slate-700 dark:fill-slate-300 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm" />
          <MiniMap className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm" nodeColor={(n) => (n.style?.borderColor as string) || '#2dd4bf'} maskColor={theme === 'dark' ? 'rgba(2, 6, 23, 0.8)' : 'rgba(241, 245, 249, 0.8)'} />
        </ReactFlow>
      </div>
    </section>
  )
}
