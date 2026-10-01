import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { useScanStore } from '../../core/store/useScanStore';
import { useUiStore, type ExamPhase } from '../../core/store/uiStore';
import { Bold, Italic, Code, Heading1, Heading2, List, ListOrdered, Quote, Table as TableIcon, Minus, Link, Image, Edit3, Columns, Eye, Download, ClipboardPaste, FileTerminal, Target, Globe, KeyRound, ChevronDown, ShieldAlert } from 'lucide-react';

const ALLOWED_URL_PROTOCOLS = ['http', 'https', 'mailto', 'asset', 'tauri'];
const sanitizeSchema = {
  ...defaultSchema,
  protocols: { ...defaultSchema.protocols, href: [...ALLOWED_URL_PROTOCOLS], src: [...ALLOWED_URL_PROTOCOLS] },
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code || []), ['className']],
    span: [...(defaultSchema.attributes?.span || []), ['className']],
    img: [...(defaultSchema.attributes?.img || []), ['alt'], ['title'], ['width'], ['height']],
  },
};

function sanitizeUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const trimmed = url.trim(); const lower = trimmed.toLowerCase();
  const dangerous = ['javascript:', 'vbscript:', 'data:', 'file:', 'blob:'];
  for (const scheme of dangerous) { if (lower.startsWith(scheme)) return ''; }
  if (lower.startsWith('#') || lower.startsWith('/') || lower.startsWith('.')) return trimmed;
  const match = lower.match(/^([a-z][a-z0-9+.-]*):/);
  if (match && !ALLOWED_URL_PROTOCOLS.includes(match[1])) return '';
  return trimmed;
}

const PHASES: ExamPhase[] = ['recon', 'enum', 'exploit', 'privesc', 'loot'];
const PHASE_COLORS: Record<ExamPhase, string> = {
  recon: 'bg-sky-500', enum: 'bg-indigo-500', exploit: 'bg-rose-500', privesc: 'bg-amber-500', loot: 'bg-teal-500', done: 'bg-slate-500',
};

interface TextareaEdit { text: string; selectionStart: number; selectionEnd: number; }

function wrapSelection(edit: TextareaEdit, before: string, after: string, placeholder = ''): TextareaEdit {
  const { text, selectionStart, selectionEnd } = edit;
  const selected = text.slice(selectionStart, selectionEnd);
  const inner = selected || placeholder;
  const newText = text.slice(0, selectionStart) + before + inner + after + text.slice(selectionEnd);
  const newCursorStart = selectionStart + before.length;
  return { text: newText, selectionStart: newCursorStart, selectionEnd: newCursorStart + inner.length };
}

function prefixLines(edit: TextareaEdit, prefix: string): TextareaEdit {
  const { text, selectionStart, selectionEnd } = edit;
  const lineStart = text.lastIndexOf('\n', selectionStart - 1) + 1;
  const lineEndIdx = text.indexOf('\n', selectionEnd);
  const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
  const block = text.slice(lineStart, lineEnd);
  const prefixed = block.split('\n').map(l => (l.startsWith(prefix) ? l.slice(prefix.length) : prefix + l)).join('\n');
  const newText = text.slice(0, lineStart) + prefixed + text.slice(lineEnd);
  return { text: newText, selectionStart: selectionStart + (prefixed.startsWith(prefix) ? prefix.length : 0), selectionEnd: selectionEnd + (prefixed.length - block.length) };
}

function insertBlock(edit: TextareaEdit, block: string): TextareaEdit {
  const { text, selectionStart, selectionEnd } = edit;
  const before = text.slice(0, selectionStart); const after = text.slice(selectionEnd);
  const snippet = (before.length > 0 && !before.endsWith('\n') ? '\n' : '') + block + (after.length > 0 && !after.startsWith('\n') ? '\n' : '');
  const cursor = selectionStart + snippet.length;
  return { text: before + snippet + after, selectionStart: cursor, selectionEnd: cursor };
}

