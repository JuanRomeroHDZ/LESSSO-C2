import type { ScriptInfo } from '../../../core/store/useScanStore';

interface ScriptBlockProps {
  script: ScriptInfo;
}

export function ScriptBlock({ script }: ScriptBlockProps) {
  return (
    <div className="mb-2 last:mb-0">
      <span className="text-[10px] font-black uppercase text-teal-400 border-b border-teal-900 block mb-1 print:text-teal-700 print:border-teal-300">
        ↳ {script.id}
      </span>
      <pre className="text-[10px] font-mono text-emerald-400 whitespace-pre-wrap leading-relaxed print:text-black">
        {script.output}
      </pre>
    </div>
  );
}
