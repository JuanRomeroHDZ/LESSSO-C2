import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { useScanStore } from '../../core/store/useScanStore';

// ==========================================================
// SEGURIDAD — SANITIZACIÓN DE MARKDOWN
// ----------------------------------------------------------
// Reemplazamos @uiw/react-md-editor (que traía rehype-raw
// por debajo y permitía XSS) por:
//   - <textarea> para editar (sin HTML ejecutable)
//   - react-markdown + remark-gfm + rehype-sanitize para preview
//
// rehype-sanitize usa un "schema" que define exactamente qué
// tags, atributos y protocolos se permiten. Extendemos el
// schema por defecto (que ya es seguro) con lo que necesitamos:
//   - Tablas GFM (ya permitidas por el default de rehype-sanitize)
//   - Imágenes con asset:// y http://asset.localhost (Tauri)
//   - Nada de scripts, iframes, styles inline, event handlers
// ==========================================================

/** Protocolos permitidos en URLs de links e imágenes. */
const ALLOWED_URL_PROTOCOLS = ['http', 'https', 'mailto', 'asset', 'tauri'];

/**
 * Schema de saneamiento. Extiende el defaultSchema de rehype-sanitize
 * (que ya es seguro) añadiendo los protocolos de Tauri.
 */
const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: [...ALLOWED_URL_PROTOCOLS],
    src: [...ALLOWED_URL_PROTOCOLS],
  },
  // Permitimos clases en <code> para que el resaltado funcione bien
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code || []), ['className']],
    span: [...(defaultSchema.attributes?.span || []), ['className']],
    img: [
      ...(defaultSchema.attributes?.img || []),
      ['alt'],
      ['title'],
      ['width'],
      ['height'],
    ],
  },
};

/**
 * Filtro de URLs: bloquea esquemas peligrosos.
 * Se aplica ANTES del sanitizador como defensa en profundidad.
 */
function sanitizeUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();

  // Bloqueo explícito de esquemas peligrosos
  const dangerous = ['javascript:', 'vbscript:', 'data:', 'file:', 'blob:'];
  for (const scheme of dangerous) {
    if (lower.startsWith(scheme)) return '';
  }

  // Rutas relativas y anchors son seguras
  if (lower.startsWith('#') || lower.startsWith('/') || lower.startsWith('.')) {
    return trimmed;
  }

  // Cualquier otra cosa debe tener un protocolo permitido
  const match = lower.match(/^([a-z][a-z0-9+.-]*):/);
  if (match && !ALLOWED_URL_PROTOCOLS.includes(match[1])) {
    return '';
  }

  return trimmed;
}

// ==========================================================
// BARRA DE HERRAMIENTAS — helpers de edición
// ==========================================================

