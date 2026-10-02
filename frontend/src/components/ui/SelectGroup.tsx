export function SelectGroup({ label, value, onChange, options, disabled = false }: any) {
  return (
    <div className="space-y-1">
      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-0.5">{label}</label>
      <select 
        value={value} 
        onChange={(e) => onChange(e.target.value)} 
        disabled={disabled} 
        className="w-full px-3 py-2 bg-white dark:bg-[#0b1120] border border-slate-200 dark:border-slate-800 rounded-md text-xs dark:text-slate-200 outline-none disabled:opacity-40 shadow-sm cursor-pointer"
      >
        {options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
