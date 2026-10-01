import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, XAxis } from 'recharts';
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
    <div className="grid grid-cols-1 md:grid-cols-6 gap-3 shrink-0 print:hidden">
      <div className="flex flex-col justify-center space-y-2 col-span-2">
        <div className="bg-slate-100 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <span className="block text-[9px] font-bold text-slate-500 uppercase">Hosts Activos</span>
          <span className="text-lg font-black text-slate-900 dark:text-white">{upHosts}/{totalHosts}</span>
        </div>

        <div className={`p-2 rounded-lg border flex flex-col justify-center ${sevMetrics.total > 0 ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/50' : 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/50'}`}>
          <div className="flex justify-between items-center mb-1">
            <span className={`text-[9px] font-bold uppercase ${sevMetrics.total > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              CVEs Detectados
            </span>
            <span className="text-lg font-black text-slate-900 dark:text-white leading-none">{sevMetrics.total}</span>
          </div>
          {sevMetrics.total > 0 && (
            <div className="flex gap-1">
              <div className="flex-1 bg-red-500 text-white text-[8px] font-bold px-1 py-0.5 rounded text-center" title="Críticos">{sevMetrics.crit} CRIT</div>
              <div className="flex-1 bg-orange-500 text-white text-[8px] font-bold px-1 py-0.5 rounded text-center" title="Altos">{sevMetrics.high} HIGH</div>
              <div className="flex-1 bg-yellow-500 text-white text-[8px] font-bold px-1 py-0.5 rounded text-center" title="Medios">{sevMetrics.med} MED</div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center">
        <span className="text-[9px] font-bold text-slate-500 uppercase">Estado Puertos</span>
        <div className="h-16 w-full mt-1">
          <ResponsiveContainer width="100%" height={64}>
            <PieChart>
              <Pie data={portChartData} dataKey="value" innerRadius={15} outerRadius={25} paddingAngle={5} stroke="none">
                {portChartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip contentStyle={{ background: theme === 'dark' ? '#1e293b' : '#fff', border: 'none', borderRadius: '6px', fontSize: '10px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center">
        <span className="text-[9px] font-bold text-slate-500 uppercase">Distribución OS</span>
        <div className="h-16 w-full mt-1">
          <ResponsiveContainer width="100%" height={64}>
            <PieChart>
              <Pie data={osChartData} dataKey="value" innerRadius={0} outerRadius={25} stroke="none">
                {osChartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip contentStyle={{ background: theme === 'dark' ? '#1e293b' : '#fff', border: 'none', borderRadius: '6px', fontSize: '10px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center">
        <span className="text-[9px] font-bold text-slate-500 uppercase">Top Servicios</span>
        <div className="h-16 w-full mt-1">
          <ResponsiveContainer width="100%" height={64}>
            <BarChart data={topServicesData}>
              <XAxis dataKey="name" hide />
              <RechartsTooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: theme === 'dark' ? '#1e293b' : '#fff', border: 'none', borderRadius: '6px', fontSize: '10px' }} />
              <Bar dataKey="count" fill="#0b282c" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
