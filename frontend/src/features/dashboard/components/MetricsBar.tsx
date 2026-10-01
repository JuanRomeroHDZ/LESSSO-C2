import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, XAxis } from 'recharts';
import { Activity, ShieldAlert, PieChart as PieChartIcon, BarChart3 } from 'lucide-react';
import { COLORS } from '../utils/constants';

interface MetricsBarProps {
  upHosts: number;
  totalHosts: number;
  sevMetrics: { crit: number; high: number; med: number; total: number };
  portChartData: { name: string; value: number }[];
  osChartData: { name: string; value: number }[];
  topServicesData: { name: string; count: number }[];
  theme: 'light' | 'dark';
}

export function MetricsBar({
  upHosts, totalHosts, sevMetrics, portChartData, osChartData, topServicesData, theme
}: MetricsBarProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-6 gap-3 shrink-0 print:hidden w-full">
      <div className="flex flex-col justify-center space-y-3 lg:col-span-2 min-w-0">
        <div className="bg-white dark:bg-[#020617] p-3 rounded-xl border border-slate-200 dark:border-slate-800/60 shadow-sm flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-teal-500" />
            <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Hosts Activos</span>
          </div>
          <span className="text-xl font-black text-slate-900 dark:text-white font-mono">{upHosts}<span className="text-slate-400 text-sm">/{totalHosts}</span></span>
        </div>

        <div className={`p-3 rounded-xl border shadow-sm flex flex-col justify-center transition-colors ${
          sevMetrics.total > 0 
            ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50' 
            : 'bg-white dark:bg-[#020617] border-slate-200 dark:border-slate-800/60'
        }`}>
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <ShieldAlert size={14} className={sevMetrics.total > 0 ? 'text-rose-500' : 'text-emerald-500'} />
              <span className={`text-[10px] font-bold uppercase tracking-wider ${sevMetrics.total > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                CVEs Detectados
              </span>
            </div>
            <span className="text-xl font-black text-slate-900 dark:text-white font-mono leading-none">{sevMetrics.total}</span>
          </div>
          {sevMetrics.total > 0 && (
            <div className="flex gap-1 h-1.5 rounded-full overflow-hidden w-full opacity-80">
              {sevMetrics.crit > 0 && <div style={{ width: `${(sevMetrics.crit/sevMetrics.total)*100}%` }} className="bg-rose-500" title={`Críticos: ${sevMetrics.crit}`} />}
              {sevMetrics.high > 0 && <div style={{ width: `${(sevMetrics.high/sevMetrics.total)*100}%` }} className="bg-orange-500" title={`Altos: ${sevMetrics.high}`} />}
              {sevMetrics.med > 0 && <div style={{ width: `${(sevMetrics.med/sevMetrics.total)*100}%` }} className="bg-amber-500" title={`Medios: ${sevMetrics.med}`} />}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-[#020617] p-3 rounded-xl border border-slate-200 dark:border-slate-800/60 shadow-sm flex flex-col items-center min-w-0">
        <div className="flex items-center gap-1.5 w-full">
          <PieChartIcon size={12} className="text-slate-400" />
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Puertos</span>
        </div>
        <div className="h-16 w-full mt-2 min-w-0">
          <ResponsiveContainer width="100%" height={64}>
            <PieChart>
              <Pie data={portChartData} dataKey="value" innerRadius={18} outerRadius={30} paddingAngle={2} stroke="none">
                {portChartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip contentStyle={{ background: theme === 'dark' ? '#0f172a' : '#fff', border: theme === 'dark' ? '1px solid #1e293b' : '1px solid #e2e8f0', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white dark:bg-[#020617] p-3 rounded-xl border border-slate-200 dark:border-slate-800/60 shadow-sm flex flex-col items-center min-w-0">
        <div className="flex items-center gap-1.5 w-full">
          <PieChartIcon size={12} className="text-slate-400" />
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Sistemas OS</span>
        </div>
        <div className="h-16 w-full mt-2 min-w-0">
          <ResponsiveContainer width="100%" height={64}>
            <PieChart>
              <Pie data={osChartData} dataKey="value" innerRadius={0} outerRadius={30} stroke="none">
                {osChartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip contentStyle={{ background: theme === 'dark' ? '#0f172a' : '#fff', border: theme === 'dark' ? '1px solid #1e293b' : '1px solid #e2e8f0', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white dark:bg-[#020617] p-3 rounded-xl border border-slate-200 dark:border-slate-800/60 shadow-sm flex flex-col items-center min-w-0">
        <div className="flex items-center gap-1.5 w-full">
          <BarChart3 size={12} className="text-slate-400" />
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Top Servicios</span>
        </div>
        <div className="h-16 w-full mt-2 min-w-0">
          <ResponsiveContainer width="100%" height={64}>
            <BarChart data={topServicesData}>
              <XAxis dataKey="name" hide />
              <RechartsTooltip cursor={{ fill: theme === 'dark' ? '#1e293b' : '#f1f5f9' }} contentStyle={{ background: theme === 'dark' ? '#0f172a' : '#fff', border: theme === 'dark' ? '1px solid #1e293b' : '1px solid #e2e8f0', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace' }} />
              <Bar dataKey="count" fill={theme === 'dark' ? '#2dd4bf' : '#0f172a'} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