interface TextareaEdit {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Envuelve la selección con un prefijo y sufijo (ej: **bold**).
 * Si no hay selección, inserta el placeholder.
 */
function wrapSelection(
  edit: TextareaEdit,
  before: string,
  after: string,
  placeholder = ''
): TextareaEdit {
  const { text, selectionStart, selectionEnd } = edit;
  const selected = text.slice(selectionStart, selectionEnd);
  const inner = selected || placeholder;
  const newText =
    text.slice(0, selectionStart) + before + inner + after + text.slice(selectionEnd);
  const newCursorStart = selectionStart + before.length;
  const newCursorEnd = newCursorStart + inner.length;
  return { text: newText, selectionStart: newCursorStart, selectionEnd: newCursorEnd };
}

/**
 * Prefija cada línea seleccionada (ej: "> " para quotes).
 */
function prefixLines(
  edit: TextareaEdit,
  prefix: string
): TextareaEdit {
  const { text, selectionStart, selectionEnd } = edit;
  // Expandir la selección a líneas completas
  const lineStart = text.lastIndexOf('\n', selectionStart - 1) + 1;
  const lineEndIdx = text.indexOf('\n', selectionEnd);
  const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;

  const block = text.slice(lineStart, lineEnd);
  const prefixed = block
    .split('\n')
    .map(l => (l.startsWith(prefix) ? l.slice(prefix.length) : prefix + l))
    .join('\n');

  const newText = text.slice(0, lineStart) + prefixed + text.slice(lineEnd);
  const delta = prefixed.length - block.length;
  return {
    text: newText,
    selectionStart: selectionStart + (prefixed.startsWith(prefix) ? prefix.length : 0),
    selectionEnd: selectionEnd + delta,
  };
}

/**
 * Inserta un bloque de texto en la posición del cursor,
 * respetando saltos de línea alrededor.
 */
function insertBlock(edit: TextareaEdit, block: string): TextareaEdit {
  const { text, selectionStart, selectionEnd } = edit;
  const before = text.slice(0, selectionStart);
  const after = text.slice(selectionEnd);
  const needsLeadingNl = before.length > 0 && !before.endsWith('\n');
  const needsTrailingNl = after.length > 0 && !after.startsWith('\n');
  const snippet =
    (needsLeadingNl ? '\n' : '') + block + (needsTrailingNl ? '\n' : '');
  const newText = before + snippet + after;
  const cursor = selectionStart + snippet.length;
  return { text: newText, selectionStart: cursor, selectionEnd: cursor };
}

// ==========================================================
// COMPONENTE
// ==========================================================

export function NotesPanel() {
  const { theme, redTeamNotes, setRedTeamNotes, autoSaveEnabled } = useScanStore();
  const [saveStatus, setSaveStatus] = useState(
    autoSaveEnabled ? 'Autoguardado activado' : 'Autoguardado pausado'
  );
  const [previewMode, setPreviewMode] = useState<'split' | 'edit' | 'preview'>('split');

  const notesRef = useRef(redTeamNotes);
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    notesRef.current = redTeamNotes;
  }, [redTeamNotes]);

  // ==========================================================
  // Cambio de contenido
  // ==========================================================
  const handleChange = (val: string) => {
    setRedTeamNotes(val);
    setSaveStatus('Guardando...');
    setTimeout(
      () => setSaveStatus(autoSaveEnabled ? 'Autoguardado activo' : 'Solo guardado en sesión'),
      800
    );
  };

  // ==========================================================
  // Aplicar edición sobre el textarea
  // ==========================================================
  const applyEdit = useCallback(
    (edit: TextareaEdit) => {
      handleChange(edit.text);
      // Reenfocar y posicionar cursor en el siguiente tick
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(edit.selectionStart, edit.selectionEnd);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const currentEdit = (): TextareaEdit | null => {
    const ta = textareaRef.current;
    if (!ta) return null;
    return {
      text: ta.value,
      selectionStart: ta.selectionStart,
      selectionEnd: ta.selectionEnd,
    };
  };

  const cmdBold = () => {
    const e = currentEdit();
    if (!e) return;
    applyEdit(wrapSelection(e, '**', '**', 'texto en negrita'));
  };

  const cmdItalic = () => {
    const e = currentEdit();
    if (!e) return;
    applyEdit(wrapSelection(e, '_', '_', 'texto en cursiva'));
  };

  const cmdCode = () => {
    const e = currentEdit();
    if (!e) return;
    applyEdit(wrapSelection(e, '`', '`', 'código'));
  };

  const cmdLink = () => {
    const e = currentEdit();
    if (!e) return;
    const selected = e.text.slice(e.selectionStart, e.selectionEnd);
    const url = prompt('URL del enlace:', 'https://') ?? '';
    if (!url) return;
    const safeUrl = sanitizeUrl(url) || '';
    const label = selected || 'texto del enlace';
    const newText =
      e.text.slice(0, e.selectionStart) +
      `[${label}](${safeUrl})` +
      e.text.slice(e.selectionEnd);
    const cursor = e.selectionStart + `[${label}](${safeUrl})`.length;
    applyEdit({ text: newText, selectionStart: cursor, selectionEnd: cursor });
  };

  const cmdImage = () => {
    const e = currentEdit();
    if (!e) return;
    const url = prompt('URL de la imagen:', 'https://') ?? '';
    if (!url) return;
    const safeUrl = sanitizeUrl(url) || '';
    applyEdit(insertBlock(e, `![imagen](${safeUrl})`));
  };

  const cmdH1 = () => {
    const e = currentEdit();
    if (!e) return;
    applyEdit(prefixLines(e, '# '));
  };

  const cmdH2 = () => {
    const e = currentEdit();
    if (!e) return;
    applyEdit(prefixLines(e, '## '));
  };

  const cmdList = () => {
    const e = currentEdit();
    if (!e) return;
    applyEdit(prefixLines(e, '- '));
  };

  const cmdOrderedList = () => {
    const e = currentEdit();
    if (!e) return;
    applyEdit(prefixLines(e, '1. '));
  };

  const cmdQuote = () => {
    const e = currentEdit();
    if (!e) return;
    applyEdit(prefixLines(e, '> '));
  };

  const cmdCodeBlock = () => {
    const e = currentEdit();
    if (!e) return;
    const { text, selectionStart, selectionEnd } = e;
    const selected = text.slice(selectionStart, selectionEnd);
    const block = `\`\`\`bash\n${selected || '# comando aquí'}\n\`\`\``;
    applyEdit(insertBlock(e, block));
  };

  const cmdTable = () => {
    const e = currentEdit();
    if (!e) return;
    const table = `| Columna 1 | Columna 2 | Columna 3 |\n|---|---|---|\n| valor | valor | valor |`;
    applyEdit(insertBlock(e, table));
  };

  const cmdHr = () => {
    const e = currentEdit();
    if (!e) return;
    applyEdit(insertBlock(e, '---'));
  };

  // ==========================================================
  // Plantillas
  // ==========================================================
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
  // Pegado de imágenes (Rust)
  // ==========================================================
  const pasteAndInsertImage = useCallback(async () => {
    setSaveStatus('Leyendo portapapeles...');
    try {
      const localPath = await invoke<string>('paste_and_save_image');
      if (!localPath || localPath.trim() === '') {
        throw new Error('El backend devolvió una ruta vacía');
      }
      const assetUrl = convertFileSrc(localPath);
      if (!assetUrl || assetUrl.trim() === '') {
        throw new Error('convertFileSrc devolvió una URL vacía');
      }
      const imgTag = `\n![Captura de Pantalla](${assetUrl})\n`;
      setRedTeamNotes(notesRef.current + imgTag);
      setSaveStatus('Imagen pegada correctamente');
    } catch (err) {
      const errorMsg = String(err);
      setSaveStatus(`Error: ${errorMsg.slice(0, 60)}`);
    }
  }, [setRedTeamNotes]);

  const hasImageInClipboard = (data: DataTransfer): boolean => {
    for (let i = 0; i < data.items.length; i++) {
      if (data.items[i].type.startsWith('image/')) return true;
    }
    return false;
  };

  const handlePasteCapture = useCallback(
    async (e: React.ClipboardEvent<HTMLDivElement>) => {
      if (!hasImageInClipboard(e.clipboardData)) return;
      e.preventDefault();
      e.stopPropagation();
      await pasteAndInsertImage();
    },
    [pasteAndInsertImage]
  );

  // ==========================================================
  // Atajo Ctrl+V
  // ----------------------------------------------------------
  // Solo interceptamos si el foco está dentro del panel.
  // Rust decide si hay imagen o no. Si no hay, el evento
  // nativo sigue su curso (dejamos que el textarea pegue).
  // ==========================================================
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      const isPaste = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v';
      if (!isPaste) return;
      if (e.shiftKey || e.altKey) return;

      const panel = panelRef.current;
      if (!panel || !panel.contains(document.activeElement)) return;

      // En WebKitGTK el evento paste no llega al DOM, así que
      // sólo interceptamos cuando el elemento activo es el
      // textarea (para permitir pegar texto normal).
      const active = document.activeElement;
      const isTextarea = active instanceof HTMLTextAreaElement;

      // Si el foco es el textarea, dejamos que el paste nativo
      // funcione y solo interceptamos si hay imagen (lo cual
      // detectamos vía Rust). Como no podemos saberlo sin
      // consultarlo, usamos un pequeño heurístico: leemos el
      // clipboard solo si el textarea NO tiene texto seleccionado.
      if (isTextarea) {
        const ta = active as HTMLTextAreaElement;
        const hasSelection = ta.selectionStart !== ta.selectionEnd;
        // Si hay selección, es casi seguro que quiere reemplazarla
        // con texto → dejamos pasar.
        if (hasSelection) return;
      }

      // En el resto de casos intentamos pegar imagen.
      try {
        e.preventDefault();
        e.stopPropagation();
        await pasteAndInsertImage();
      } catch {
        // Si falla, no hacemos nada: el usuario puede pegar
        // manualmente con el menú contextual o Ctrl+Shift+V.
      }
    };

    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [pasteAndInsertImage]);

  // ==========================================================
  // Exportar
  // ==========================================================
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
      alert(
        `Ocurrió un error al intentar guardar el archivo:\n\n${
          error.message || JSON.stringify(error)
        }`
      );
    }
  };

  // ==========================================================
  // Componentes de preview personalizados
  // ----------------------------------------------------------
  // react-markdown v9+ usa `components` para sobrescribir tags.
  // Aprovechamos para forzar `rel="noopener noreferrer"` en
  // enlaces y bloquear descargas automáticas en imágenes.
  // ==========================================================
  const markdownComponents = useMemo(
    () => ({
      a: ({ node, ...props }: any) => (
        <a {...props} target="_blank" rel="noopener noreferrer nofollow" />
      ),
      img: ({ node, ...props }: any) => (
        // `loading="lazy"` para no cargar imágenes fuera de vista
        // `referrerPolicy="no-referrer"` para no filtrar la ruta
        <img {...props} loading="lazy" referrerPolicy="no-referrer" />
      ),
    }),
    []
  );

  // ==========================================================
  // Render del preview
  // ==========================================================
  const PreviewContent = (
    <div
      className="markdown-preview prose prose-slate dark:prose-invert max-w-none p-4 text-[12px] leading-relaxed"
      data-color-mode={theme}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        urlTransform={sanitizeUrl}
        components={markdownComponents}
      >
        {redTeamNotes || '_Bitácora vacía. Empieza a escribir..._'}
      </ReactMarkdown>
    </div>
  );

  return (
    <div
      ref={panelRef}
      className="flex flex-col h-full min-h-[600px] flex-1 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden"
      data-color-mode={theme}
    >
      {/* ====================================================
          Cabecera
          ==================================================== */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 shrink-0 overflow-visible">
        <h2 className="text-xs font-black text-[#0b282c] dark:text-teal-400 uppercase tracking-widest flex items-center">
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
          Bitácora de Auditoría
        </h2>

        <div className="flex items-center space-x-3">
          <span className="text-[9px] font-bold text-slate-500 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded hidden sm:block">
            💡 Ctrl+V o 📋 para capturas
          </span>
          <span
            className={`text-[9px] font-bold uppercase tracking-wider ${
              autoSaveEnabled ? 'text-slate-400' : 'text-orange-500 animate-pulse'
            }`}
          >
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
              <button
                onClick={() => insertTemplate('cve')}
                className="block w-full text-left px-4 py-2 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors border-b border-slate-100 dark:border-slate-700/50"
              >
                🔴 Hallazgo CVE
              </button>
              <button
                onClick={() => insertTemplate('web')}
                className="block w-full text-left px-4 py-2 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors border-b border-slate-100 dark:border-slate-700/50"
              >
                🌐 Enum. Web
              </button>
              <button
                onClick={() => insertTemplate('privesc')}
                className="block w-full text-left px-4 py-2 text-[10px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                🔓 PrivEsc (Root)
              </button>
            </div>
          </div>

          <button
            onClick={downloadNotes}
            className="px-3 py-1.5 bg-[#0b282c] text-white text-[10px] font-bold uppercase rounded shadow-lg shadow-[#0b282c]/20 hover:bg-[#081e21] transition-colors"
          >
            Exportar .MD
          </button>
        </div>
      </div>

      {/* ====================================================
          Barra de herramientas de edición
          ==================================================== */}
      <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <ToolbarButton onClick={cmdBold} title="Negrita (Ctrl+B)">B</ToolbarButton>
        <ToolbarButton onClick={cmdItalic} title="Cursiva (Ctrl+I)" italic>I</ToolbarButton>
        <ToolbarButton onClick={cmdCode} title="Código inline">{"</>"}</ToolbarButton>
        <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
        <ToolbarButton onClick={cmdH1} title="Título 1">H1</ToolbarButton>
        <ToolbarButton onClick={cmdH2} title="Título 2">H2</ToolbarButton>
        <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
        <ToolbarButton onClick={cmdList} title="Lista sin orden">• L</ToolbarButton>
        <ToolbarButton onClick={cmdOrderedList} title="Lista ordenada">1. L</ToolbarButton>
        <ToolbarButton onClick={cmdQuote} title="Cita">&gt;</ToolbarButton>
        <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
        <ToolbarButton onClick={cmdCodeBlock} title="Bloque de código">{"{ }"}</ToolbarButton>
        <ToolbarButton onClick={cmdTable} title="Tabla">▦</ToolbarButton>
        <ToolbarButton onClick={cmdHr} title="Separador">—</ToolbarButton>
        <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
        <ToolbarButton onClick={cmdLink} title="Enlace">🔗</ToolbarButton>
        <ToolbarButton onClick={cmdImage} title="Imagen">🖼</ToolbarButton>

        <div className="ml-auto flex gap-1">
          <ToolbarButton
            onClick={() => setPreviewMode('edit')}
            active={previewMode === 'edit'}
            title="Solo edición"
          >
            ✎
          </ToolbarButton>
          <ToolbarButton
            onClick={() => setPreviewMode('split')}
            active={previewMode === 'split'}
            title="Dividido"
          >
            ◫
          </ToolbarButton>
          <ToolbarButton
            onClick={() => setPreviewMode('preview')}
            active={previewMode === 'preview'}
            title="Solo vista previa"
          >
            👁
          </ToolbarButton>
        </div>
      </div>

      {/* ====================================================
          Editor + Preview
          ==================================================== */}
      <div
        className="flex-1 min-h-0 flex"
        onPasteCapture={handlePasteCapture}
      >
        {previewMode !== 'preview' && (
          <textarea
            ref={textareaRef}
            value={redTeamNotes}
            onChange={e => handleChange(e.target.value)}
            spellCheck={false}
            placeholder="Escribe tu bitácora en Markdown..."
            className={`${
              previewMode === 'split' ? 'w-1/2 border-r' : 'w-full'
            } h-full resize-none outline-none p-4 font-mono text-[12px] leading-relaxed bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-800 custom-scrollbar`}
          />
        )}

        {previewMode !== 'edit' && (
          <div
            className={`${
              previewMode === 'split' ? 'w-1/2' : 'w-full'
            } h-full overflow-auto custom-scrollbar bg-slate-50 dark:bg-slate-900`}
          >
            {PreviewContent}
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================================
// SUB-COMPONENTE: botón de barra de herramientas
// ==========================================================
function ToolbarButton({
  onClick,
  title,
  children,
  active = false,
  italic = false,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  active?: boolean;
  italic?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1 text-[11px] font-bold rounded transition-colors ${
        italic ? 'italic' : ''
      } ${
        active
          ? 'bg-[#0b282c] text-white'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  );
}
