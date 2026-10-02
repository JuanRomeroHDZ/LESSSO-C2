import { useState, useMemo } from 'react';
import { useScanStore } from '../../core/store/useScanStore';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { AssetsTable } from './components/AssetsTable';
import { Search, Download, Trash2, Server } from 'lucide-react';

export function InventoryWorkspace() {
  const { parsedData } = useScanStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIps, setSelectedIps] = useState<Set<string>>(new Set());

  const filteredHosts = useMemo(() => {
    if (!parsedData) return [];
    const query = searchQuery.toLowerCase().trim();
    if (!query) return parsedData;
    
    return parsedData.filter(host => {
      if (host.ip.includes(query)) return true;
      if (host.hostname?.toLowerCase().includes(query)) return true;
      if (host.os?.toLowerCase().includes(query)) return true;
      if (host.ports?.some(p => p.portid === query || p.service?.toLowerCase().includes(query))) return true;
      return false;
    });
  }, [parsedData, searchQuery]);

  const handleToggleSelect = (ip: string) => {
    setSelectedIps(prev => {
      const next = new Set(prev);
      if (next.has(ip)) next.delete(ip);
      else next.add(ip);
      return next;
    });
  };

  const handleToggleAll = () => {
    if (selectedIps.size === filteredHosts.length) {
      setSelectedIps(new Set());
    } else {
      setSelectedIps(new Set(filteredHosts.map(h => h.ip)));
    }
  };

  const clearSelection = () => setSelectedIps(new Set());

  const exportToCSV = async () => {
    if (selectedIps.size === 0) return;
    const hostsToExport = filteredHosts.filter(h => selectedIps.has(h.ip));
    
    const headers = ['IP', 'Hostname', 'OS', 'Estado', 'Puertos Abiertos', 'Vulns Detectadas'];
    const rows = hostsToExport.map(h => [
      h.ip,
      h.hostname || 'N/A',
      h.os || 'Desconocido',
      h.status,
      h.ports?.filter(p => p.state === 'open').length || 0,
      h.ports?.reduce((acc, p) => acc + (p.cves?.length || 0), 0) || 0
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    try {
      const filePath = await save({
        defaultPath: `lessso_inventory_${Date.now()}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      });
      if (filePath) {
        await writeTextFile(filePath, csvContent);
        alert('✅ Inventario exportado exitosamente a CSV.');
      }
    } catch (error: any) {
      if (!error.message?.toLowerCase().includes('cancel')) {
        alert('Error al guardar el CSV: ' + error);
      }
    }
  };


  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 p-4 space-y-4 min-w-0">
      
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-[#020617] p-4 rounded-xl border border-slate-200 dark:border-slate-800/80 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-[#0b282c] dark:bg-teal-500/10 text-white dark:text-teal-400 p-2 rounded-lg border border-transparent dark:border-teal-500/20">
            <Server size={20} />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">Inventario Global</h2>
            <p className="text-[10px] font-bold text-slate-500 tracking-wider">{parsedData?.length || 0} activos descubiertos</p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrar por IP, OS, Puerto..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs outline-none dark:text-white font-mono focus:border-teal-500 focus:ring-1 focus:ring-teal-500/50 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Mass Actions Bar */}
      {selectedIps.size > 0 && (
        <div className="bg-teal-500/10 border border-teal-500/30 text-teal-700 dark:text-teal-400 px-4 py-2 rounded-lg flex justify-between items-center shrink-0 animate-in fade-in slide-in-from-top-2">
          <span className="text-[11px] font-black uppercase tracking-widest">
            {selectedIps.size} activos seleccionados
          </span>
          <div className="flex gap-2">
            <button onClick={exportToCSV} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-[10px] font-bold uppercase tracking-wider rounded transition-colors shadow-sm">
              <Download size={12} /> Exportar CSV
            </button>
            <button onClick={clearSelection} className="flex items-center gap-1.5 px-3 py-1.5 border border-teal-500/30 hover:bg-teal-500/20 text-[10px] font-bold uppercase tracking-wider rounded transition-colors">
              <Trash2 size={12} /> Limpiar
            </button>
          </div>
        </div>
      )}

      {/* Table Container */}
      <div className="flex-1 min-h-0 relative">
        <AssetsTable
          hosts={filteredHosts}
          selectedIps={selectedIps}
          onToggleSelect={handleToggleSelect}
          onToggleAll={handleToggleAll}
        />
      </div>
    </div>
  );
}
