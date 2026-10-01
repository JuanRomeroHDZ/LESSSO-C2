import type { ScriptInfo } from '../../../core/store/useScanStore';
import { Code2 } from 'lucide-react';

interface ScriptBlockProps {
  script: ScriptInfo;
}

export function ScriptBlock({ script }: ScriptBlockProps) {
  return (
    <div className="mb-4 last:mb-0 bg-[#020617] rounded-lg border border-slate-800 overflow-hidden">
      <div className="bg-slate-900 px-3 py-1.5 border-b border-slate-800 flex items-center gap-2">
        <Code2 size={12} className="text-indigo-500" />
        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 print:text-indigo-700">
          {script.id}
        </span>
      </div>
      <pre className="p-3 text-[10px] font-mono text-slate-300 whitespace-pre-wrap leading-relaxed print:text-black custom-scrollbar overflow-x-auto">
        {script.output}
      </pre>
    </div>
  );
}
