import { useMemo, useCallback } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
} from 'reactflow'
import type { Node, Edge, NodeTypes, EdgeTypes } from 'reactflow'
import 'reactflow/dist/style.css'
import { useScanStore } from '../../core/store/useScanStore'

// ==========================================================
// CONSTANTES FUERA DEL COMPONENTE
// ----------------------------------------------------------
// React Flow avisa si `nodeTypes`/`edgeTypes` se recrean en
// cada render. Registrarlos una vez fuera evita el warning
// y los re-renders innecesarios.
// ==========================================================
const nodeTypes: NodeTypes = {}
const edgeTypes: EdgeTypes = {}

const MAX_NODES = 100

// ==========================================================
// COMPONENTE
// ==========================================================
export function TopologyPanel() {
  const { parsedData, isScanning, theme } = useScanStore()

  const { nodes, edges, isTrimmed } = useMemo(() => {
    if (!Array.isArray(parsedData) || parsedData.length === 0) {
      return { nodes: [] as Node[], edges: [] as Edge[], isTrimmed: false }
    }

    const initialNodes: Node[] = [
      {
        id: 'scanner-root',
        type: 'input',
        data: { label: '💻 Escáner LESSSO' },
        position: { x: 300, y: 50 },
        style: {
          background: '#312e81',
          color: '#fff',
          fontWeight: 'bold',
          borderRadius: '8px',
          border: 'none',
          padding: '10px',
        },
      },
    ]
    const initialEdges: Edge[] = []

    const isTrimmed = parsedData.length > MAX_NODES
    const safeData = parsedData.slice(0, MAX_NODES)

    const isDark = theme === 'dark'

    safeData.forEach((host, index) => {
      const xPos = 50 + index * 220
      const isUp = host.status === 'up'

      const osLower = (host.os || '').toLowerCase()
      const openPorts = (host.ports || [])
        .filter((p) => p.state === 'open')
        .map((p) => p.portid)

      let osIcon = '📱'
      let borderColor = '#cbd5e1'

      if (
        openPorts.includes('80') ||
        openPorts.includes('443') ||
        openPorts.includes('8080')
      ) {
        osIcon = '🌐'
      } else if (
        openPorts.includes('3306') ||
        openPorts.includes('5432') ||
        openPorts.includes('1433')
      ) {
        osIcon = '🗄'
      } else if (
        osLower.includes('cisco') ||
        osLower.includes('router') ||
        openPorts.includes('23')
      ) {
        osIcon = '🖲'
        borderColor = '#10b981'
      } else if (osLower.includes('linux')) {
        osIcon = '🐧'
        borderColor = '#f59e0b'
      } else if (osLower.includes('windows')) {
        osIcon = '🪟'
        borderColor = '#3b82f6'
      } else if (osLower.includes('mac') || osLower.includes('apple')) {
        osIcon = '🍎'
        borderColor = '#94a3b8'
      }

      const totalPorts = host.ports?.length || 0
      const criticalPorts = (host.ports || []).filter((p) =>
        ['21', '22', '23', '445', '3389'].includes(p.portid),
      ).length

      initialNodes.push({
        id: host.ip,
        data: {
          label: (
            <div className="text-center flex flex-col items-center">
              <span className="text-2xl mb-1">{osIcon}</span>
              <div className="font-bold text-sm text-slate-800 dark:text-white tracking-widest">
                {host.ip}
              </div>
              {host.hostname && (
                <div className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mt-1 truncate w-32">
                  {host.hostname}
                </div>
              )}
              <div className="text-[9px] opacity-70 text-slate-600 dark:text-slate-300 w-32 truncate">
                {host.os || 'OS Desconocido'}
              </div>
              <div className="flex gap-1 mt-2">
                <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">
                  {totalPorts} Pts
                </span>
                {criticalPorts > 0 && (
                  <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold animate-pulse">
                    ! Crit
                  </span>
                )}
              </div>
            </div>
          ),
        },
        position: { x: xPos, y: 250 },
        style: {
          background: isUp ? (isDark ? '#0f172a' : '#ffffff') : '#fee2e2',
          border: `2px solid ${isUp ? borderColor : '#ef4444'}`,
          borderRadius: '12px',
          padding: '10px',
          width: '160px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        },
      })

      initialEdges.push({
        id: `e-scanner-${host.ip}`,
        source: 'scanner-root',
        target: host.ip,
        animated: isUp,
        style: {
          stroke: isUp ? '#3b82f6' : '#ef4444',
          strokeWidth: 2,
        },
      })
    })

    return { nodes: initialNodes, edges: initialEdges, isTrimmed }
  }, [parsedData, theme])

  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  if (isScanning && (!parsedData || parsedData.length === 0)) {
    return (
      <div className="bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center h-full min-h-[500px]">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-500 font-mono text-sm uppercase tracking-widest font-bold">
          Generando Mapa de Nodos...
        </p>
      </div>
    )
  }

  if (!parsedData || parsedData.length === 0) {
    return (
      <div className="bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center h-full min-h-[500px]">
        <p className="text-slate-500 font-mono text-xs uppercase tracking-widest">
          Ejecuta un escaneo en "Reconocimiento" para generar el mapa.
        </p>
      </div>
    )
  }

  return (
    <section className="h-full min-h-[600px] w-full bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden relative print:block print:h-auto print:overflow-visible">
      <style>{`
        @media print {
          body, html, #root, main, section, div { height: auto !important; min-height: auto !important; overflow: visible !important; }
          .print-hidden { display: none !important; }
          .print-force-colors { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .react-flow__controls, .react-flow__minimap { display: none !important; }
        }
      `}</style>

      <div className="absolute top-4 left-4 z-20 flex gap-2 print:hidden">
        <button
          onClick={handlePrint}
          className="px-3 py-1.5 bg-indigo-600 text-white text-[10px] font-bold uppercase rounded shadow-lg hover:bg-indigo-500 transition-colors"
        >
          Imprimir Topología
        </button>
      </div>

      {isTrimmed && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10 bg-amber-100 border border-amber-300 text-amber-800 px-4 py-2 rounded-md text-xs font-bold shadow-md print:hidden">
          Mostrando {MAX_NODES} de {parsedData.length} hosts para evitar sobrecarga gráfica.
        </div>
      )}

      <div className="w-full h-full print-force-colors">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          attributionPosition="bottom-left"
          onlyRenderVisibleElements={false}
        >
          <Background
            color={theme === 'dark' ? '#334155' : '#cbd5e1'}
            gap={16}
            variant={BackgroundVariant.Dots}
          />

          <Controls className="bg-white dark:bg-slate-800 fill-slate-700 dark:fill-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm" />

          <MiniMap
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm"
            nodeColor={(n) => (n.style?.borderColor as string) || '#818cf8'}
            maskColor={
              theme === 'dark'
                ? 'rgba(15, 23, 42, 0.7)'
                : 'rgba(241, 245, 249, 0.7)'
            }
          />
        </ReactFlow>
      </div>
    </section>
  )
}
