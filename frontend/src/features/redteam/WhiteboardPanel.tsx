import { useState, useCallback } from 'react';
import ReactFlow, { Background, Controls, addEdge, useNodesState, useEdgesState } from 'reactflow';
import type { Connection, Edge, Node } from 'reactflow';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import 'reactflow/dist/style.css';

const initialNodes: Node[] = [
  { 
    id: '1', 
    type: 'default', 
    data: { label: '💻 Scanner (Local)' }, 
    position: { x: 250, y: 100 }, 
    style: { background: '#312e81', color: 'white', fontWeight: 'bold', padding: '10px', borderRadius: '8px' } 
  }
];

export function WhiteboardPanel() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [nodeName, setNodeName] = useState('');
  const [nodeIcon, setNodeIcon] = useState('💻');

  const onConnect = useCallback((params: Edge | Connection) => 
    setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#ef4444', strokeWidth: 2 } }, eds)), 
  [setEdges]);

  const addNode = () => {
    if (!nodeName.trim()) return;
    const newNode: Node = {
      id: `node_${Date.now()}`,
      type: 'default',
      data: { label: `${nodeIcon} ${nodeName.trim()}` },
      position: { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 },
      style: { border: '2px solid #3b82f6', borderRadius: '8px', padding: '10px', background: '#fff', color: '#000', fontWeight: 'bold', fontSize: '12px' }
    };
    setNodes((nds) => [...nds, newNode]);
    setNodeName('');
  };

  const clearBoard = () => {
    if (confirm("¿Estás seguro de limpiar toda la pizarra?")) {
      setNodes(initialNodes);
      setEdges([]);
    }
  };

  const exportWhiteboard = async () => {
    try {
      const filePath = await save({ defaultPath: `pizarra_tactica_${Date.now()}.json`, filters: [{ name: 'JSON Workspace', extensions: ['json'] }] });
      if (filePath) {
        const payload = JSON.stringify({ nodes, edges }, null, 2);
        await writeTextFile(filePath, payload);
        alert(`Pizarra guardada exitosamente en:\n${filePath}`);
      }
    } catch (e: any) { alert(`Error al guardar:\n${e.message || e}`); }
  };

  const importWhiteboard = async () => {
    try {
      const selected = await open({ filters: [{ name: 'JSON Workspace', extensions: ['json'] }] });
      if (selected && !Array.isArray(selected)) {
        const contents = await readTextFile(selected);
        const data = JSON.parse(contents);
        if (data.nodes && data.edges) {
          setNodes(data.nodes);
          setEdges(data.edges);
        } else { alert("El archivo no es una Pizarra válida."); }
      }
    } catch (e: any) { alert(`Error al cargar:\n${e.message || e}`); }
  };

  return (
    <div className="w-full h-full min-h-[600px] bg-slate-50 dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 relative overflow-hidden">
      
      {/* BARRA DE HERRAMIENTAS (Z-Index alto para estar sobre el lienzo) */}
      <div className="absolute top-4 left-4 right-4 z-20 bg-white dark:bg-slate-800 p-3 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 flex space-x-2 flex-wrap gap-y-2">
        <select value={nodeIcon} onChange={e => setNodeIcon(e.target.value)} className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-900 dark:text-white outline-none">
          <option value="💻">💻 PC/Laptop</option>
          <option value="🖲️">🖲️ Switch/Router</option>
          <option value="🗄️">🗄️ Servidor</option>
          <option value="🌐">🌐 Nube/Web</option>
          <option value="📱">📱 Móvil/Tablet</option>
          <option value="🔥">🔥 Firewall</option>
          <option value="🖨️">🖨️ Impresora</option>
          <option value="🔊">🔊 IoT / Smart Device</option>
          <option value="📷">📷 Cámara IP</option>
          <option value="📦">📦 Contenedor</option>
          <option value="❓">❓ Otro</option>
        </select>
        <input 
          type="text" 
          value={nodeName} 
          onChange={(e) => setNodeName(e.target.value)} 
          onKeyDown={(e) => e.key === 'Enter' && addNode()}
          placeholder="Nombre (ej: BD Principal)" 
          className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-900 dark:text-white outline-none w-40"
        />
        <button onClick={addNode} className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-500 transition-colors">Añadir Nodo</button>
        <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>
        <button onClick={exportWhiteboard} className="px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded hover:bg-slate-200 transition-colors">Guardar</button>
        <button onClick={importWhiteboard} className="px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded hover:bg-slate-200 transition-colors">Cargar</button>
        <button onClick={clearBoard} className="px-3 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-bold rounded border border-red-200 dark:border-red-800/50 hover:bg-red-100 transition-colors">Limpiar</button>
      </div>
      
      {/* CONTENEDOR ABSOLUTO DEL LIENZO (Evita el colapso) */}
      <div className="absolute inset-0 pt-16 z-10">
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} fitView>
          <Background color="#94a3b8" gap={16} />
          <Controls className="bg-white dark:bg-slate-800 fill-slate-700 dark:fill-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm mb-4" />
        </ReactFlow>
      </div>
    </div>
  );
}
