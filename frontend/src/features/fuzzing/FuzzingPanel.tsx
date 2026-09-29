import { useState, useMemo } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import { useScanStore } from '../../core/store/useScanStore';

interface TreeNode { name: string; path: string; status?: number; size?: string; children: Record<string, TreeNode>; }

export function FuzzingPanel() {
  const { fuzzerRawOutput, fuzzerUrl, isFuzzing, clearFuzzer, setRedTeamNotes, redTeamNotes } = useScanStore();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchPath, setSearchPath] = useState('');

  const treeData = useMemo(() => {
    const root: TreeNode = { name: 'ROOT', path: '/', children: {} };
    if (!fuzzerRawOutput) return root;

    const lines = fuzzerRawOutput.split('\n');
    const regex = /\/?([a-zA-Z0-9_./-]+)\s*(?:\(Status:\s*(\d+)\)|\[Status:\s*(\d+)).*?Size:\s*(\d+)/i;

    lines.forEach(line => {
      const match = line.match(regex);
      if (match) {
        let rawPath = match[1]; if (!rawPath.startsWith('/')) rawPath = '/' + rawPath;
        const status = parseInt(match[2] || match[3] || '0', 10);
        const size = match[4] ? `${match[4]} B` : undefined;

        if (filterStatus !== 'all' && status.toString() !== filterStatus) return;
        if (searchPath && !rawPath.toLowerCase().includes(searchPath.toLowerCase())) return;

        const parts = rawPath.split('/').filter(p => p.length > 0);
        let currentNode = root;
        parts.forEach((part, index) => {
          if (!currentNode.children[part]) { currentNode.children[part] = { name: part, path: '/' + parts.slice(0, index + 1).join('/'), children: {} }; }
          currentNode = currentNode.children[part];
        });
        currentNode.status = status; currentNode.size = size;
      }
    });
    return root;
  }, [fuzzerRawOutput, filterStatus, searchPath]);

  const handleOpenBrowser = async (path: string) => {
    if (!fuzzerUrl) { alert('No hay URL base configurada.'); return; }
    const fullUrl = fuzzerUrl.endsWith('/') ? fuzzerUrl.slice(0, -1) + path : fuzzerUrl + path;
    await openUrl(fullUrl);
  };

  const handleSendToNotes = (path: string, status: number) => {
    const entry = `\n- **[${status}]** Descubierto: \`${path}\`\n`;
    setRedTeamNotes(redTeamNotes + entry);
    alert('✅ Añadido a la bitácora!');
  };

  const handleExportTxt = async () => {
    const lines = fuzzerRawOutput.split('\n').filter(l => l.includes('(Status: 200)') || l.includes('(Status: 301)'));
    try {
      const filePath = await save({ defaultPath: `fuzzing_report.txt`, filters: [{ name: 'Text', extensions: ['txt'] }] });
      if (filePath) { await writeTextFile(filePath, lines.join('\n')); alert('Exportado correctamente.'); }
    } catch (err) {}
  };

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
      <div className="flex items-center gap-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded px-1 transition-colors group w-full justify-between">
        <div className="flex items-center gap-2">
            <span className="text-lg">{hasChildren ? '📁' : '📄'}</span>
            <span className="text-xs font-bold font-mono text-slate-700 dark:text-slate-200">{node.name}</span>
            {node.status && <span className={`text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm ${statusColor}`}>{node.status}</span>}
            {node.size && <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500">[{node.size}]</span>}
        </div>
        {!hasChildren && node.status && (
            <div className="hidden group-hover:flex gap-1">
                <button onClick={() => handleOpenBrowser(node.path)} className="text-[10px] bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded hover:bg-[#0b282c] hover:text-white transition-colors" title="Abrir en Navegador">🌐</button>
                <button onClick={() => handleSendToNotes(node.path, node.status!)} className="text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded hover:bg-emerald-500 hover:text-white transition-colors" title="Enviar a Notas">📝</button>
            </div>
        )}
      </div>
    );

    if (!hasChildren && !isRoot) { return <div key={node.path} className="ml-4 border-l-2 border-slate-200 dark:border-slate-800 pl-2">{nodeContent}</div>; }

    return (
      <details key={node.path} open={isRoot || !!searchPath} className={`ml-4 ${isRoot ? '!ml-0' : 'border-l-2 border-slate-200 dark:border-slate-800 pl-2'}`}>
        <summary className="cursor-pointer list-none flex items-center select-none">
           <span className="text-[10px] text-slate-400 mr-1 transition-transform group-open:rotate-90">▶</span>
           {isRoot ? (<div className="flex items-center gap-2 py-1 px-2 bg-[#0b282c]/10 dark:bg-teal-900/20 rounded border border-[#0b282c]/20 dark:border-teal-800/50 w-full"><span className="text-lg">🌐</span><span className="text-xs font-black text-[#0b282c] dark:text-teal-400 uppercase tracking-widest">OBJETIVO WEB</span></div>) : nodeContent}
        </summary>
        <div className="mt-1">{Object.values(node.children).map(child => renderTree(child))}</div>
      </details>
    );
  };

  return (
    <div className="flex h-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
      <div className="w-1/2 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50 dark:bg-slate-950">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0">
          <h2 className="text-xs font-black text-[#0b282c] dark:text-teal-400 uppercase tracking-widest flex items-center">
            {isFuzzing ? <span className="w-2 h-2 bg-red-500 rounded-full animate-ping mr-2"></span> : <span className="text-base mr-2">📋</span>} Salida Raw
          </h2>
          <button onClick={clearFuzzer} className="text-[9px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 px-2 py-1 rounded transition-colors">Limpiar</button>
        </div>
        <textarea readOnly value={fuzzerRawOutput} className="flex-1 w-full p-4 bg-transparent text-[11px] font-mono text-slate-700 dark:text-slate-300 outline-none resize-none custom-scrollbar" />
      </div>

      <div className="w-1/2 flex flex-col bg-white dark:bg-slate-900 relative">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0 bg-slate-50 dark:bg-slate-950">
          <input type="text" value={searchPath} onChange={e => setSearchPath(e.target.value)} placeholder="🔍 Buscar /api..." className="px-2 py-1 text-xs outline-none bg-transparent border-b border-slate-300 dark:border-slate-600 dark:text-white" />
          <div className="flex gap-2">
            <button onClick={handleExportTxt} className="px-2 py-1 bg-slate-200 dark:bg-slate-800 text-[9px] font-bold rounded">Exportar 200/301</button>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="text-[9px] font-bold px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded outline-none text-slate-700 dark:text-slate-200">
              <option value="all">Todos</option><option value="200">200 (OK)</option><option value="301">301 (Redir)</option><option value="403">403 (Forbid)</option>
            </select>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 custom-scrollbar">
          {fuzzerRawOutput.trim().length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400"><span className="text-4xl mb-2">🕸️</span><p className="text-xs font-bold">Lanza el Fuzzer en Arsenal...</p></div>
          ) : <div className="animate-in fade-in">{renderTree(treeData, true)}</div>}
        </div>
      </div>
    </div>
  );
}
