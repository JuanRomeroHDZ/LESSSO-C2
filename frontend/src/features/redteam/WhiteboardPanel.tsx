import { useState, useCallback, useEffect, useMemo } from 'react'
import ReactFlow, {
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
  BackgroundVariant,
} from 'reactflow'
import type { Connection, Edge, Node, NodeTypes, EdgeTypes } from 'reactflow'
import { save, open } from '@tauri-apps/plugin-dialog'
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs'
import { useScanStore } from '../../core/store/useScanStore'
import { Download, Upload, Trash2, Camera, Plus, Zap, Route, Activity } from 'lucide-react'
import 'reactflow/dist/style.css'

const nodeTypes: NodeTypes = {}
const edgeTypes: EdgeTypes = {}

const DEFAULT_NODES: Node[] = [
  {
    id: '1',
    type: 'default',
    data: { label: '💻 Máquina Atacante (LESSSO)' },
    position: { x: 250, y: 100 },
    style: {
      background: '#0f172a',
      color: '#38bdf8',
      fontWeight: 'bold',
      padding: '12px 16px',
      borderRadius: '8px',
      border: '2px solid #0284c7',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    },
  },
]

const ICONS = [
  { id: '💻', label: 'PC / Target' },
  { id: '🗄', label: 'Servidor' },
  { id: '💽', label: 'Base de Datos' },
  { id: '🌐', label: 'Web / Cloud' },
  { id: '🔥', label: 'Firewall' },
  { id: '📡', label: 'Router / Red' },
  { id: '📱', label: 'Móvil' },
  { id: '📝', label: 'Nota' },
]

const COLORS = [
  { id: 'blue', hex: 'bg-blue-500', label: 'Neutro' },
  { id: 'red', hex: 'bg-rose-500', label: 'Comprometido' },
  { id: 'green', hex: 'bg-emerald-500', label: 'Seguro' },
  { id: 'purple', hex: 'bg-purple-500', label: 'Tercero' },
]

