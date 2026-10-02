import React from 'react';

export function SectionGroup({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800/80 pb-1.5 px-1">
        {title}
      </h3>
      {children}
    </div>
  );
}
