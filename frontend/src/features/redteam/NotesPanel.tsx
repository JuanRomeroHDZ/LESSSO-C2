import { useState } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import MDEditor from '@uiw/react-md-editor';
import { useScanStore } from '../../core/store/useScanStore';

export function NotesPanel() {
  const { theme, redTeamNotes, setRedTeamNotes, autoSaveEnabled } = useScanStore();
  const [saveStatus, setSaveStatus] = useState(autoSaveEnabled ? 'Autoguardado activado' : 'Autoguardado pausado');

  const handleChange = (val?: string) => {
    const value = val || '';
    setRedTeamNotes(value);
    setSaveStatus('Guardando...');
    setTimeout(() => setSaveStatus(autoSaveEnabled ? 'Guardado en disco' : 'Solo guardado en sesión local'), 800);
  };

  const insertTemplate = (type: 'cve' | 'web' | 'privesc') => {
    let template = '';
    if (type === 'cve') {
        template = `\n## 🔴 Título de la Vulnerabilidad\n**Severidad:** ALTA | **CVSS:** 8.5\n\n### Descripción\nExplica brevemente la vulnerabilidad...\n\n### Prueba de Concepto (PoC)\n\`\`\`bash\n# Pega tu código o comando aquí\n\`\`\`\n\n### Remediación\n¿Cómo parcharlo?\n---\n`;
    } else if (type === 'web') {
        template = `\n## 🌐 Enumeración Web (Puerto 80/443)\n**Tecnologías:** Apache, PHP, MySQL\n\n### Directorios Descubiertos\n| Directorio | Estado | Tamaño |\n|---|---|---|\n| /admin | 403 | 12KB |\n| /uploads | 200 | 0KB |\n\n### Notas Adicionales\nEl panel admin.php está expuesto.\n---\n`;
    } else if (type === 'privesc') {
        template = `\n## 🔓 Escalada de Privilegios (PrivEsc)\n**De:** www-data | **Hacia:** root\n\n### Vector de Ataque\n(Ej. SUID bit en /usr/bin/find, o permiso de sudo en Nmap sin password).\n\n### Explotación\n\`\`\`bash\nsudo nmap --interactive\nnmap> !sh\n# id\n# uid=0(root)\n\`\`\`\n---\n`;
    }
    setRedTeamNotes(redTeamNotes + template);
  }

  const downloadNotes = async () => {
    try {
      setSaveStatus('Abriendo explorador...');
      const filePath = await save({ 
        title: 'Exportar Bitácora Markdown', 
        defaultPath: `LESSSO_Bitacora_${Date.now()}.md`, 
        filters: [{ name: 'Markdown Document', extensions: ['md'] }] 
      });
      if (filePath) { 
        await writeTextFile(filePath, redTeamNotes); 
        setSaveStatus('Exportado exitosamente'); 
        alert(`Archivo guardado correctamente en:\n${filePath}`); 
      } else { 
        setSaveStatus('Exportación cancelada'); 
      }
    } catch (error: any) { 
      setSaveStatus('Error al exportar'); 
      alert(`Ocurrió un error al intentar guardar el archivo:\n\n${error.message || JSON.stringify(error)}`); 
    }
  };

  return (
    <div className="flex flex-col h-full min-h-[600px] flex-1 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden" data-color-mode={theme}>
      
      {/* HEADER */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 shrink-0 overflow-visible">
        <h2 className="text-xs font-black text-indigo-700 dark:text-indigo-400 uppercase tracking-widest flex items-center">
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          Bitácora de Auditoría
        </h2>
        <div className="flex items-center space-x-3">
          <span className={`text-[9px] font-bold uppercase tracking-wider ${autoSaveEnabled ? 'text-slate-400' : 'text-orange-500 animate-pulse'}`}>{saveStatus}</span>
          
          <div className="relative group">
             <button className="px-3 py-1.5 bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400 text-[10px] font-bold uppercase rounded hover:bg-fuchsia-200 transition-colors">
               + Plantillas ▼
             </button>
             <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-xl hidden group-hover:block z-50">
                <button onClick={() => insertTemplate('cve')} className="block w-full text-left px-4 py-2 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">🔴 Hallazgo CVE</button>
                <button onClick={() => insertTemplate('web')} className="block w-full text-left px-4 py-2 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">🌐 Enum. Web</button>
                <button onClick={() => insertTemplate('privesc')} className="block w-full text-left px-4 py-2 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">🔓 PrivEsc (Root)</button>
             </div>
          </div>

          <button onClick={downloadNotes} className="px-3 py-1.5 bg-indigo-600 text-white text-[10px] font-bold uppercase rounded shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 transition-colors">Exportar .MD</button>
        </div>
      </div>

      {/* EDITOR */}
      <div className="flex-1 min-h-0 bg-white dark:bg-slate-950 custom-scrollbar" data-color-mode={theme}>
        <MDEditor
          value={redTeamNotes}
          onChange={handleChange}
          height="100%"
          preview="live"
          hideToolbar={false}
          className="h-full w-full border-none !shadow-none font-mono"
        />
      </div>
    </div>
  );
}

