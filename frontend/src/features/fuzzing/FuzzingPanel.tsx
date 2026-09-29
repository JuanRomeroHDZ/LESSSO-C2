import { useState, useMemo } from 'react';

// Interfaz para construir el árbol de directorios
interface TreeNode {
  name: string;
  path: string;
  status?: number;
  size?: string;
  children: Record<string, TreeNode>;
}

export function FuzzingPanel() {
  const [rawOutput, setRawOutput] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // El "Cerebro" Parseador (Soporta Gobuster y FFUF en texto plano)
  const treeData = useMemo(() => {
    const root: TreeNode = { name: 'ROOT', path: '/', children: {} };
    if (!rawOutput) return root;

    const lines = rawOutput.split('\n');
    
    // Regex para detectar líneas útiles. 
    // Atrapa: /admin/login.php (Status: 200) [Size: 1234]
    // Atrapa: admin [Status: 403, Size: 256, Words: 12]
    const regex = /\/?([a-zA-Z0-9_./-]+)\s*(?:\(Status:\s*(\d+)\)|\[Status:\s*(\d+).*?Size:\s*(\d+))/i;

    lines.forEach(line => {
      const match = line.match(regex);
      if (match) {
        let rawPath = match[1];
        if (!rawPath.startsWith('/')) rawPath = '/' + rawPath;
        
        const status = parseInt(match[2] || match[3] || '0', 10);
        const size = match[4] ? `${match[4]} B` : undefined;

        if (filterStatus !== 'all' && status.toString() !== filterStatus) return;

        const parts = rawPath.split('/').filter(p => p.length > 0);
        let currentNode = root;

        parts.forEach((part, index) => {
          if (!currentNode.children[part]) {
            currentNode.children[part] = {
              name: part,
              path: '/' + parts.slice(0, index + 1).join('/'),
              children: {}
            };
          }
          currentNode = currentNode.children[part];
        });

        currentNode.status = status;
        currentNode.size = size;
      }
    });

    return root;
  }, [rawOutput, filterStatus]);

  // Renderizador recursivo del árbol 
  const renderTree = (node: TreeNode, isRoot: boolean = false) => {
    const hasChildren = Object.keys(node.children).length > 0;
    
    let statusColor = "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
    if (node.status) {
      if (node.status >= 200 && node.status < 300) statusColor = "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800";
      else if (node.status >= 300 && node.status < 400) statusColor = "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400 border border-blue-200 dark:border-blue-800";
      else if (node.status >= 400 && node.status < 500) statusColor = "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400 border border-orange-200 dark:border-orange-800";
      else if (node.status >= 500) statusColor = "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400 border border-red-200 dark:border-red-800";
    }

    const nodeContent = (
      <div className="flex items-center gap-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded px-1 transition-colors group">
        <span className="text-lg">{hasChildren ? '📁' : '📄'}</span>
        <span className="text-xs font-bold font-mono text-slate-700 dark:text-slate-200 group-hover:text-[#0b282c] dark:group-hover:text-teal-400 transition-colors">
          {node.name}
        </span>
        {node.status && (
          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm ${statusColor}`}>
            {node.status}
          </span>
        )}
        {node.size && (
          <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500">
            [{node.size}]
          </span>
        )}
      </div>
    );

    if (!hasChildren && !isRoot) {
      return <div key={node.path} className="ml-4 border-l-2 border-slate-200 dark:border-slate-800 pl-2">{nodeContent}</div>;
    }

    return (
      <details key={node.path} open={isRoot} className={`ml-4 ${isRoot ? '!ml-0' : 'border-l-2 border-slate-200 dark:border-slate-800 pl-2'}`}>
        <summary className="cursor-pointer list-none flex items-center select-none">
           <span className="text-[10px] text-slate-400 mr-1 transition-transform group-open:rotate-90">▶</span>
           {isRoot ? (
             <div className="flex items-center gap-2 py-1 px-2 bg-[#0b282c]/10 dark:bg-teal-900/20 rounded border border-[#0b282c]/20 dark:border-teal-800/50 w-full">
                <span className="text-lg">🌐</span>
                <span className="text-xs font-black text-[#0b282c] dark:text-teal-400 uppercase tracking-widest">OBJETIVO WEB</span>
             </div>
           ) : nodeContent}
        </summary>
        <div className="mt-1">
          {Object.values(node.children).map(child => renderTree(child))}
        </div>
      </details>
    );
  };

  return (
    <div className="flex h-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
      
      {/* PANEL IZQUIERDO: Input Raw */}
      <div className="w-1/2 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50 dark:bg-slate-950">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0">
          <h2 className="text-xs font-black text-[#0b282c] dark:text-teal-400 uppercase tracking-widest flex items-center">
            <span className="text-base mr-2">📋</span> Pegar Log (Gobuster/FFUF)
          </h2>
          <button onClick={() => setRawOutput('')} className="text-[9px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 px-2 py-1 rounded transition-colors">Limpiar</button>
        </div>
        <textarea 
          value={rawOutput}
          onChange={(e) => setRawOutput(e.target.value)}
          placeholder="Pega aquí la salida de la terminal de tu fuzzer...\n\nEjemplo:\n/admin (Status: 403)\n/login.php (Status: 200) [Size: 554]\n/assets/img/logo.png [Status: 200, Size: 12MB]"
          className="flex-1 w-full p-4 bg-transparent text-[11px] font-mono text-slate-700 dark:text-slate-300 outline-none resize-none custom-scrollbar"
        />
      </div>

      {/* PANEL DERECHO: Árbol */}
      <div className="w-1/2 flex flex-col bg-white dark:bg-slate-900 relative">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0 bg-slate-50 dark:bg-slate-950">
          <h2 className="text-xs font-black text-[#0b282c] dark:text-teal-400 uppercase tracking-widest flex items-center">
            <span className="text-base mr-2">🌳</span> Árbol de Directorios
          </h2>
          <select 
            value={filterStatus} 
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-[10px] font-bold px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded outline-none text-slate-700 dark:text-slate-200"
          >
            <option value="all">Todos los Códigos</option>
            <option value="200">🟢 200 (OK)</option>
            <option value="301">🔵 301 (Redirect)</option>
            <option value="302">🔵 302 (Found)</option>
            <option value="401">🟠 401 (Unauthorized)</option>
            <option value="403">🟠 403 (Forbidden)</option>
            <option value="500">🔴 500 (Server Error)</option>
          </select>
        </div>

        <div className="flex-1 overflow-auto p-4 custom-scrollbar">
          {rawOutput.trim().length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <span className="text-4xl mb-2">🕸️</span>
              <p className="text-xs font-bold">Esperando datos de Fuzzing...</p>
            </div>
          ) : (
            <div className="animate-in fade-in">
              {renderTree(treeData, true)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
