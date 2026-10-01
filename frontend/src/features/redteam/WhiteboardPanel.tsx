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
import 'reactflow/dist/style.css'

// ==========================================================
// CONSTANTES FUERA DEL COMPONENTE
// ----------------------------------------------------------
// React Flow avisa si nodeTypes/edgeTypes se recrean en cada
// render. Registrarlos una vez fuera evita el warning.
// ==========================================================
const nodeTypes: NodeTypes = {}
const edgeTypes: EdgeTypes = {}

const DEFAULT_NODES: Node[] = [
  {
    id: '1',
    type: 'default',
    data: { label: '💻 Máquina Atacante (LESSSO)' },
    position: { x: 250, y: 100 },
    style: {
      background: '#312e81',
      color: 'white',
      fontWeight: 'bold',
      padding: '10px',
      borderRadius: '8px',
    },
  },
]

// ==========================================================
// COMPONENTE
// ==========================================================
export function WhiteboardPanel() {
  const { redTeamWhiteboard, setRedTeamWhiteboard } = useScanStore()

  const initialNodes = useMemo(
    () => redTeamWhiteboard?.nodes || DEFAULT_NODES,
    // Solo queremos los nodos iniciales una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const initialEdges = useMemo(
    () => redTeamWhiteboard?.edges || [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const [nodeName, setNodeName] = useState('')
  const [nodeIcon, setNodeIcon] = useState('💻')
  const [nodeStyle, setNodeStyle] = useState('blue')
  const [edgeStyle, setEdgeStyle] = useState('attack')

  // ------------------------------------------------------
  // AUTOGUARDADO
  // ------------------------------------------------------
  // Sin guard de referencia, esto entra en bucle infinito:
  //   setNodes → render → useEffect → setRedTeamWhiteboard
  //   → store cambia → render → useEffect → ...
  // Guardamos solo si las referencias realmente cambiaron.
  // ------------------------------------------------------
  useEffect(() => {
    const cur = redTeamWhiteboard
    if (cur?.nodes === nodes && cur?.edges === edges) return
    setRedTeamWhiteboard({ nodes, edges })
  }, [nodes, edges, redTeamWhiteboard, setRedTeamWhiteboard])

  // ------------------------------------------------------
  // CONEXIONES
  // ------------------------------------------------------
  const onConnect = useCallback(
    (params: Edge | Connection) => {
      const edgeProps: any = { ...params, style: { strokeWidth: 2 } }

      if (edgeStyle === 'attack') {
        edgeProps.animated = true
        edgeProps.style.stroke = '#ef4444'
        edgeProps.markerEnd = { type: MarkerType.ArrowClosed, color: '#ef4444' }
      } else if (edgeStyle === 'pivot') {
        edgeProps.animated = true
        edgeProps.style.stroke = '#f59e0b'
        edgeProps.style.strokeDasharray = '5 5'
      } else {
        edgeProps.style.stroke = '#64748b'
      }

      setEdges((eds) => addEdge(edgeProps, eds))
    },
    [edgeStyle, setEdges],
  )

  // ------------------------------------------------------
  // AÑADIR NODO
  // ------------------------------------------------------
  const addNode = useCallback(() => {
    if (!nodeName.trim()) return

    const isText = nodeIcon === '📝'

    let styleProps: React.CSSProperties = {}
    if (isText) {
      styleProps = {
        background: '#fef08a',
        color: '#854d0e',
        border: 'none',
        borderRadius: '2px',
        padding: '15px',
        fontWeight: 'normal',
        fontSize: '11px',
        fontStyle: 'italic',
        boxShadow: '2px 4px 6px rgba(0,0,0,0.1)',
      }
    } else if (nodeStyle === 'red') {
      styleProps = {
        border: '2px solid #ef4444',
        background: '#fef2f2',
        color: '#991b1b',
        borderRadius: '8px',
        padding: '10px',
        fontWeight: 'bold',
      }
    } else if (nodeStyle === 'green') {
      styleProps = {
        border: '2px solid #10b981',
        background: '#ecfdf5',
        color: '#065f46',
        borderRadius: '8px',
        padding: '10px',
        fontWeight: 'bold',
      }
    } else {
      styleProps = {
        border: '2px solid #3b82f6',
        background: '#eff6ff',
        color: '#1e40af',
        borderRadius: '8px',
        padding: '10px',
        fontWeight: 'bold',
      }
    }

    const newNode: Node = {
      id: `node_${Date.now()}`,
      type: 'default',
      data: { label: isText ? nodeName : `${nodeIcon} ${nodeName.trim()}` },
      position: {
        x: Math.random() * 200 + 100,
        y: Math.random() * 200 + 100,
      },
      style: styleProps,
    }

    setNodes((nds) => [...nds, newNode])
    setNodeName('')
  }, [nodeName, nodeIcon, nodeStyle, setNodes])

  // ------------------------------------------------------
  // LIMPIAR
  // ------------------------------------------------------
  const clearBoard = useCallback(() => {
    if (confirm('¿Estás seguro de limpiar toda la pizarra táctica?')) {
      setNodes(DEFAULT_NODES)
      setEdges([])
    }
  }, [setNodes, setEdges])

  // ------------------------------------------------------
  // EXPORTAR / IMPORTAR
  // ------------------------------------------------------
  const exportWhiteboard = useCallback(async () => {
    try {
      const filePath = await save({
        defaultPath: `LESSSO_Diagrama_${Date.now()}.json`,
        filters: [{ name: 'JSON Workspace', extensions: ['json'] }],
      })
      if (filePath) {
        const payload = JSON.stringify({ nodes, edges }, null, 2)
        await writeTextFile(filePath, payload)
        alert(`Pizarra guardada en:\n${filePath}`)
      }
    } catch (e: any) {
      alert(`Error al guardar:\n${e.message || e}`)
    }
  }, [nodes, edges])

  const importWhiteboard = useCallback(async () => {
    try {
      const selected = await open({
        filters: [{ name: 'JSON Workspace', extensions: ['json'] }],
      })
      if (selected && !Array.isArray(selected)) {
        const contents = await readTextFile(selected)
        const data = JSON.parse(contents)
        if (data.nodes && data.edges) {
          setNodes(data.nodes)
          setEdges(data.edges)
        } else {
          alert('El archivo no es un diagrama válido.')
        }
      }
    } catch (e: any) {
      alert(`Error al cargar:\n${e.message || e}`)
    }
  }, [setNodes, setEdges])

  // ------------------------------------------------------
  // RENDER
  // ------------------------------------------------------
  return (
    <div className="w-full h-full min-h-[600px] bg-slate-50 dark:bg-slate-950 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 relative overflow-hidden">
      {/* BARRA DE HERRAMIENTAS */}
      <div className="absolute top-4 left-4 right-4 z-20 bg-white dark:bg-slate-900 p-2.5 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 flex flex-wrap gap-2 items-center">
        <select
          value={nodeIcon}
          onChange={(e) => setNodeIcon(e.target.value)}
          className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-800 dark:text-white outline-none"
        >
          <option value="💻">💻 PC/Laptop</option>
          <option value="🗄">🗄 Servidor</option>
          <option value="🌐">🌐 Web</option>
          <option value="🔥">🔥 Firewall</option>
          <option value="📦">📦 Contenedor</option>
          <option value="📝">📝 Nota Textual</option>
        </select>

        {nodeIcon !== '📝' && (
          <select
            value={nodeStyle}
            onChange={(e) => setNodeStyle(e.target.value)}
            className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-800 dark:text-white outline-none"
          >
            <option value="blue">Azul (Neutro)</option>
            <option value="red">Rojo (Comprometido)</option>
            <option value="green">Verde (Seguro)</option>
          </select>
        )}

        <input
          type="text"
          value={nodeName}
          onChange={(e) => setNodeName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addNode()}
          placeholder={nodeIcon === '📝' ? 'Escribe tu nota aquí...' : 'Nombre/IP...'}
          className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-800 dark:text-white outline-none flex-1 min-w-[150px]"
        />

        <button
          onClick={addNode}
          className="px-3 py-1 bg-indigo-600 text-white text-[10px] font-bold uppercase rounded hover:bg-indigo-500 transition-colors"
        >
          Añadir Nodo
        </button>

        <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />

        <select
          value={edgeStyle}
          onChange={(e) => setEdgeStyle(e.target.value)}
          className="px-2 py-1 text-[10px] font-bold border border-slate-300 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-800 dark:text-white outline-none"
        >
          <option value="attack">🔴 Lazo de Ataque</option>
          <option value="pivot">🟠 Lazo Pivot</option>
          <option value="normal">⚪ Lazo Red Normal</option>
        </select>

        <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />

        <button
          onClick={exportWhiteboard}
          className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold uppercase rounded hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 transition-colors"
        >
          Exportar .JSON
        </button>

        <button
          onClick={importWhiteboard}
          className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold uppercase rounded hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 transition-colors"
        >
          Cargar
        </button>

        <button
          onClick={clearBoard}
          className="px-3 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-[10px] font-bold uppercase rounded border border-red-200 dark:border-red-800/50 hover:bg-red-100 transition-colors"
        >
          Limpiar
        </button>
      </div>

      <div className="absolute inset-0 pt-16 z-10">
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
          <Controls className="bg-white dark:bg-slate-800 fill-slate-700 dark:fill-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm mb-4" />
        </ReactFlow>
      </div>
    </div>
  )
}
