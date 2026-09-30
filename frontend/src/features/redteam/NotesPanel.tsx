import { useState, useEffect, useRef, useCallback } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import MDEditor from '@uiw/react-md-editor';
import { useScanStore } from '../../core/store/useScanStore';

export function NotesPanel() {
  const { theme, redTeamNotes, setRedTeamNotes, autoSaveEnabled } = useScanStore();
  const [saveStatus, setSaveStatus] = useState(autoSaveEnabled ? 'Autoguardado activado' : 'Autoguardado pausado');

  // Refs para evitar closures stale
  const notesRef = useRef(redTeamNotes);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => { notesRef.current = redTeamNotes; }, [redTeamNotes]);

  const handleChange = (val?: string) => {
    const value = val || '';
    setRedTeamNotes(value);
    setSaveStatus('Guardando...');
    setTimeout(() => setSaveStatus(autoSaveEnabled ? 'Autoguardado activo' : 'Solo guardado en sesión'), 800);
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
    setRedTeamNotes(notesRef.current + template);
  };

  // ==========================================================
  // CORE: leer imagen del clipboard y guardarla
  // ----------------------------------------------------------
  // Un solo comando Rust: `paste_and_save_image`
  //   - Lee el portapapeles (arboard → wl-paste → xclip)
  //   - Convierte la imagen a PNG real
  //   - Guarda en $APPDATA/screenshots/
  //   - Devuelve la RUTA del archivo
  //
  // Después, el frontend solo convierte la ruta a asset://
  // y añade el tag Markdown.
  // ==========================================================
  const pasteAndInsertImage = useCallback(async () => {
    console.log('[paste] Invocando paste_and_save_image...');
    setSaveStatus('Leyendo portapapeles...');

    try {
      const localPath = await invoke<string>('paste_and_save_image');
      console.log('[paste] ✅ Imagen guardada en:', localPath);

      if (!localPath || localPath.trim() === '') {
        throw new Error('El backend devolvió una ruta vacía');
      }

      const assetUrl = convertFileSrc(localPath);
      console.log('[paste] assetUrl generada:', assetUrl);

      if (!assetUrl || assetUrl.trim() === '') {
        throw new Error('convertFileSrc devolvió una URL vacía');
      }

      const imgTag = `\n![Captura de Pantalla](${assetUrl})\n`;
      setRedTeamNotes(notesRef.current + imgTag);
      setSaveStatus('Imagen pegada correctamente');
      console.log('[paste] ✅ Imagen insertada en la bitácora');
    } catch (err) {
      const errorMsg = String(err);
      console.error('[paste] ❌ Error:', err);
      // Mostrar solo las primeras 60 letras del error para no saturar la UI
      setSaveStatus(`Error: ${errorMsg.slice(0, 60)}`);
    }
  }, [setRedTeamNotes]);

  // ==========================================================
  // HELPER: extrae la primera imagen de un DataTransfer
  // (solo como fallback si algún día el WebView expone el paste)
  // ==========================================================
  const extractImageFromClipboard = (data: DataTransfer): Blob | null => {
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) return blob;
      }
    }
    for (let i = 0; i < data.files.length; i++) {
      const file = data.files[i];
      if (file.type.startsWith('image/')) return file;
    }
    return null;
  };

  // ==========================================================
  // FALLBACK: onPasteCapture en el div contenedor
  // En Linux/WebKitGTK esto NO se dispara con imágenes, pero
  // lo mantenemos por si algún día el WebView lo expone.
  // ==========================================================
  const handlePasteCapture = useCallback(async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const blob = extractImageFromClipboard(e.clipboardData);
    if (!blob) return; // sin imagen, permitimos paste normal de texto

    console.log('[paste-capture] Imagen detectada en evento DOM. Delegando a Rust...');
    e.preventDefault();
    e.stopPropagation();
    await pasteAndInsertImage();
  }, [pasteAndInsertImage]);

  // ==========================================================
  // ATAJO Ctrl+V: a nivel de teclado (keydown), no de paste
  // ----------------------------------------------------------
  // Este SÍ funciona en WebKitGTK porque es un evento keydown.
  // Capturamos Ctrl+V y delegamos al backend Rust directamente.
  // ==========================================================
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      const isPaste = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v';
      if (!isPaste) return;

      // Solo si el foco está dentro del panel de notas
      const panel = panelRef.current;
      if (!panel || !panel.contains(document.activeElement)) return;

      console.log('[keydown] Ctrl+V detectado. Usando Rust directamente.');
      e.preventDefault();
      e.stopPropagation();
      await pasteAndInsertImage();
    };

    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [pasteAndInsertImage]);

  const downloadNotes = async () => {
    try {
      setSaveStatus('Abriendo explorador...');
      const filePath = await save({
        title: 'Exportar Bitácora Markdown',
        defaultPath: `LESSSO_Bitacora_${Date.now()}.md`,
        filters: [{ name: 'Markdown Document', extensions: ['md'] }],
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
    <div
      ref={panelRef}
      className="flex flex-col h-full min-h-[600px] flex-1 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden"
      data-color-mode={theme}
    >
      <div className="flex justify-between items-center px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 shrink-0 overflow-visible">
        <h2 className="text-xs font-black text-[#0b282c] dark:text-teal-400 uppercase tracking-widest flex items-center">
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Bitácora de Auditoría
        </h2>

        <div className="flex items-center space-x-3">
          <span className="text-[9px] font-bold text-slate-500 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded hidden sm:block">
            💡 Ctrl+V o 📋 para capturas
          </span>
          <span className={`text-[9px] font-bold uppercase tracking-wider ${autoSaveEnabled ? 'text-slate-400' : 'text-orange-500 animate-pulse'}`}>
            {saveStatus}
          </span>

          <button
            onClick={pasteAndInsertImage}
            title="Pegar imagen desde el portapapeles del sistema"
            className="px-3 py-1.5 bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400 text-[10px] font-bold uppercase rounded hover:bg-fuchsia-200 dark:hover:bg-fuchsia-900/50 transition-colors"
          >
            📋 Pegar Captura
          </button>

          <div className="relative group">
            <button className="px-3 py-1.5 bg-[#0b282c]/10 text-[#0b282c] dark:bg-[#0b282c]/50 dark:text-teal-400 text-[10px] font-bold uppercase rounded hover:bg-[#0b282c]/20 transition-colors">
              + Plantillas ▼
            </button>
            <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-xl hidden group-hover:block z-50 overflow-hidden">
              <button onClick={() => insertTemplate('cve')} className="block w-full text-left px-4 py-2 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors border-b border-slate-100 dark:border-slate-700/50">
                🔴 Hallazgo CVE
              </button>
              <button onClick={() => insertTemplate('web')} className="block w-full text-left px-4 py-2 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors border-b border-slate-100 dark:border-slate-700/50">
                🌐 Enum. Web
              </button>
              <button onClick={() => insertTemplate('privesc')} className="block w-full text-left px-4 py-2 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                🔓 PrivEsc (Root)
              </button>
            </div>
          </div>

          <button onClick={downloadNotes} className="px-3 py-1.5 bg-[#0b282c] text-white text-[10px] font-bold uppercase rounded shadow-lg shadow-[#0b282c]/20 hover:bg-[#081e21] transition-colors">
            Exportar .MD
          </button>
        </div>
      </div>

      <div
        className="flex-1 min-h-0 bg-white dark:bg-slate-950 custom-scrollbar"
        data-color-mode={theme}
        onPasteCapture={handlePasteCapture}
      >
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
