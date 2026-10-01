import { useState, useMemo } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import { useScanStore } from '../../core/store/useScanStore';
import { FolderOpen, FileText, Globe, Download, Trash2, Search, Target, Radar, Terminal } from 'lucide-react';

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
    const entry = `\n**[${status}]** Descubierto: \`${path}\`\n`;
    setRedTeamNotes(redTeamNotes + entry);
    alert('✅ Añadido a la bitácora!');
  };

  const handleExportTxt = async () => {
    const lines = fuzzerRawOutput.split('\n').filter(l => l.includes('(Status: 200)') || l.includes('(Status: 301)'));
    try {
      const filePath = await save({ defaultPath: `fuzzing_report.txt`, filters: [{ name: 'Text', extensions: ['txt'] }] });
      if (filePath) { await writeTextFile(filePath, lines.join('\n')); alert('Exportado correctamente.'); }
    } catch {}
  };

  const renderTree = (node: TreeNode, isRoot: boolean = false) => {
    const hasChildren = Object.keys(node.children).length > 0;
    let statusColor = "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700";
    if (node.status) {
      if (node.status >= 200 && node.status < 300) statusColor = "bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20";
      else if (node.status >= 300 && node.status < 400) statusColor = "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20";
      else if (node.status >= 400 && node.status < 500) statusColor = "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20";
      else if (node.status >= 500) statusColor = "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20";
    }

    const nodeContent = (
      <div className="flex items-center gap-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg px-2 transition-colors group w-full justify-between">
        <div className="flex items-center gap-2">
          {hasChildren ? <FolderOpen size={14} className="text-teal-500" /> : <FileText size={14} className="text-slate-400" />}
          <span className="text-xs font-medium font-mono text-slate-700 dark:text-slate-200">{node.name}</span>
          {node.status && <span className={`text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm ${statusColor}`}>{node.status}</span>}
          {node.size && <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500">[{node.size}]</span>}
        </div>
        {!hasChildren && node.status && (
          <div className="hidden group-hover:flex gap-1.5">
            <button onClick={() => handleOpenBrowser(node.path)} className="text-[10px] flex items-center gap-1 bg-slate-200 dark:bg-slate-800 px-2 py-1 rounded-md hover:bg-teal-500 hover:text-white dark:hover:bg-teal-500 dark:hover:text-slate-900 transition-colors" title="Abrir en Navegador"><Globe size={10} /> Web</button>
            <button onClick={() => handleSendToNotes(node.path, node.status!)} className="text-[10px] flex items-center gap-1 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 px-2 py-1 rounded-md hover:bg-teal-500 hover:text-white dark:hover:bg-teal-500 dark:hover:text-slate-900 transition-colors" title="Enviar a Notas"><FileText size={10} /> Log</button>
          </div>
        )}
      </div>
    );

    if (!hasChildren && !isRoot) { return <div key={node.path} className="ml-4 border-l-2 border-slate-200 dark:border-slate-800/80 pl-2">{nodeContent}</div>; }

    return (
      <details key={node.path} open={isRoot || !!searchPath} className={`ml-4 ${isRoot ? '!ml-0' : 'border-l-2 border-slate-200 dark:border-slate-800/80 pl-2'}`}>
        <summary className="cursor-pointer list-none flex items-center select-none">
          <span className="text-[10px] text-slate-400 mr-1.5 transition-transform group-open:rotate-90">▶</span>
          {isRoot ? (<div className="flex items-center gap-2 py-1.5 px-3 bg-teal-500/10 rounded-md border border-teal-500/20 w-full"><Globe size={14} className="text-teal-500"/><span className="text-xs font-black text-teal-700 dark:text-teal-400 uppercase tracking-widest">OBJETIVO WEB</span></div>) : nodeContent}
        </summary>
        <div className="mt-1">{Object.values(node.children).map(child => renderTree(child))}</div>
      </details>
    );
  };

  return (
    <div className="flex h-full bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800/80 rounded-xl overflow-hidden shadow-sm">
      <div className="w-1/2 border-r border-slate-200 dark:border-slate-800/80 flex flex-col bg-slate-50 dark:bg-slate-950">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800/80 flex justify-between items-center shrink-0">
          <h2 className="text-xs font-black text-slate-900 dark:text-teal-400 uppercase tracking-widest flex items-center gap-2">
            {isFuzzing ? <Radar size={16} className="text-rose-500 animate-spin" /> : <Terminal size={16} />} 
            Salida Raw
          </h2>
          <button onClick={clearFuzzer} className="text-[10px] font-bold uppercase tracking-wider text-rose-500 hover:bg-rose-500/10 px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"><Trash2 size={12} /> Limpiar</button>
        </div>
        <textarea readOnly value={fuzzerRawOutput} placeholder="La salida en bruto de Gobuster aparecerá aquí..." className="flex-1 w-full p-5 bg-transparent text-[11px] font-mono text-slate-700 dark:text-slate-400 outline-none resize-none custom-scrollbar" />
      </div>

      <div className="w-1/2 flex flex-col bg-white dark:bg-[#020617] relative">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800/80 flex justify-between items-center shrink-0 bg-slate-50 dark:bg-[#09090b]">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-3 text-slate-400" />
            <input type="text" value={searchPath} onChange={e => setSearchPath(e.target.value)} placeholder="Buscar ruta..." className="pl-9 pr-3 py-1.5 text-xs outline-none bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-800 rounded-md dark:text-white w-48 focus:border-teal-500 transition-colors" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleExportTxt} className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-[10px] uppercase tracking-wider font-bold rounded-md transition-colors flex items-center gap-1.5"><Download size={12}/> Export 200/301</button>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md outline-none text-slate-700 dark:text-slate-300 focus:border-teal-500 cursor-pointer">
              <option value="all">Todos</option><option value="200">200 (OK)</option><option value="301">301 (Redir)</option><option value="403">403 (Forbid)</option>
            </select>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-5 custom-scrollbar">
          {fuzzerRawOutput.trim().length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <Target size={32} className="mb-4 opacity-50" />
              <p className="text-xs font-black uppercase tracking-widest">Lanza el Fuzzer en Arsenal...</p>
            </div>
          ) : <div className="animate-in fade-in">{renderTree(treeData, true)}</div>}
        </div>
      </div>
    </div>
  );
}
