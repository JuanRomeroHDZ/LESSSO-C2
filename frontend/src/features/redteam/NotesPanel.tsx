import { useState } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import MDEditor from '@uiw/react-md-editor';
import { useScanStore } from '../../core/store/useScanStore';

export function NotesPanel() {
  const { theme, redTeamNotes, setRedTeamNotes, autoSaveEnabled } = useScanStore();
  const [saveStatus, setSaveStatus] = useState(autoSaveEnabled ? 'Autoguardado activado' : 'Autoguardado pausado');

  const handleChange = (val?: string) => {
    let value = val || '';
    setRedTeamNotes(value);
    setSaveStatus('Guardando...');
    setTimeout(() => setSaveStatus(autoSaveEnabled ? 'Guardado en disco' : 'Solo guardado en sesión local'), 800);
  };

  const insertTemplate = (type: 'cve' | 'web' | 'privesc') => {
    let template = '';
    if (type === 'cve') {
        template = `\n## 🔴 Título de la Vulnerabilidad\n**Severidad:** ALTA | **CVSS:** 8.5\n**TTP:** [Pega tu MITRE Tag aquí]\n\n### Descripción\nExplica brevemente la vulnerabilidad...\n\n### Prueba de Concepto (PoC)\n\`\`\`bash\n# Pega tu código o comando aquí\n\`\`\`\n\n### Remediación\n¿Cómo parcharlo?\n---\n`;
    } else if (type === 'web') {
        template = `\n## 🌐 Enumeración Web (Puerto 80/443)\n**Tecnologías:** Apache, PHP, MySQL\n**TTP:** [MITRE: T1595 - Active Scanning]\n\n### Directorios Descubiertos\n| Directorio | Estado | Tamaño |\n|---|---|---|\n| /admin | 403 | 12KB |\n| /uploads | 200 | 0KB |\n\n### Notas Adicionales\nEl panel admin.php está expuesto.\n---\n`;
    } else if (type === 'privesc') {
        template = `\n## 🔓 Escalada de Privilegios (PrivEsc)\n**De:** www-data | **Hacia:** root\n**TTP:** [MITRE: T1068 - Exploitation for Privilege Escalation]\n\n### Vector de Ataque\n(Ej. SUID bit en /usr/bin/find, o permiso de sudo en Nmap sin password).\n\n### Explotación\n\`\`\`bash\nsudo nmap --interactive\nnmap> !sh\n# id\n# uid=0(root)\n\`\`\`\n---\n`;
    }
    setRedTeamNotes(redTeamNotes + template);
  }

  // INTERCEPTOR DE CAPTURAS DE PANTALLA
  const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData.items;
    let imageItem = null;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        imageItem = items[i];
        break;
      }
    }

    if (imageItem) {
      e.preventDefault(); // Evitamos que pegue datos basura
      setSaveStatus('Guardando captura de pantalla...');
      const blob = imageItem.getAsFile();
      if (!blob) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Data = event.target?.result as string;
        try {
          // Enviamos la imagen a Rust para que la guarde como PNG en disco
          const localPath = await invoke<string>('save_clipboard_image', { base64Data });
          
          // Convertimos la ruta local a una URI permitida por Tauri para mostrarla en el navegador
          const assetUrl = convertFileSrc(localPath);
          
          // Insertamos la sintaxis de imagen Markdown en las notas
          const imgTag = `\n![Captura de Pantalla](${assetUrl})\n`;
          setRedTeamNotes(redTeamNotes + imgTag);
          setSaveStatus('Imagen guardada y vinculada');
        } catch (error) {
          console.error("Error guardando imagen:", error);
          setSaveStatus('Error al guardar captura');
        }
      };
      reader.readAsDataURL(blob);
    }
  };

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
      <div className="flex justify-between items-center px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 shrink-0 overflow-visible">
        <h2 className="text-xs font-black text-[#0b282c] dark:text-teal-400 uppercase tracking-widest flex items-center">
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          Bitácora de Auditoría
        </h2>
        
        <div className="flex items-center space-x-3">
          <span className="text-[9px] font-bold text-slate-500 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded hidden sm:block">💡 Soporta Ctrl+V para Capturas de Pantalla</span>
          <span className={`text-[9px] font-bold uppercase tracking-wider ${autoSaveEnabled ? 'text-slate-400' : 'text-orange-500 animate-pulse'}`}>{saveStatus}</span>
          
          <div className="relative group">
             <button className="px-3 py-1.5 bg-[#0b282c]/10 text-[#0b282c] dark:bg-[#0b282c]/50 dark:text-teal-400 text-[10px] font-bold uppercase rounded hover:bg-[#0b282c]/20 transition-colors">
               + Plantillas ▼
             </button>
             <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-xl hidden group-hover:block z-50 overflow-hidden">
                <button onClick={() => insertTemplate('cve')} className="block w-full text-left px-4 py-2 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors border-b border-slate-100 dark:border-slate-700/50">🔴 Hallazgo CVE</button>
                <button onClick={() => insertTemplate('web')} className="block w-full text-left px-4 py-2 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors border-b border-slate-100 dark:border-slate-700/50">🌐 Enum. Web</button>
                <button onClick={() => insertTemplate('privesc')} className="block w-full text-left px-4 py-2 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">🔓 PrivEsc (Root)</button>
             </div>
          </div>

          <button onClick={downloadNotes} className="px-3 py-1.5 bg-[#0b282c] text-white text-[10px] font-bold uppercase rounded shadow-lg shadow-[#0b282c]/20 hover:bg-[#081e21] transition-colors">Exportar .MD</button>
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-white dark:bg-slate-950 custom-scrollbar" data-color-mode={theme} onPaste={handlePaste}>
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
