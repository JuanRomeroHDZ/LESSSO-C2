import { Images, Maximize2, X, Trash2, ArrowLeft, ArrowRight } from 'lucide-react';

// Extendemos la interfaz para aceptar las coordenadas (aunque aquí solo las pasemos)
export interface ExtractedImage {
  alt: string;
  src: string;
  fullMatch: string;
  startIndex: number;
  endIndex: number;
}

interface EvidenceGalleryProps {
  images: ExtractedImage[];
  onClose: () => void;
  onSelectImage: (src: string) => void;
  onDeleteImage: (index: number) => void;
  onMoveImage: (index: number, direction: 'prev' | 'next') => void;
}

export function EvidenceGallery({ images, onClose, onSelectImage, onDeleteImage, onMoveImage }: EvidenceGalleryProps) {
  return (
    <div className="absolute inset-0 z-40 bg-slate-50 dark:bg-[#050505] flex flex-col animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md shrink-0">
        <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 text-slate-800 dark:text-slate-200">
          <Images size={16} className="text-indigo-500" /> Galería de Evidencias ({images.length})
        </h3>
        <button  
          onClick={onClose}  
          className="p-1.5 text-slate-400 bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-md hover:bg-rose-500 hover:text-white hover:border-rose-500 transition-colors outline-none shadow-sm"
        >
          <X size={14} />
        </button>
      </div>
       
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#262626_1px,transparent_1px)] [background-size:20px_20px]">
        {images.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500">
            <Images size={48} className="mb-4 opacity-20" />
            <p className="text-[11px] font-bold uppercase tracking-widest text-center">
              No hay imágenes en la bitácora<br/>Pega una captura para empezar (Ctrl+V)
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {images.map((img, i) => (
              <div  
                key={`${img.startIndex}-${i}`}  
                className="group relative bg-white dark:bg-[#0b1120] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm hover:border-indigo-500/50 hover:shadow-indigo-500/10 transition-all cursor-pointer select-none"  
                onClick={() => onSelectImage(img.src)}
              >
                
                {/* BOTONES DE ACCIÓN (Aparecen en Hover) */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex gap-1">
                  <button onClick={(e) => { e.stopPropagation(); onDeleteImage(i); }} className="p-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded shadow-md transition-colors" title="Eliminar imagen">
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex gap-1.5">
                  <button disabled={i === 0} onClick={(e) => { e.stopPropagation(); onMoveImage(i, 'prev'); }} className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800/50 disabled:opacity-50 text-white rounded shadow-md transition-colors" title="Mover a la izquierda">
                    <ArrowLeft size={14} />
                  </button>
                  <button disabled={i === images.length - 1} onClick={(e) => { e.stopPropagation(); onMoveImage(i, 'next'); }} className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800/50 disabled:opacity-50 text-white rounded shadow-md transition-colors" title="Mover a la derecha">
                    <ArrowRight size={14} />
                  </button>
                </div>

                {/* IMAGEN Y VISOR */}
                <div className="aspect-video bg-slate-100 dark:bg-black/50 p-2 flex items-center justify-center overflow-hidden relative">
                  <img src={img.src} alt={img.alt} className="max-w-full max-h-full object-contain shadow-sm" />
                  <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px] z-10">
                    <Maximize2 size={28} className="text-white" />
                  </div>
                </div>

                <div className="p-3 border-t border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-transparent">
                  <p className="text-[9px] font-mono text-slate-500 dark:text-slate-400 truncate font-medium" title={img.alt || `Evidencia ${i + 1}`}>
                    {img.alt || `Evidencia_${i + 1}.png`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