export function WhiteboardPanel() {
  const { redTeamWhiteboard, setRedTeamWhiteboard } = useScanStore()

  const initialNodes = useMemo(() => redTeamWhiteboard?.nodes || DEFAULT_NODES, [])
  const initialEdges = useMemo(() => redTeamWhiteboard?.edges || [], [])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const [nodeName, setNodeName] = useState('')
  const [nodeIcon, setNodeIcon] = useState('💻')
  const [nodeStyle, setNodeStyle] = useState('blue')
  const [edgeStyle, setEdgeStyle] = useState('attack')

  useEffect(() => {
    const cur = redTeamWhiteboard
    if (cur?.nodes === nodes && cur?.edges === edges) return
    setRedTeamWhiteboard({ nodes, edges })
  }, [nodes, edges, redTeamWhiteboard, setRedTeamWhiteboard])

  const onConnect = useCallback(
    (params: Edge | Connection) => {
      const edgeProps: any = { ...params, style: { strokeWidth: 2.5 } }

      if (edgeStyle === 'attack') {
        edgeProps.animated = true
        edgeProps.style.stroke = '#ef4444'
        edgeProps.markerEnd = { type: MarkerType.ArrowClosed, color: '#ef4444' }
      } else if (edgeStyle === 'pivot') {
        edgeProps.animated = true
        edgeProps.style.stroke = '#f59e0b'
        edgeProps.style.strokeDasharray = '5 5'
        edgeProps.markerEnd = { type: MarkerType.ArrowClosed, color: '#f59e0b' }
      } else {
        edgeProps.style.stroke = '#64748b'
        edgeProps.markerEnd = { type: MarkerType.ArrowClosed, color: '#64748b' }
      }

      setEdges((eds) => addEdge(edgeProps, eds))
    },
    [edgeStyle, setEdges],
  )

  const addNode = useCallback(() => {
    if (!nodeName.trim()) return

    const isText = nodeIcon === '📝'
    let styleProps: React.CSSProperties = {
      padding: '10px 16px',
      borderRadius: '8px',
      fontWeight: 'bold',
      fontSize: '12px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    }

    if (isText) {
      styleProps = { ...styleProps, background: '#fef08a', color: '#854d0e', border: '1px solid #eab308', fontStyle: 'italic' }
    } else if (nodeStyle === 'red') {
      styleProps = { ...styleProps, border: '2px solid #ef4444', background: '#fef2f2', color: '#991b1b' }
    } else if (nodeStyle === 'green') {
      styleProps = { ...styleProps, border: '2px solid #10b981', background: '#ecfdf5', color: '#065f46' }
    } else if (nodeStyle === 'purple') {
      styleProps = { ...styleProps, border: '2px solid #a855f7', background: '#faf5ff', color: '#6b21a8' }
    } else {
      styleProps = { ...styleProps, border: '2px solid #3b82f6', background: '#eff6ff', color: '#1e40af' }
    }

    const newNode: Node = {
      id: `node_${Date.now()}`,
      type: 'default',
      data: { label: isText ? nodeName : `${nodeIcon} ${nodeName.trim()}` },
      position: { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 },
      style: styleProps,
    }

    setNodes((nds) => [...nds, newNode])
    setNodeName('')
  }, [nodeName, nodeIcon, nodeStyle, setNodes])

  const clearBoard = useCallback(() => {
    if (confirm('¿Estás seguro de limpiar toda la pizarra táctica?')) {
      setNodes(DEFAULT_NODES)
      setEdges([])
    }
  }, [setNodes, setEdges])

  const handleScreenshotHint = () => {
    alert("📸 TIP DE PRODUCTIVIDAD:\n\n1. Usa tu atajo nativo para capturar pantalla (Windows: Win+Shift+S / Mac: Cmd+Shift+4).\n2. Selecciona la región del mapa.\n3. Ve a tu Bitácora de Auditoría y presiona Ctrl+V.\n\nLESSSO guardará e inyectará la imagen automáticamente en tu reporte.");
  }

  const exportWhiteboard = useCallback(async () => {
    try {
      const filePath = await save({ defaultPath: `LESSSO_Diagrama_${Date.now()}.json`, filters: [{ name: 'JSON Workspace', extensions: ['json'] }] })
      if (filePath) {
        await writeTextFile(filePath, JSON.stringify({ nodes, edges }, null, 2))
        alert(`Pizarra guardada en:\n${filePath}`)
      }
    } catch (e: any) { alert(`Error al guardar:\n${e.message || e}`) }
  }, [nodes, edges])

  const importWhiteboard = useCallback(async () => {
    try {
      const selected = await open({ filters: [{ name: 'JSON Workspace', extensions: ['json'] }] })
      if (selected && !Array.isArray(selected)) {
        const data = JSON.parse(await readTextFile(selected))
        if (data.nodes && data.edges) { setNodes(data.nodes); setEdges(data.edges); } 
        else { alert('El archivo no es un diagrama válido.') }
      }
    } catch (e: any) { alert(`Error al cargar:\n${e.message || e}`) }
  }, [setNodes, setEdges])


  return (
    <div className="w-full h-full min-h-[600px] bg-slate-50 dark:bg-[#020617] rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 relative overflow-hidden">
      
      {/* 1. PALETA FLOTANTE CENTRAL (CREACIÓN DE NODOS) */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 bg-white dark:bg-[#0b1120] p-4 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 flex flex-col gap-3 w-[90%] max-w-[420px] animate-in slide-in-from-top-4">
        
        <div className="flex gap-2">
          <input
            type="text"
            value={nodeName}
            onChange={(e) => setNodeName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addNode()}
            placeholder={nodeIcon === '📝' ? 'Escribe tu nota aquí...' : 'Ej: Servidor Web (10.0.0.5)'}
            className="flex-1 px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-[#020617] dark:text-white outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/50 transition-all font-medium"
          />
          <button onClick={addNode} disabled={!nodeName.trim()} className="px-4 py-2 bg-teal-600 text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-teal-500 disabled:opacity-50 transition-colors flex items-center gap-1">
            <Plus size={14} /> Añadir
          </button>
        </div>

        <div className="flex items-center justify-between gap-4">
          {/* Selector de Íconos */}
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/50 p-1 rounded-lg border border-slate-200 dark:border-slate-700/50 flex-1 overflow-x-auto custom-scrollbar">
            {ICONS.map(icon => (
              <button 
                key={icon.id} 
                onClick={() => setNodeIcon(icon.id)} 
                title={icon.label}
                className={`p-1.5 rounded-md text-sm transition-all ${nodeIcon === icon.id ? 'bg-white dark:bg-slate-700 shadow-sm scale-110' : 'opacity-60 hover:opacity-100'}`}
              >
                {icon.id}
              </button>
            ))}
          </div>

          {/* Selector de Colores */}
          {nodeIcon !== '📝' && (
            <div className="flex gap-1.5 shrink-0">
              {COLORS.map(c => (
                <button
                  key={c.id}
                  onClick={() => setNodeStyle(c.id)}
                  title={c.label}
                  className={`w-5 h-5 rounded-full border-2 transition-all ${c.hex} ${nodeStyle === c.id ? 'border-slate-900 dark:border-white scale-125' : 'border-transparent opacity-70 hover:opacity-100'}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 2. ACCIONES FLOTANTES (TOP RIGHT) */}
      <div className="absolute top-6 right-6 z-20 flex flex-col gap-2">
        <div className="flex flex-col bg-white dark:bg-[#0b1120] rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-1.5">
          <button onClick={handleScreenshotHint} title="Capturar Lienzo" className="p-2 text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-lg transition-colors"><Camera size={16} /></button>
          <div className="h-px bg-slate-200 dark:bg-slate-700 my-1 mx-2" />
          <button onClick={exportWhiteboard} title="Guardar Proyecto (.json)" className="p-2 text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg transition-colors"><Download size={16} /></button>
          <button onClick={importWhiteboard} title="Cargar Proyecto (.json)" className="p-2 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"><Upload size={16} /></button>
          <div className="h-px bg-slate-200 dark:bg-slate-700 my-1 mx-2" />
          <button onClick={clearBoard} title="Limpiar Pizarra" className="p-2 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"><Trash2 size={16} /></button>
        </div>
      </div>

      {/* 3. SELECTOR DE CONEXIONES (BOTTOM CENTER) */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 bg-white dark:bg-[#0b1120] p-1.5 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 flex gap-1 animate-in slide-in-from-bottom-4">
        <button 
          onClick={() => setEdgeStyle('attack')} 
          className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${edgeStyle === 'attack' ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'}`}
        >
          <Zap size={14} className={edgeStyle === 'attack' ? 'fill-rose-500' : ''} /> Lazo de Ataque
        </button>
        <button 
          onClick={() => setEdgeStyle('pivot')} 
          className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${edgeStyle === 'pivot' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'}`}
        >
          <Route size={14} /> Lazo Pivot
        </button>
        <button 
          onClick={() => setEdgeStyle('normal')} 
          className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${edgeStyle === 'normal' ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'}`}
        >
          <Activity size={14} /> Red Normal
        </button>
      </div>

      {/* LIENZO DE REACT FLOW */}
      <div className="absolute inset-0 z-10">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
        >
          <Background color="#94a3b8" gap={20} variant={BackgroundVariant.Dots} size={2} />
          {/* Controles nativos movidos a la izquierda para no estorbar a las acciones flotantes */}
          <Controls className="bg-white dark:bg-slate-800 fill-slate-700 dark:fill-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm mb-4 ml-2" />
        </ReactFlow>
      </div>
    </div>
  )
}
