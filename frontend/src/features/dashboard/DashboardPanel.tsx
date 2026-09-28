import { useState, useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, XAxis } from 'recharts'
import { save, open } from '@tauri-apps/plugin-dialog'
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs'
import { useScanStore, type HostInfo } from '../../core/store/useScanStore'

const IANA_PORTS: Record<string, string> = { '21': 'FTP', '22': 'SSH', '23': 'Telnet', '25': 'SMTP', '53': 'DNS', '80': 'HTTP', '110': 'POP3', '143': 'IMAP', '443': 'HTTPS', '445': 'SMB', '3306': 'MySQL', '3389': 'RDP', '5432': 'PostgreSQL', '8080': 'HTTP-Alt' }

const detectCVEs = (service: string, version: string) => {
  const cves: string[] = []; const s = `${service || ''} ${version || ''}`.toLowerCase();
  if (s.includes('openssh 8.') || s.includes('openssh 9.0') || s.includes('openssh 9.1')) cves.push('CVE-2023-38408 (RCE)');
  if (s.includes('vsftpd 2.3.4')) cves.push('CVE-2011-2523 (Backdoor)');
  if ((s.includes('smb') || s.includes('microsoft-ds')) && (s.includes('windows 7') || s.includes('windows server 2008'))) cves.push('MS17-010');
  if (s.includes('apache') && s.includes('2.4.49')) cves.push('CVE-2021-41773');
  return cves;
}