export function NotesPanel() {
  const { theme, redTeamNotes, setRedTeamNotes, autoSaveEnabled } = useScanStore();
  const { currentPhase, setPhase, phaseLog, examStartAt } = useUiStore();

  const [saveStatus, setSaveStatus] = useState(autoSaveEnabled ? 'Auto-Log Activo' : 'Guardado Manual');
  const [previewMode, setPreviewMode] = useState<'split' | 'edit' | 'preview'>('split');
  const [showPhaseLog, setShowPhaseLog] = useState(false);

  const notesRef = useRef(redTeamNotes);
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { notesRef.current = redTeamNotes; }, [redTeamNotes]);

  const handleChange = (val: string) => {
    setRedTeamNotes(val); setSaveStatus('Guardando...');
    setTimeout(() => setSaveStatus(autoSaveEnabled ? 'Auto-Log Activo' : 'Guardado en sesión'), 800);
  };

  const applyEdit = useCallback((edit: TextareaEdit) => {
    handleChange(edit.text);
    requestAnimationFrame(() => {
      const ta = textareaRef.current; if (!ta) return;
      ta.focus(); ta.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    });
  }, []);

  const currentEdit = (): TextareaEdit | null => {
    const ta = textareaRef.current; if (!ta) return null;
    return { text: ta.value, selectionStart: ta.selectionStart, selectionEnd: ta.selectionEnd };
  };

  const cmdBold = () => { const e = currentEdit(); if (e) applyEdit(wrapSelection(e, '**', '**', 'negrita')); };
  const cmdItalic = () => { const e = currentEdit(); if (e) applyEdit(wrapSelection(e, '_', '_', 'cursiva')); };
  const cmdCode = () => { const e = currentEdit(); if (e) applyEdit(wrapSelection(e, '`', '`', 'código')); };
  const cmdH1 = () => { const e = currentEdit(); if (e) applyEdit(prefixLines(e, '# ')); };
  const cmdH2 = () => { const e = currentEdit(); if (e) applyEdit(prefixLines(e, '## ')); };
  const cmdList = () => { const e = currentEdit(); if (e) applyEdit(prefixLines(e, '- ')); };
  const cmdOrderedList = () => { const e = currentEdit(); if (e) applyEdit(prefixLines(e, '1. ')); };
  const cmdQuote = () => { const e = currentEdit(); if (e) applyEdit(prefixLines(e, '> ')); };
  const cmdHr = () => { const e = currentEdit(); if (e) applyEdit(insertBlock(e, '---')); };
  const cmdCodeBlock = () => { const e = currentEdit(); if (e) applyEdit(insertBlock(e, `\`\`\`bash\n${e.text.slice(e.selectionStart, e.selectionEnd) || '# comando'}\n\`\`\``)); };
  const cmdTable = () => { const e = currentEdit(); if (e) applyEdit(insertBlock(e, '| Col 1 | Col 2 | Col 3 |\n|---|---|---|\n| val | val | val |')); };

  const cmdLink = () => {
    const e = currentEdit(); if (!e) return;
    const url = prompt('URL del enlace:', 'https://') ?? ''; if (!url) return;
    const safeUrl = sanitizeUrl(url) || ''; const label = e.text.slice(e.selectionStart, e.selectionEnd) || 'enlace';
    const cursor = e.selectionStart + `[${label}](${safeUrl})`.length;
    applyEdit({ text: e.text.slice(0, e.selectionStart) + `[${label}](${safeUrl})` + e.text.slice(e.selectionEnd), selectionStart: cursor, selectionEnd: cursor });
  };

  const cmdImage = () => {
    const e = currentEdit(); if (!e) return;
    const url = prompt('URL de la imagen:', 'https://') ?? ''; if (!url) return;
    applyEdit(insertBlock(e, `![imagen](${sanitizeUrl(url) || ''})`));
  };

  const insertTemplate = (type: 'cve' | 'web' | 'privesc') => {
    let t = '';
    if (type === 'cve') t = `\n## 🔴 Hallazgo CVE\n**Severidad:** ALTA | **CVSS:** 8.5\n**TTP:** [Pega tu MITRE Tag]\n\n### Prueba de Concepto (PoC)\n\`\`\`bash\n# Comando aquí\n\`\`\`\n---\n`;
    else if (type === 'web') t = `\n## 🌐 Enum. Web (Pto 80/443)\n**TTP:** [MITRE: T1595 - Active Scanning]\n\n| Directorio | Estado | Tamaño |\n|---|---|---|\n| /admin | 403 | 12KB |\n---\n`;
    else if (type === 'privesc') t = `\n## 🔓 PrivEsc (Hacia root)\n**TTP:** [MITRE: T1068 - Exploitation for PrivEsc]\n\n### Explotación\n\`\`\`bash\n# id -> uid=0(root)\n\`\`\`\n---\n`;
    setRedTeamNotes(notesRef.current + t);
  };

  const pasteAndInsertImage = useCallback(async () => {
    setSaveStatus('Guardando imagen...');
    try {
      const localPath = await invoke<string>('paste_and_save_image');
      if (!localPath) throw new Error('Ruta vacía');
      const assetUrl = convertFileSrc(localPath);
      setRedTeamNotes(notesRef.current + `\n![Captura de Pantalla](${assetUrl})\n`);
      setSaveStatus('Imagen pegada');
    } catch (err) { setSaveStatus('Error al pegar imagen'); }
  }, [setRedTeamNotes]);

  const handlePasteCapture = useCallback(async (e: React.ClipboardEvent<HTMLDivElement>) => {
    let hasImg = false;
    for (let i = 0; i < e.clipboardData.items.length; i++) if (e.clipboardData.items[i].type.startsWith('image/')) hasImg = true;
    if (!hasImg) return;
    e.preventDefault(); e.stopPropagation(); await pasteAndInsertImage();
  }, [pasteAndInsertImage]);

  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && !e.shiftKey && !e.altKey) {
        if (!panelRef.current?.contains(document.activeElement)) return;
        if (document.activeElement instanceof HTMLTextAreaElement && document.activeElement.selectionStart !== document.activeElement.selectionEnd) return;
        try { e.preventDefault(); e.stopPropagation(); await pasteAndInsertImage(); } catch {}
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [pasteAndInsertImage]);

  const downloadNotes = async () => {
    try {
      const filePath = await save({ title: 'Exportar Bitácora', defaultPath: `LESSSO_Reporte_${Date.now()}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] });
      if (filePath) { await writeTextFile(filePath, redTeamNotes); alert(`Guardado en:\n${filePath}`); }
    } catch (error: any) { alert(`Error al exportar:\n${error.message || JSON.stringify(error)}`); }
  };

  const markdownComponents = useMemo(() => ({
    a: ({ node: _node, ...props }: any) => <a {...props} target="_blank" rel="noopener noreferrer nofollow" className="text-teal-500 hover:text-teal-400 underline decoration-teal-500/30 underline-offset-2" />,
    img: ({ node: _node, ...props }: any) => <img {...props} loading="lazy" referrerPolicy="no-referrer" className="rounded-lg border border-slate-700/50 shadow-md my-4 max-w-full h-auto" />,
    code: ({ node: _node, ...props }: any) => <code {...props} className="bg-slate-800/80 text-teal-300 font-mono px-1.5 py-0.5 rounded text-[11px]" />,
    pre: ({ node: _node, ...props }: any) => <pre {...props} className="bg-[#020617] border border-slate-800 p-4 rounded-xl shadow-inner custom-scrollbar text-[11px] font-mono leading-relaxed" />,
    h1: ({ node: _node, ...props }: any) => <h1 {...props} className="text-xl font-black uppercase tracking-wider text-slate-200 mt-6 mb-4 border-b border-slate-800 pb-2" />,
    h2: ({ node: _node, ...props }: any) => <h2 {...props} className="text-lg font-bold text-slate-300 mt-5 mb-3" />,
  }), []);

  return (
    <div ref={panelRef} className="flex flex-col h-full min-h-[600px] flex-1 bg-white dark:bg-[#020617] rounded-xl shadow-sm border border-slate-200 dark:border-slate-800/80 overflow-hidden" data-color-mode={theme}>
      
      {/* EXAM PHASES */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-2.5 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/50 shrink-0">
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5"><Target size={12}/> Fases (Kill Chain)</span>
        <div className="flex flex-wrap gap-1">
          {PHASES.map((p) => {
            const active = currentPhase === p;
            return (
              <button key={p} type="button" onClick={() => setPhase(p)} disabled={!examStartAt} className={`text-[9px] font-black uppercase px-3 py-1 rounded-full transition-all border ${active ? `${PHASE_COLORS[p]} text-white border-transparent shadow-md` : 'bg-transparent text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:bg-slate-800 disabled:opacity-30'}`}>
                {p}
              </button>
            )
          })}
        </div>
        {phaseLog.length > 0 && (
          <button onClick={() => setShowPhaseLog(v => !v)} className="ml-auto text-[9px] font-bold uppercase px-3 py-1 rounded-md border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            {showPhaseLog ? 'Ocultar' : 'Ver Log'} ({phaseLog.length})
          </button>
        )}
      </div>

      {showPhaseLog && phaseLog.length > 0 && (
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800/80 bg-slate-950 shrink-0 max-h-32 overflow-y-auto custom-scrollbar shadow-inner">
          <table className="w-full text-[10px]">
            <thead className="text-slate-500 uppercase tracking-widest border-b border-slate-800"><tr><th className="text-left pb-2 font-bold">Fase</th><th className="text-left pb-2 font-bold">Inicio UTC</th><th className="text-left pb-2 font-bold">Fin UTC</th><th className="text-right pb-2 font-bold">Duración</th></tr></thead>
            <tbody className="divide-y divide-slate-800/50">
              {phaseLog.map((entry, i) => (
                <tr key={`${entry.phase}-${i}`} className="hover:bg-slate-900/50">
                  <td className="py-1.5 font-bold uppercase text-slate-300 flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${PHASE_COLORS[entry.phase]}`}/> {entry.phase}</td>
                  <td className="py-1.5 font-mono text-slate-500">{entry.startedAt.slice(11, 19)}</td>
                  <td className="py-1.5 font-mono text-slate-500">{entry.endedAt ? entry.endedAt.slice(11, 19) : '—'}</td>
                  <td className="py-1.5 font-mono text-slate-400 text-right">{entry.durationMs ? `${Math.floor(entry.durationMs/60000)}m${Math.floor((entry.durationMs%60000)/1000)}s` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* HEADER & TEMPLATES */}
      <div className="flex justify-between items-center px-5 py-3 border-b border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#020617] shrink-0">
        <h2 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2"><FileTerminal size={16} className="text-teal-500"/> Bitácora de Auditoría</h2>
        <div className="flex items-center gap-3">
          <span className={`text-[9px] font-bold uppercase tracking-wider ${autoSaveEnabled ? 'text-slate-500' : 'text-orange-500 animate-pulse'}`}>{saveStatus}</span>
          <button onClick={pasteAndInsertImage} className="flex items-center gap-1.5 px-3 py-1.5 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border border-fuchsia-500/20 text-[10px] font-bold uppercase rounded-md hover:bg-fuchsia-500/20 transition-colors"><ClipboardPaste size={12}/> Pegar (Ctrl+V)</button>
          
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[10px] font-bold uppercase rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">Plantillas <ChevronDown size={12}/></button>
            <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl hidden group-hover:block z-50 overflow-hidden">
              <button onClick={() => insertTemplate('cve')} className="w-full text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-b border-slate-800/50 flex items-center gap-2"><ShieldAlert size={12} className="text-rose-500"/> Hallazgo CVE</button>
              <button onClick={() => insertTemplate('web')} className="w-full text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-b border-slate-800/50 flex items-center gap-2"><Globe size={12} className="text-sky-500"/> Enum. Web</button>
              <button onClick={() => insertTemplate('privesc')} className="w-full text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-2"><KeyRound size={12} className="text-amber-500"/> PrivEsc (Root)</button>
            </div>
          </div>

          <button onClick={downloadNotes} className="flex items-center gap-1.5 px-4 py-1.5 bg-teal-600 text-white text-[10px] font-bold uppercase tracking-widest rounded-md hover:bg-teal-500 transition-colors shadow-md"><Download size={12}/> Exportar MD</button>
        </div>
      </div>

      {/* MARKDOWN TOOLBAR */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/50 shrink-0">
        <ToolbarButton onClick={cmdBold} title="Negrita (Ctrl+B)"><Bold size={14}/></ToolbarButton>
        <ToolbarButton onClick={cmdItalic} title="Cursiva (Ctrl+I)"><Italic size={14}/></ToolbarButton>
        <ToolbarButton onClick={cmdCode} title="Código inline"><Code size={14}/></ToolbarButton>
        <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
        <ToolbarButton onClick={cmdH1} title="Título 1"><Heading1 size={14}/></ToolbarButton>
        <ToolbarButton onClick={cmdH2} title="Título 2"><Heading2 size={14}/></ToolbarButton>
        <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
        <ToolbarButton onClick={cmdList} title="Lista"><List size={14}/></ToolbarButton>
        <ToolbarButton onClick={cmdOrderedList} title="Lista Num."><ListOrdered size={14}/></ToolbarButton>
        <ToolbarButton onClick={cmdQuote} title="Cita"><Quote size={14}/></ToolbarButton>
        <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
        <ToolbarButton onClick={cmdCodeBlock} title="Bloque de código"><FileTerminal size={14}/></ToolbarButton>
        <ToolbarButton onClick={cmdTable} title="Tabla"><TableIcon size={14}/></ToolbarButton>
        <ToolbarButton onClick={cmdHr} title="Separador"><Minus size={14}/></ToolbarButton>
        <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
        <ToolbarButton onClick={cmdLink} title="Enlace"><Link size={14}/></ToolbarButton>
        <ToolbarButton onClick={cmdImage} title="Imagen"><Image size={14}/></ToolbarButton>

        <div className="ml-auto flex gap-1.5 bg-slate-200 dark:bg-slate-950 p-1 rounded-lg border border-slate-300 dark:border-slate-800">
          <ToolbarButton onClick={() => setPreviewMode('edit')} active={previewMode === 'edit'} title="Solo edición"><Edit3 size={12}/></ToolbarButton>
          <ToolbarButton onClick={() => setPreviewMode('split')} active={previewMode === 'split'} title="Dividido"><Columns size={12}/></ToolbarButton>
          <ToolbarButton onClick={() => setPreviewMode('preview')} active={previewMode === 'preview'} title="Solo vista"><Eye size={12}/></ToolbarButton>
        </div>
      </div>

      {/* EDITOR AREA */}
      <div className="flex-1 min-h-0 flex" onPasteCapture={handlePasteCapture}>
        {previewMode !== 'preview' && (
          <textarea
            ref={textareaRef}
            value={redTeamNotes}
            onChange={e => handleChange(e.target.value)}
            spellCheck={false}
            placeholder="Escribe tu bitácora de explotación en Markdown. Las imágenes pegadas (Ctrl+V) se guardarán automáticamente en tu sistema..."
            className={`${previewMode === 'split' ? 'w-1/2 border-r' : 'w-full'} h-full resize-none outline-none p-6 font-mono text-[12px] leading-relaxed bg-white dark:bg-[#020617] text-slate-800 dark:text-teal-50/80 border-slate-200 dark:border-slate-800/80 custom-scrollbar placeholder:text-slate-600`}
          />
        )}
        {previewMode !== 'edit' && (
          <div className={`${previewMode === 'split' ? 'w-1/2' : 'w-full'} h-full overflow-auto custom-scrollbar bg-slate-50 dark:bg-[#09090b]`}>
            <div className="markdown-preview prose prose-slate dark:prose-invert max-w-none p-6 text-[13px] leading-relaxed" data-color-mode={theme}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeSanitize, sanitizeSchema]]} urlTransform={sanitizeUrl} components={markdownComponents}>
                {redTeamNotes || '_Bitácora vacía. Cierra tus findings..._'}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({ onClick, title, children, active = false }: { onClick: () => void; title: string; children: React.ReactNode; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} title={title} className={`p-1.5 rounded-md transition-colors ${active ? 'bg-teal-500 text-slate-950 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'}`}>
      {children}
    </button>
  );
}
