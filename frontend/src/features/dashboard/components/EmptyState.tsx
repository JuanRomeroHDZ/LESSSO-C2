export function EmptyState({ handleImport }: { handleImport: () => void }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-12 text-center shadow-sm flex flex-col items-center">
      <h3 className="text-slate-900 dark:text-white mb-4 font-bold text-lg">Centro de Datos Vacío</h3>
      <button
        onClick={handleImport}
        className="px-6 py-2 bg-[#0b282c] text-white font-bold shadow-lg shadow-[#0b282c]/30 hover:bg-[#081e21] uppercase text-xs rounded-lg transition-all active:scale-95"
      >
        Importar Workspace Anterior (.json)
      </button>
    </div>
  );
}