const calculateScore = (host: HostInfo) => {
  let score = 100; let vulns = 0;
  (host.ports || []).forEach(p => {
    if (p.state === 'open') {
       score -= 5;
       if (['21','22','23','445','3389'].includes(p.portid)) score -= 15;
       const cves = detectCVEs(p.service, p.version);
       if (cves.length > 0) { score -= 40; vulns += cves.length; }
    }
  });
  if (score < 0) score = 0;
  let grade = 'A'; let color = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400';
  if (score < 90) { grade = 'B'; color = 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'; }
  if (score < 70) { grade = 'C'; color = 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400'; }
  if (score < 50) { grade = 'D'; color = 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400'; }
  if (score < 30) { grade = 'F'; color = 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400 animate-pulse border-red-500 border'; }
  return { score, grade, color, vulns };
}

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

export function DashboardPanel() {
  const { parsedData, historyData, isScanning, target, commandString, theme, scanDuration, clearHistory, compactMode, toggleCompactMode, importWorkspace, vaultCredentials, redTeamNotes } = useScanStore()
  const [search, setSearch] = useState('')
  const [showDiff, setShowDiff] = useState(false)
  
  // Filtros Avanzados (Pills)
  const [filterUp, setFilterUp] = useState(false)  
  const [filterVuln, setFilterVuln] = useState(false) 
  const [filterWeb, setFilterWeb] = useState(false) 
  
  const [visibleCount, setVisibleCount] = useState(20)
  const [expandedPorts, setExpandedPorts] = useState<Record<string, boolean>>({})
  const [expandedHosts, setExpandedHosts] = useState<Record<string, boolean>>({})
  const [previewModal, setPreviewModal] = useState<'md' | 'html' | 'json' | null>(null)

  const filteredData = (parsedData || []).filter(host => {
    if (filterUp && host.status !== 'up') return false;
    if (filterVuln) { const isVuln = (host.ports || []).some(p => detectCVEs(p.service, p.version).length > 0); if (!isVuln) return false; }
    if (filterWeb) { const hasWeb = (host.ports || []).some(p => ['80', '443', '8080', '8443'].includes(p.portid) && p.state === 'open'); if (!hasWeb) return false; }
    
    if (!search) return true; const q = search.toLowerCase();
    if (q.includes('port:')) return (host.ports || []).some(p => p.portid === q.match(/port:(\d+)/)?.[1]);
    return host.ip.includes(q) || (host.hostname && host.hostname.toLowerCase().includes(q)) || (host.alias && host.alias.toLowerCase().includes(q)) || (host.ports || []).some(p => (p.service || '').toLowerCase().includes(q));
  });

  const { upHosts, portChartData, osChartData, globalVulns, topServicesData } = useMemo(() => {
    let open = 0, filtered = 0, closed = 0, v = 0;
    const osMap: Record<string, number> = {};
    const srvMap: Record<string, number> = {};

    (parsedData || []).forEach(h => {
      const osName = h.os ? h.os.split(' ')[0] : 'Unknown'; osMap[osName] = (osMap[osName] || 0) + 1;
      (h.ports || []).forEach(p => {
        if (p.state === 'open') {  
            open++;  
            v += detectCVEs(p.service, p.version).length;  
            const srv = p.service || 'unknown';
            srvMap[srv] = (srvMap[srv] || 0) + 1;
        }
        else if (p.state === 'filtered') filtered++; else closed++;
      });
    });

    const topServices = Object.entries(srvMap).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count).slice(0, 5);

    return {  
      upHosts: (parsedData || []).filter(h => h.status === 'up').length,  
      globalVulns: v,  
      portChartData: [ { name: 'Abiertos', value: open }, { name: 'Filtrados', value: filtered }, { name: 'Cerrados', value: closed } ].filter(d => d.value > 0),  
      osChartData: Object.entries(osMap).map(([name, value]) => ({ name, value })),
      topServicesData: topServices
    }
  }, [parsedData])

  const handlePrint = () => {
    const allPorts: Record<string, boolean> = {};
    const allHosts: Record<string, boolean> = {};
    filteredData.forEach(h => {
      if (h.scripts?.length) allHosts[h.ip] = true;
      h.ports?.forEach(p => {
        if (p.scripts?.length) allPorts[`${h.ip}-${p.portid}`] = true;
      });
    });
    setExpandedHosts(allHosts);
    setExpandedPorts(allPorts);
    setVisibleCount(9999); 
    
    setTimeout(() => {
      window.print();
    }, 800);
  }

  const generateMarkdown = () => {
    let md = `# LESSSO C2 Security Report\n`;
    md += `**Objetivo Escaneado:** ${target}\n`;
    md += `**Comando Ejecutado:** \`${commandString}\`\n`;
    md += `**Fecha:** ${new Date().toLocaleString()}\n`;
    md += `**Duración:** ${scanDuration}\n\n`;

    filteredData.forEach(host => {
      md += `## Host: \`${host.ip}\` (${host.status.toUpperCase()})\n`;
      if(host.hostname) md += `- **DNS:** ${host.hostname}\n`;
      if(host.mac) md += `- **MAC:** ${host.mac}\n`;
      if(host.os) md += `- **SO:** ${host.os}\n\n`;
      
      if(host.ports && host.ports.length > 0) {
        md += `### Puertos Descubiertos\n`;
        md += `| Puerto | Estado | Razón | Servicio | Versión | Info Extra |\n|---|---|---|---|---|---|\n`;
        host.ports.forEach(p => {  
          md += `| ${p.portid}/${p.protocol} | ${p.state} | ${p.reason} | ${p.service || '-'} | ${p.version || '-'} | ${p.scripts && p.scripts.length > 0 ? p.scripts.length + ' scripts' : '-'} |\n`;  
        });

        const portsWithScripts = host.ports.filter(p => p.scripts && p.scripts.length > 0);
        if (portsWithScripts.length > 0) {
          md += `\n### Detalles de Scripts de Puertos\n`;
          portsWithScripts.forEach(p => {
            md += `#### Puerto ${p.portid}/${p.protocol}\n`;
            p.scripts!.forEach(s => { md += `- **${s.id}**:\n\`\`\`\n${s.output}\n\`\`\`\n`; });
          });
        }
      } else { md += `\n*Sin puertos abiertos detectados.*\n`; }

      if (host.scripts && host.scripts.length > 0) {
        md += `\n### Host Script Output\n`;
        host.scripts.forEach(s => { md += `- **${s.id}**:\n\`\`\`\n${s.output}\n\`\`\`\n`; });
      }
      md += `\n---\n`;
    });

    if (vaultCredentials.length > 0) {
        md += `\n## 🔐 Bóveda de Credenciales\n| Target | Tipo | Usuario | Secreto |\n|---|---|---|---|\n`;
        vaultCredentials.forEach(c => { md += `| ${c.target} | ${c.type.toUpperCase()} | ${c.username || '-'} | \`${c.secret}\` |\n`; });
    }

    if (redTeamNotes) {
        md += `\n## 📝 Bitácora de Auditoría\n\`\`\`text\n${redTeamNotes}\n\`\`\`\n`;
    }

    return md;
  }

  const generateHTML = () => {
    let html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>LESSSO C2 Report</title>
    <style>
      body{font-family:system-ui,-apple-system,sans-serif;background-color:#f1f5f9;color:#0f172a;margin:0;padding:20px}
      .container{max-width:1200px;margin:0 auto;}
      .header-card{background:white;padding:25px;border-radius:12px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1); border-top: 5px solid #4f46e5; margin-bottom: 30px;}
      h1{color:#1e293b;margin-top:0;font-size:1.8rem; font-weight:900;}
      .meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:15px;margin-top:20px;}
      .meta-item{background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0;}
      .meta-label{font-size:0.75rem;text-transform:uppercase;color:#64748b;font-weight:bold;margin-bottom:4px;display:block;}
      .meta-value{font-size:0.95rem;font-weight:600;font-family:monospace;color:#334155;}
      .host-card{background:white;border-radius:12px;box-shadow:0 2px 4px rgba(0,0,0,0.05);border:1px solid #cbd5e1;overflow:hidden;margin-bottom:30px;page-break-inside:avoid;}
      .host-header{background:#f8fafc;padding:15px 20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;}
      .host-title{font-size:1.4rem;font-weight:900;color:#0f172a; display:flex; align-items:center; gap: 10px;}
      .badge{padding:4px 10px;border-radius:9999px;font-size:0.75rem;font-weight:bold;text-transform:uppercase;}
      .bg-green{background:#dcfce7;color:#166534;border:1px solid #22c55e;}
      .bg-red{background:#fee2e2;color:#991b1b;border:1px solid #ef4444;}
      .table-container{width:100%;overflow-x:auto;}
      table{width:100%;border-collapse:collapse;text-align:left;font-size:0.85rem;}
      th,td{padding:10px 15px;border-bottom:1px solid #e2e8f0;vertical-align:top;}
      th{background:#f1f5f9;text-transform:uppercase;font-size:0.7rem;color:#64748b;font-weight:bold;letter-spacing:0.05em;}
      .port-row:hover{background-color:#f8fafc;}
      .port-open{color:#059669;font-weight:900;}
      .port-other{color:#d97706;font-weight:bold;}
      .script-block{background:#0f172a;color:#10b981;padding:12px;border-radius:6px;font-family:monospace;font-size:0.8rem;white-space:pre-wrap;margin-top:6px;border-left:3px solid #6366f1;}
      .script-title{color:#a5b4fc;font-weight:bold;margin-bottom:4px;display:block;}
      .section-title{background:#e0e7ff;color:#4338ca;padding:8px 15px;font-size:0.85rem;font-weight:bold;text-transform:uppercase;}
    </style></head><body><div class="container">
    
    <div class="header-card">
      <h1>LESSSO C2 Security Report</h1>
      <div class="meta-grid">
        <div class="meta-item"><span class="meta-label">Objetivo</span><span class="meta-value">${target || 'N/A'}</span></div>
        <div class="meta-item"><span class="meta-label">Fecha Ejecución</span><span class="meta-value">${new Date().toLocaleString()}</span></div>
        <div class="meta-item"><span class="meta-label">Duración</span><span class="meta-value">${scanDuration}</span></div>
        <div class="meta-item" style="grid-column: 1 / -1;"><span class="meta-label">Comando Exacto</span><span class="meta-value">${commandString}</span></div>
      </div>
    </div>`;

    filteredData.forEach(host => {
      const statusClass = host.status === 'up' ? 'bg-green' : 'bg-red';
      html += `<div class="host-card">
        <div class="host-header">
          <div class="host-title">${host.ip} ${host.hostname ? `<span style="font-size:0.9rem;color:#64748b;font-weight:normal;background:#e2e8f0;padding:2px 8px;border-radius:4px;">${host.hostname}</span>` : ''}</div>
          <div><span class="badge ${statusClass}">${host.status}</span></div>
        </div>
        <div style="padding:15px 20px; font-size:0.85rem; color:#475569; border-bottom:1px solid #e2e8f0; display:flex; gap: 20px;">
          <div><strong>OS:</strong> ${host.os || 'Desconocido'}</div>
          <div><strong>MAC:</strong> ${host.mac || '-'}</div>
        </div>`;

      if (host.ports && host.ports.length > 0) {
        html += `<div class="section-title">Puertos Descubiertos</div>
        <div class="table-container"><table><thead><tr><th>Puerto</th><th>Estado / Razón</th><th>Servicio</th><th>Versión / Producto</th><th>Scripts Extra</th></tr></thead><tbody>`;
        
        host.ports.forEach(p => {  
          const hasScripts = p.scripts && p.scripts.length > 0;
          let scriptsHtml = '';
          if(hasScripts) { p.scripts!.forEach(s => { scriptsHtml += `<div class="script-block"><span class="script-title">↳ ${s.id}</span>${s.output}</div>`; }); }

          html += `<tr class="port-row">
            <td><strong>${p.portid}/${p.protocol}</strong></td>
            <td><div class="${p.state === 'open' ? 'port-open' : 'port-other'}">${p.state.toUpperCase()}</div><div style="font-size:0.7rem;color:#94a3b8;">${p.reason}</div></td>
            <td><strong>${p.service || '-'}</strong></td>
            <td>${p.version || '-'}</td>
            <td>${hasScripts ? scriptsHtml : '<span style="color:#cbd5e1">-</span>'}</td>
          </tr>`;  
        });
        html += `</tbody></table></div>`;
      } else { html += `<div style="padding:20px; color:#64748b; font-style:italic;">Sin puertos abiertos detectados.</div>`; }

      if (host.scripts && host.scripts.length > 0) {
        html += `<div class="section-title" style="background:#fce7f3;color:#be185d;">Host Script Output</div>
        <div class="table-container"><table><thead><tr><th style="width:20%;">Script Name</th><th>Output</th></tr></thead><tbody>`;
        host.scripts.forEach(s => { html += `<tr><td><strong>${s.id}</strong></td><td><div class="script-block" style="margin-top:0;">${s.output}</div></td></tr>`; });
        html += `</tbody></table></div>`;
      }
      html += `</div>`;
    });

    if (vaultCredentials.length > 0) {
        html += `<div class="host-card" style="border-color:#10b981;">
            <div class="host-header" style="background:#ecfdf5;"><div class="host-title" style="color:#047857;">🔐 Bóveda de Credenciales</div></div>
            <div class="table-container"><table><thead><tr><th>Target</th><th>Tipo</th><th>Usuario</th><th>Secreto</th></tr></thead><tbody>`;
        vaultCredentials.forEach(c => {
            html += `<tr><td><strong>${c.target}</strong></td><td><span class="badge" style="background:#e2e8f0;color:#334155;">${c.type}</span></td><td>${c.username || '-'}</td><td><code style="color:#059669;background:#d1fae5;padding:2px 6px;border-radius:4px;">${c.secret}</code></td></tr>`;
        });
        html += `</tbody></table></div></div>`;
    }

    if (redTeamNotes) {
        html += `<div class="host-card" style="border-color:#f59e0b;">
            <div class="host-header" style="background:#fffbeb;"><div class="host-title" style="color:#b45309;">📝 Bitácora de Auditoría</div></div>
            <div style="padding:20px; white-space: pre-wrap; font-family: monospace; font-size: 0.9rem; color: #334155;">${redTeamNotes}</div>
        </div>`;
    }

    html += `</div></body></html>`;
    return html;
  }

  const handleSaveFile = async (type: 'md' | 'html' | 'json', content: string) => {
    try {
      const extension = type === 'md' ? 'md' : type === 'html' ? 'html' : 'json';
      const filePath = await save({ defaultPath: `lessso_c2_report_${Date.now()}.${extension}`, filters: [{ name: 'Documento', extensions: [extension] }] });
      if (filePath) { await writeTextFile(filePath, content); alert(`Guardado en:\n${filePath}`); }
    } catch (e: any) { alert(`Error al guardar:\n${e.message || e}`); }
  }
  
  const handleImport = async () => {
    try {
      const selected = await open({ filters: [{ name: 'JSON Workspace', extensions: ['json'] }] });
      if (selected && !Array.isArray(selected)) { const contents = await readTextFile(selected); importWorkspace(JSON.parse(contents)); }
    } catch (err: any) { alert(`Error al cargar archivo:\n${err.message || err}`); }
  }

  const togglePortExpand = (id: string) => setExpandedPorts(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleHostExpand = (id: string) => setExpandedHosts(prev => ({ ...prev, [id]: !prev[id] }));

  const paginatedData = filteredData.slice(0, visibleCount);

  if (isScanning && (!parsedData || parsedData.length === 0)) return <div className="bg-white dark:bg-slate-800 rounded-xl p-12 text-center shadow-sm"><h3 className="text-slate-900 dark:text-white animate-pulse font-bold">Estructurando Base de Datos de Nmap...</h3></div>
  if (!parsedData || parsedData.length === 0) return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-12 text-center shadow-sm flex flex-col items-center">
      <h3 className="text-slate-900 dark:text-white mb-4 font-bold text-lg">Centro de Datos Vacío</h3>
      <button onClick={handleImport} className="px-6 py-2 bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-500/30 hover:bg-indigo-500 uppercase text-xs rounded-lg transition-all active:scale-95">Importar Workspace Anterior (.json)</button>
    </div>
  )

  const pyClass = compactMode ? 'py-1' : 'py-2';

  return (
    <section className="flex flex-col h-full min-h-0 space-y-4 relative print:space-y-0 print:block">
      
      <style>{`
        @media print {
          body, html, #root, main, section, div { height: auto !important; min-height: auto !important; overflow: visible !important; }
          .custom-scrollbar { overflow: visible !important; }
          .print-force-colors { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-page-break { page-break-inside: avoid; margin-bottom: 25px; }
          pre { white-space: pre-wrap !important; word-break: break-word !important; }
        }
      `}</style>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 shrink-0 print:hidden">
        <div className="flex flex-col justify-center space-y-2">
          <div className="bg-indigo-50 dark:bg-indigo-900/20 p-2 rounded-lg border border-indigo-100 dark:border-indigo-800 flex justify-between items-center"><span className="block text-[9px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">Hosts Activos</span><span className="text-lg font-black text-slate-900 dark:text-white">{upHosts}/{parsedData.length}</span></div>
          <div className={`${globalVulns > 0 ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800'} p-2 rounded-lg border flex justify-between items-center`}><span className={`block text-[9px] font-bold uppercase ${globalVulns > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>CVEs Detectados</span><span className="text-lg font-black text-slate-900 dark:text-white">{globalVulns}</span></div>
          <div className="bg-slate-100 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-200 dark:border-slate-700 flex justify-between items-center"><span className="block text-[9px] font-bold text-slate-500 uppercase">Tiempo Auditoría</span><span className="text-xs font-mono text-slate-900 dark:text-white">{scanDuration}</span></div>
        </div>
        
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center"><span className="text-[9px] font-bold text-slate-500 uppercase">Estado de Puertos</span><div className="h-20 w-full mt-1"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={portChartData} innerRadius={20} outerRadius={35} paddingAngle={5} dataKey="value" stroke="none">{portChartData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie><RechartsTooltip contentStyle={{ background: theme === 'dark' ? '#1e293b' : '#fff', border: 'none', borderRadius: '6px', fontSize: '10px' }} /></PieChart></ResponsiveContainer></div></div>
        
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center"><span className="text-[9px] font-bold text-slate-500 uppercase">Distribución OS</span><div className="h-20 w-full mt-1"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={osChartData} innerRadius={0} outerRadius={35} dataKey="value" stroke="none">{osChartData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />)}</Pie><RechartsTooltip contentStyle={{ background: theme === 'dark' ? '#1e293b' : '#fff', border: 'none', borderRadius: '6px', fontSize: '10px' }} /></PieChart></ResponsiveContainer></div></div>
        
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center"><span className="text-[9px] font-bold text-slate-500 uppercase">Top Servicios</span><div className="h-20 w-full mt-1"><ResponsiveContainer width="100%" height="100%"><BarChart data={topServicesData}><XAxis dataKey="name" hide /><RechartsTooltip cursor={{fill: 'transparent'}} contentStyle={{ background: theme === 'dark' ? '#1e293b' : '#fff', border: 'none', borderRadius: '6px', fontSize: '10px' }} /><Bar dataKey="count" fill="#8b5cf6" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer></div></div>

        <div className="flex flex-col gap-1 justify-center p-3 rounded-lg border border-slate-200 dark:border-slate-700 overflow-y-auto custom-scrollbar">
          <button onClick={() => setPreviewModal('json')} className="w-full text-[9px] font-bold uppercase bg-slate-800 dark:bg-slate-700 text-white py-1.5 rounded hover:bg-slate-700 shadow-sm transition-colors">Ver / Exportar JSON</button>
          <div className="flex gap-1 w-full">
             <button onClick={() => setPreviewModal('md')} className="flex-1 text-[9px] font-bold uppercase bg-fuchsia-600 text-white py-1.5 rounded hover:bg-fuchsia-500 shadow-sm transition-colors">Ver MD</button>
             <button onClick={() => setPreviewModal('html')} className="flex-1 text-[9px] font-bold uppercase bg-orange-600 text-white py-1.5 rounded hover:bg-orange-500 shadow-sm transition-colors">Ver HTML</button>
          </div>
          <button onClick={handlePrint} className="w-full text-[9px] font-bold uppercase border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 shadow-sm transition-colors">Imprimir PDF</button>
          <button onClick={clearHistory} className="w-full text-[9px] font-bold uppercase border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 py-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 shadow-sm transition-colors">Borrar Memoria</button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 shrink-0 print:hidden justify-between items-center bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
        <input type="text" value={search} onChange={(e) => {setSearch(e.target.value); setVisibleCount(20);}} placeholder="Buscar IP, puerto:22, os:linux..." className="flex-1 px-3 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-[11px] outline-none dark:text-white" />
        
        {/* Píldoras de Filtro Rápido (Activos, Web, CVEs) */}
        <div className="flex gap-1.5">
          <button onClick={() => {setFilterUp(!filterUp); setVisibleCount(20);}} className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-colors border ${filterUp ? 'bg-indigo-100 border-indigo-300 text-indigo-700 dark:bg-indigo-900/50 dark:border-indigo-500/50 dark:text-indigo-300 shadow-sm' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>🟢 Activos</button>
          <button onClick={() => {setFilterWeb(!filterWeb); setVisibleCount(20);}} className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-colors border ${filterWeb ? 'bg-sky-100 border-sky-300 text-sky-700 dark:bg-sky-900/50 dark:border-sky-500/50 dark:text-sky-300 shadow-sm' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>🌐 Web</button>
          <button onClick={() => {setFilterVuln(!filterVuln); setVisibleCount(20);}} className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-colors border ${filterVuln ? 'bg-red-100 border-red-300 text-red-700 dark:bg-red-900/50 dark:border-red-500/50 dark:text-red-400 shadow-sm' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>🚨 CVEs</button>
          <button onClick={toggleCompactMode} className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-colors border ${compactMode ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 shadow-sm' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>≡ Comp</button>
          <label className={`flex items-center space-x-1.5 cursor-pointer px-3 py-1 rounded-full border transition-colors ${historyData.length > 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 hover:bg-emerald-100' : 'opacity-50 border-slate-200'}`}><input type="checkbox" checked={showDiff} disabled={historyData.length === 0} onChange={() => setShowDiff(!showDiff)} className="rounded w-3 h-3 accent-emerald-500" /><span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">Diff</span></label>
        </div>
      </div>

      <div className="flex-1 overflow-visible space-y-4 pb-8 print:block print:space-y-6">
        <div className="hidden print:block mb-8 border-b-2 border-slate-800 pb-4 print-force-colors">
            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-widest font-['Poppins']">LESSSO C2 Report</h1>
            <p className="text-sm font-bold text-slate-500 mt-2">Objetivo: {target} | Fecha: {new Date().toLocaleString()}</p>
        </div>

        {paginatedData.map((host, idx) => {
          const { score, grade, color, vulns } = calculateScore(host);
          const hasHostScripts = host.scripts && host.scripts.length > 0;
          const hostExpanded = expandedHosts[host.ip];

          return (
          <div key={`${host.ip}-${idx}`} className={`print-page-break print-force-colors bg-white dark:bg-slate-800 rounded-lg shadow-sm border ${vulns > 0 ? 'border-red-300 dark:border-red-900/50 print:border-slate-300' : 'border-slate-200 dark:border-slate-700 print:border-slate-300'} overflow-hidden flex flex-col print:shadow-none print:bg-white print:text-black`}>
            
            <div className="bg-slate-50 dark:bg-slate-900/50 px-4 py-2 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center print:bg-white print:border-slate-300">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[13px] font-black text-slate-900 dark:text-white print:text-black">{host.ip}</h2>
                  {host.hostname && <span className="text-[9px] font-bold text-slate-500 bg-slate-200 dark:bg-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 print:bg-slate-100 print:text-slate-800">{host.hostname}</span>}
                </div>
                <div className="flex gap-1.5 items-center mt-0.5">
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${host.status === 'up' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'} print:border print:bg-slate-100 print:text-black`}>{host.status}</span>
                  <span title={`Score: ${score}/100`} className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${color} print:bg-slate-100 print:text-black print:border`}>Sec Grade: {grade}</span>
                  
                  {hasHostScripts && (
                    <button onClick={() => toggleHostExpand(host.ip)} className="ml-2 px-1.5 py-0.5 bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400 text-[9px] font-bold uppercase rounded-md border border-fuchsia-300 dark:border-fuchsia-800/50 hover:bg-fuchsia-200 flex items-center gap-1 transition-colors print:hidden">
                      {hostExpanded ? 'Ocultar Info Extra' : `[+] ${host.scripts!.length} Scripts de Host`}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {hostExpanded && hasHostScripts && (
              <div className="bg-slate-900 border-b border-slate-700 p-3 overflow-x-auto custom-scrollbar shadow-inner print:bg-slate-50 print:border-slate-300 print:shadow-none print:break-inside-avoid">
                {host.scripts?.map((s, idx) => (
                  <div key={idx} className="mb-2 last:mb-0">
                    <span className="text-[10px] font-black uppercase text-fuchsia-400 border-b border-fuchsia-900 block mb-1 print:text-fuchsia-700 print:border-fuchsia-300">↳ {s.id}</span>
                    <pre className="text-[10px] font-mono text-emerald-400 whitespace-pre-wrap leading-relaxed print:text-black">{s.output}</pre>
                  </div>
                ))}
              </div>
            )}

            <div className="w-full overflow-x-auto print:border-none print:overflow-visible">
              <table className="w-full text-[11px] text-left text-slate-600 dark:text-slate-300 print:text-black">
                <thead className="text-[9px] text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-900/20 border-b border-slate-100 dark:border-slate-700 print:bg-transparent print:border-slate-300">
                  <tr>
                    <th className="px-3 py-1.5 font-bold w-20">Puerto</th>
                    <th className="px-3 py-1.5 font-bold">Estado</th>
                    <th className="px-3 py-1.5 font-bold">Servicio</th>
                    <th className="px-3 py-1.5 font-bold">Versión</th>
                    <th className="px-3 py-1.5 font-bold text-right">Info Extra</th>
                  </tr>
                </thead>
                <tbody>
                  {!host.ports || host.ports.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-2 text-center text-slate-400 text-[10px]">Sin puertos abiertos</td></tr>
                  ) : (
                    host.ports.map((port, pidx) => {
                      const cvList = detectCVEs(port.service, port.version);
                      const ianaDesc = IANA_PORTS[port.portid];
                      const pastHost = historyData.find(h => h.ip === host.ip);
                      const isNewPort = showDiff && pastHost && !(pastHost.ports || []).some(p => p.portid === port.portid);
                      
                      const portKey = `${host.ip}-${port.portid}`;
                      const hasScripts = port.scripts && port.scripts.length > 0;
                      const isExpanded = expandedPorts[portKey];

                      return (
                        <>
                          <tr key={pidx} className={`border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50/50 dark:hover:bg-slate-700/20 transition-colors ${isNewPort ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''} print:border-slate-200 print:break-inside-avoid`}>
                            <td className={`px-3 ${pyClass} font-bold text-slate-900 dark:text-slate-200 print:text-black flex items-center gap-1`}>
                              {hasScripts && <button onClick={() => togglePortExpand(portKey)} className="text-[9px] w-4 h-4 flex items-center justify-center bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 font-black rounded hover:bg-indigo-500 hover:text-white transition-colors print:hidden">{isExpanded ? '-' : '+'}</button>}
                              {port.portid}/{port.protocol}{isNewPort && <span className="ml-1 bg-emerald-500 text-white text-[8px] px-1 py-0.5 rounded-sm">NUEVO</span>}
                            </td>
                            <td className={`px-3 ${pyClass}`}><span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase w-fit ${port.state === 'open' ? 'text-emerald-600 dark:text-emerald-400 print:text-emerald-700' : 'text-orange-500 dark:text-orange-400 print:text-orange-600'}`}>{port.state}</span></td>
                            <td className={`px-3 ${pyClass} font-medium text-slate-700 dark:text-slate-300 print:text-slate-800 flex flex-col`}><span>{port.service || '-'}</span>{ianaDesc && !compactMode && <span className="text-[8px] text-indigo-500 dark:text-indigo-400">{ianaDesc}</span>}</td>
                            <td className={`px-3 ${pyClass} text-slate-500 dark:text-slate-400 print:text-slate-600`}>{port.version || '-'}</td>
                            <td className={`px-3 ${pyClass} flex justify-end gap-1.5`}>
                               {cvList.length > 0 ? (
                                  <div className="flex flex-col gap-1">{cvList.map((v, i) => <span key={i} className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/50 text-[9px] px-1.5 py-0.5 rounded font-bold w-fit print:border-red-300">{compactMode ? '⚠️' : v}</span>)}</div>
                                ) : !compactMode && <span className="text-[9px] text-slate-400 print:text-slate-500">Ok</span>}
                            </td>
                          </tr>
                          
                          {isExpanded && hasScripts && (
                            <tr className="bg-slate-100 dark:bg-slate-900/50 print:bg-slate-50 print:break-inside-avoid">
                              <td colSpan={5} className="p-0 border-b border-slate-200 dark:border-slate-800 print:border-slate-300">
                                <div className="p-3 m-2 bg-slate-900 rounded-lg shadow-inner overflow-x-auto custom-scrollbar print:bg-transparent print:shadow-none print:border print:border-slate-200">
                                  {port.scripts?.map((s, idx) => (
                                    <div key={idx} className="mb-2 last:mb-0">
                                      <span className="text-[10px] font-black uppercase text-fuchsia-400 border-b border-fuchsia-900 block mb-1 print:text-fuchsia-700 print:border-fuchsia-300">↳ {s.id}</span>
                                      <pre className="text-[10px] font-mono text-emerald-400 whitespace-pre-wrap leading-relaxed print:text-slate-800">{s.output}</pre>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )})}

        {/* IMPRESIÓN DE BÓVEDA EN PDF AUTOMÁTICA */}
        <div className="hidden print:block mt-8 print-page-break print-force-colors">
            {vaultCredentials.length > 0 && (
              <div className="border border-emerald-300 rounded-lg overflow-hidden mb-6">
                 <div className="bg-emerald-50 px-4 py-2 border-b border-emerald-300"><h2 className="text-[13px] font-black text-emerald-800">🔐 Bóveda de Credenciales</h2></div>
                 <table className="w-full text-[11px] text-left text-black">
                    <thead className="text-[9px] uppercase bg-slate-100 border-b border-slate-300">
                      <tr><th className="px-3 py-1.5">Target</th><th className="px-3 py-1.5">Tipo</th><th className="px-3 py-1.5">Usuario</th><th className="px-3 py-1.5">Secreto</th></tr>
                    </thead>
                    <tbody>
                      {vaultCredentials.map(c => (
                        <tr key={c.id} className="border-b border-slate-200">
                          <td className="px-3 py-2 font-bold">{c.target}</td><td className="px-3 py-2"><span className="bg-slate-200 px-1 py-0.5 rounded">{c.type}</span></td><td className="px-3 py-2">{c.username || '-'}</td><td className="px-3 py-2 font-mono text-emerald-700 bg-emerald-50 px-1">{c.secret}</td>
                        </tr>
                      ))}
                    </tbody>
                 </table>
              </div>
            )}
            
            {redTeamNotes && (
              <div className="border border-orange-300 rounded-lg overflow-hidden">
                 <div className="bg-orange-50 px-4 py-2 border-b border-orange-300"><h2 className="text-[13px] font-black text-orange-800">📝 Bitácora de Auditoría</h2></div>
                 <pre className="p-4 text-[11px] text-slate-800 whitespace-pre-wrap font-mono">{redTeamNotes}</pre>
              </div>
            )}
        </div>

        {visibleCount < filteredData.length && (
          <div className="flex justify-center mt-3 print:hidden">
             <button onClick={() => setVisibleCount(v => v + 50)} className="px-4 py-1.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 text-[10px] font-bold uppercase rounded shadow-sm border border-indigo-200 dark:border-slate-800/50 hover:bg-indigo-200 transition-colors">
                Cargar más hosts ({filteredData.length - visibleCount} ocultos)
             </button>
          </div>
        )}
      </div>

      {previewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[80vh] rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center px-4 py-3 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-xs font-bold uppercase text-slate-800 dark:text-slate-200">Vista Previa: {previewModal.toUpperCase()}</h3>
              <button onClick={() => setPreviewModal(null)} className="text-slate-400 hover:text-red-500 font-bold">✕ Cerrar</button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-slate-100 dark:bg-slate-950">
              {previewModal === 'json' && <pre className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">{JSON.stringify(filteredData, null, 2)}</pre>}
              {previewModal === 'md' && <pre className="text-[11px] font-mono text-slate-700 dark:text-slate-300">{generateMarkdown()}</pre>}
              {previewModal === 'html' && <div className="bg-white p-4 rounded shadow-sm overflow-auto h-full text-black"><div dangerouslySetInnerHTML={{ __html: generateHTML() }} /></div>}
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
              <button onClick={() => setPreviewModal(null)} className="px-4 py-1.5 rounded text-xs font-bold text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700">Cancelar</button>
              <button onClick={() => handleSaveFile(previewModal, previewModal === 'json' ? JSON.stringify(filteredData, null, 2) : previewModal === 'md' ? generateMarkdown() : generateHTML())} className="px-4 py-1.5 bg-indigo-600 text-white rounded text-xs font-bold shadow hover:bg-indigo-500">Guardar Archivo {previewModal.toUpperCase()}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
