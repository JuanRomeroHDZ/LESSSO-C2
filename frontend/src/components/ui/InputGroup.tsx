export function InputGroup({ label, value, onChange, placeholder, disabled = false }: any) {
  return (
    <div className="space-y-1">
      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-0.5">{label}</label>
      <input 
        type="text" 
        value={value} 
        onChange={(e) => onChange(e.target.value)} 
        disabled={disabled} 
        placeholder={placeholder} 
        className="w-full px-3 py-2 text-xs bg-white dark:bg-[#0b1120] border border-slate-200 dark:border-slate-800 rounded-md outline-none disabled:opacity-40 font-mono shadow-sm focus:border-teal-500 transition-colors" 
      />
    </div>
  );
}
