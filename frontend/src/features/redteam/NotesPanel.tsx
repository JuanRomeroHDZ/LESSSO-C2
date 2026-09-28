import { useState, useEffect } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import MDEditor from '@uiw/react-md-editor';
import { useScanStore } from '../../core/store/useScanStore';

export function NotesPanel() {
  const [notes, setNotes] = useState('');
  const [saveStatus, setSaveStatus] = useState('Autoguardado activado');
  const theme = useScanStore(state => state.theme);

  useEffect(() => {
    const saved = localStorage.getItem('juanmap_notes');
    if (saved) setNotes(saved);

    const handleStorageChange = () => {
      const updated = localStorage.getItem('juanmap_notes');
      if (updated !== null && updated !== notes) setNotes(updated);
    };
    window.addEventListener('juanmap_notes_updated', handleStorageChange);
    return () => window.removeEventListener('juanmap_notes_updated', handleStorageChange);
  }, []);

  const handleChange = (val?: string) => {
    const value = val || '';
    setNotes(value);
    setSaveStatus('Guardando...');
    localStorage.setItem('juanmap_notes', value);
    window.dispatchEvent(new Event('juanmap_notes_updated'));
    setTimeout(() => setSaveStatus('Guardado localmente'), 1000);
  };

  const downloadNotes = async () => {
    try {
      setSaveStatus('Abriendo explorador...');
      const filePath = await save({ 
        title: 'Exportar Bitácora Markdown', 
        defaultPath: `Bitacora_Auditoria_${Date.now()}.md`, 
        filters: [{ name: 'Markdown Document', extensions: ['md'] }] 
      });
      if (filePath) { 
        await writeTextFile(filePath, notes); 
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
    <div className="flex flex-col h-full min-h-[600px] flex-1 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden" data-color-mode={theme}>
      
      {/* HEADER */}
      <div className="flex justify-between items-center px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 shrink-0">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase flex items-center">
          <svg className="w-4 h-4 mr-2 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          Bitácora Enriquecida
        </h2>
        <div className="flex items-center space-x-4">
          <span className="text-[10px] font-medium text-slate-400">{saveStatus}</span>
          <button onClick={downloadNotes} className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded shadow hover:bg-indigo-500 transition-colors">Guardar Como (.MD)</button>
        </div>
      </div>

      {/* EDITOR ROBUSTO */}
      <div className="flex-1 min-h-0 bg-white dark:bg-slate-900" data-color-mode={theme}>
        <MDEditor
          value={notes}
          onChange={handleChange}
          height="100%"
          preview="live"
          hideToolbar={false}
          className="h-full w-full border-none !shadow-none"
        />
      </div>
    </div>
  );
}
