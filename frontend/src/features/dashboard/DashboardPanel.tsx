import { useState, useMemo, Fragment } from 'react'
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, XAxis } from 'recharts'
import { save, open } from '@tauri-apps/plugin-dialog'
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs'
import { useScanStore, type HostInfo } from '../../core/store/useScanStore'

// ==========================================================
// CONSTANTES
// ==========================================================
const IANA_PORTS: Record<string, string> = {
  '21': 'FTP', '22': 'SSH', '23': 'Telnet', '25': 'SMTP', '53': 'DNS',
  '80': 'HTTP', '110': 'POP3', '143': 'IMAP', '443': 'HTTPS', '445': 'SMB',
  '3306': 'MySQL', '3389': 'RDP', '5432': 'PostgreSQL', '8080': 'HTTP-Alt',
  '8443': 'HTTPS-Alt',
}

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6']

// ==========================================================
// SEGURIDAD — ESCAPE DE HTML
// ----------------------------------------------------------
// Cualquier valor que venga de Nmap, del usuario o de la
// bóveda DEBE pasar por aquí antes de interpolarse en un
// string HTML. Cubre los 6 caracteres peligrosos clásicos.
// ==========================================================
function escapeHtml(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) return ''
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;')
}

// ==========================================================
// SEGURIDAD — ESCAPE PARA MARKDOWN
// ----------------------------------------------------------
// En Markdown, los caracteres peligrosos son:
//   - backticks (rompen bloques de código)
//   - pipes (rompen tablas)
//   - saltos de línea en celdas (rompen filas)
// No escapamos todo el markdown, solo lo que va dentro de
// contextos estructurados (tablas, inline code).
// ==========================================================
function escapeMdCell(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) return '-'
  return String(unsafe)
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .replace(/`/g, "'")
}

function escapeMdCode(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) return ''
  // Neutraliza backticks triples y secuencias que cierren el fence
  return String(unsafe).replace(/```/g, "'''")
}

function escapeMdInline(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) return '-'
  return String(unsafe).replace(/`/g, "'")
}

// ==========================================================
// DETECCIÓN DE CVEs
// ==========================================================
const detectCVEs = (service: string, version: string) => {
  const cves: { id: string; severity: 'critical' | 'high' | 'medium' }[] = []
  const s = `${service || ''} ${version || ''}`.toLowerCase()

  if (s.includes('openssh 8.') || s.includes('openssh 9.0') || s.includes('openssh 9.1')) cves.push({ id: 'CVE-2023-38408', severity: 'critical' })
  if (s.includes('vsftpd 2.3.4')) cves.push({ id: 'CVE-2011-2523', severity: 'high' })
  if ((s.includes('smb') || s.includes('microsoft-ds')) && (s.includes('windows 7') || s.includes('windows server 2008'))) cves.push({ id: 'MS17-010', severity: 'critical' })
  if (s.includes('apache') && s.includes('2.4.49')) cves.push({ id: 'CVE-2021-41773', severity: 'high' })
  if (s.includes('proftpd 1.3.5')) cves.push({ id: 'CVE-2015-3306', severity: 'high' })

  return cves
}

// ==========================================================
// SCORE DE SEGURIDAD
// ==========================================================
const calculateScore = (host: HostInfo) => {
  let score = 100
  let vulns = 0
  ;(host.ports || []).forEach(p => {
    if (p.state === 'open') {
      score -= 5
      if (['21', '22', '23', '445', '3389'].includes(p.portid)) score -= 15
      const cves = detectCVEs(p.service, p.version)
      if (cves.length > 0) {
        cves.forEach(c => {
          if (c.severity === 'critical') score -= 40
          else if (c.severity === 'high') score -= 25
          else score -= 10
        })
        vulns += cves.length
      }
    }
  })
  if (score < 0) score = 0

  let grade = 'A'
  let color = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
  if (score < 90) { grade = 'B'; color = 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400' }
  if (score < 70) { grade = 'C'; color = 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400' }
  if (score < 50) { grade = 'D'; color = 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400' }
  if (score < 30) { grade = 'F'; color = 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400 border-red-500 border' }
  return { score, grade, color, vulns }
}

export function DashboardPanel() {
  const {
    parsedData, historyData, isScanning, target, commandString, theme,
    scanDuration, clearHistory, compactMode, toggleCompactMode,
    importWorkspace, vaultCredentials, redTeamNotes,
  } = useScanStore()

  const [search, setSearch] = useState('')
  const [showDiff, setShowDiff] = useState(false)
  const [filterUp, setFilterUp] = useState(false)
  const [filterVuln, setFilterVuln] = useState(false)
  const [filterWeb, setFilterWeb] = useState(false)

  const [filterOS, setFilterOS] = useState<'all'|'windows'|'linux'>('all')
  const [filterCritPorts, setFilterCritPorts] = useState(false)

  const [visibleCount, setVisibleCount] = useState(20)
  const [expandedPorts, setExpandedPorts] = useState<Record<string, boolean>>({})
  const [expandedHosts, setExpandedHosts] = useState<Record<string, boolean>>({})
  const [previewModal, setPreviewModal] = useState<'md' | 'html' | 'json' | null>(null)

  // ==========================================================
  // FILTRADO
  // ==========================================================
  const filteredData = (parsedData || []).filter(host => {
    if (filterUp && host.status !== 'up') return false

    if (filterVuln) {
      const isVuln = (host.ports || []).some(p => detectCVEs(p.service, p.version).length > 0)
      if (!isVuln) return false
    }

    if (filterWeb) {
      const hasWeb = (host.ports || []).some(p => ['80', '443', '8080', '8443'].includes(p.portid) && p.state === 'open')
      if (!hasWeb) return false
    }

    if (filterOS !== 'all') {
       const osL = (host.os || '').toLowerCase();
       if (filterOS === 'windows' && !osL.includes('win')) return false;
       if (filterOS === 'linux' && !osL.includes('linux')) return false;
    }

    if (filterCritPorts) {
        const hasCrit = (host.ports || []).some(p => ['21', '22', '23', '445', '3389'].includes(p.portid) && p.state === 'open')
        if (!hasCrit) return false
    }

    if (!search) return true
    const q = search.toLowerCase()
    if (q.includes('port:')) return (host.ports || []).some(p => p.portid === q.match(/port:(\d+)/)?.[1])
    return (
      host.ip.includes(q) ||
      (host.hostname && host.hostname.toLowerCase().includes(q)) ||
      (host.alias && host.alias.toLowerCase().includes(q)) ||
      (host.ports || []).some(p => (p.service || '').toLowerCase().includes(q))
    )
  })

  // ==========================================================
  // MÉTRICAS
  // ==========================================================
  const { upHosts, portChartData, osChartData, sevMetrics, topServicesData } = useMemo(() => {
    let open = 0
    let filtered = 0
    let closed = 0
    let crit = 0
    let high = 0
    let med = 0
    const osMap: Record<string, number> = {}
    const srvMap: Record<string, number> = {}

    ;(parsedData || []).forEach(h => {
      const osName = h.os ? h.os.split(' ')[0] : 'Unknown'
      osMap[osName] = (osMap[osName] || 0) + 1
      ;(h.ports || []).forEach(p => {
        if (p.state === 'open') {
          open++
          const cves = detectCVEs(p.service, p.version)
          cves.forEach(c => {
            if (c.severity === 'critical') crit++
            else if (c.severity === 'high') high++
            else med++
          })
          const srv = p.service || 'unknown'
          srvMap[srv] = (srvMap[srv] || 0) + 1
        } else if (p.state === 'filtered') filtered++
        else closed++
      })
    })

    const topServices = Object.entries(srvMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return {
      upHosts: (parsedData || []).filter(h => h.status === 'up').length,
      sevMetrics: { crit, high, med, total: crit + high + med },
      portChartData: [
        { name: 'Abiertos', value: open },
        { name: 'Filtrados', value: filtered },
        { name: 'Cerrados', value: closed },
      ].filter(d => d.value > 0),
      osChartData: Object.entries(osMap).map(([name, value]) => ({ name, value })),
      topServicesData: topServices,
    }
  }, [parsedData])

  // ==========================================================
  // IMPRESIÓN SEGURA — vía iframe aislado
  // ----------------------------------------------------------
  // En lugar de imprimir el DOM de la app (que contiene
  // dangerouslySetInnerHTML), generamos el HTML, lo metemos
  // en un <iframe sandbox> sin allow-scripts, y disparamos
  // print() sobre él. Así:
  //   - Nada se ejecuta en el contexto de la app.
  //   - El usuario ve exactamente el reporte.
  // ==========================================================
  const handlePrint = () => {
    // Expandir todo antes de generar
    const allPorts: Record<string, boolean> = {}
    const allHosts: Record<string, boolean> = {}
    filteredData.forEach(h => {
      if (h.scripts?.length) allHosts[h.ip] = true
      h.ports?.forEach(p => {
        if (p.scripts?.length) allPorts[`${h.ip}-${p.portid}`] = true
      })
    })
    setExpandedHosts(allHosts)
    setExpandedPorts(allPorts)

    setTimeout(() => {
      const html = generateHTML()

      const iframe = document.createElement('iframe')
      iframe.style.position = 'fixed'
      iframe.style.right = '0'
      iframe.style.bottom = '0'
      iframe.style.width = '0'
      iframe.style.height = '0'
      iframe.style.border = '0'
      iframe.setAttribute('sandbox', '')
      iframe.srcdoc = html

      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus()
          iframe.contentWindow?.print()
        } catch (err) {
          console.error('Error al imprimir:', err)
        } finally {
          setTimeout(() => {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
          }, 60_000)
        }
      }

      document.body.appendChild(iframe)
    }, 300)
  }

  // ==========================================================
  // MARKDOWN SEGURO
  // ==========================================================
  const generateMarkdown = () => {
    let md = `# LESSSO C2 Security Report\n`
    md += `**Objetivo Escaneado:** \`${escapeMdInline(target)}\`\n`
    md += `**Comando Ejecutado:** \`${escapeMdInline(commandString)}\`\n`
    md += `**Fecha:** ${new Date().toLocaleString()}\n`
    md += `**Duración:** ${escapeMdInline(scanDuration)}\n\n`

    filteredData.forEach(host => {
      md += `## Host: \`${escapeMdInline(host.ip)}\` (${escapeMdInline(host.status.toUpperCase())})\n`
      if (host.hostname) md += `- **DNS:** ${escapeMdInline(host.hostname)}\n`
      if (host.mac) md += `- **MAC:** ${escapeMdInline(host.mac)}\n`
      if (host.os) md += `- **SO:** ${escapeMdInline(host.os)}\n\n`

      if (host.ports && host.ports.length > 0) {
        md += `### Puertos Descubiertos\n`
        md += `| Puerto | Estado | Razón | Servicio | Versión | Info Extra |\n`
        md += `|---|---|---|---|---|---|\n`
        host.ports.forEach(p => {
          md += `| ${escapeMdCell(p.portid)}/${escapeMdCell(p.protocol)} | ${escapeMdCell(p.state)} | ${escapeMdCell(p.reason)} | ${escapeMdCell(p.service || '-')} | ${escapeMdCell(p.version || '-')} | ${p.scripts && p.scripts.length > 0 ? p.scripts.length + ' scripts' : '-'} |\n`
        })

        const portsWithScripts = host.ports.filter(p => p.scripts && p.scripts.length > 0)
        if (portsWithScripts.length > 0) {
          md += `\n### Detalles de Scripts de Puertos\n`
          portsWithScripts.forEach(p => {
            md += `#### Puerto ${escapeMdInline(p.portid)}/${escapeMdInline(p.protocol)}\n`
            p.scripts!.forEach(s => {
              md += `- **${escapeMdInline(s.id)}**:\n\`\`\`\n${escapeMdCode(s.output)}\n\`\`\`\n`
            })
          })
        }
      } else {
        md += `\n*Sin puertos abiertos detectados.*\n`
      }

      if (host.scripts && host.scripts.length > 0) {
        md += `\n### Host Script Output\n`
        host.scripts.forEach(s => {
          md += `- **${escapeMdInline(s.id)}**:\n\`\`\`\n${escapeMdCode(s.output)}\n\`\`\`\n`
        })
      }
      md += `\n---\n`
    })

    if (vaultCredentials.length > 0) {
      md += `\n## 🔐 Bóveda de Credenciales\n| Target | Tipo | Usuario | Secreto |\n|---|---|---|---|\n`
      vaultCredentials.forEach(c => {
        md += `| ${escapeMdCell(c.target)} | ${escapeMdCell(c.type.toUpperCase())} | ${escapeMdCell(c.username || '-')} | \`${escapeMdInline(c.secret)}\` |\n`
      })
    }

    if (redTeamNotes) {
      md += `\n## 📝 Bitácora de Auditoría\n\`\`\`text\n${escapeMdCode(redTeamNotes)}\n\`\`\`\n`
    }

    return md
  }

  // ==========================================================
  // HTML SEGURO — todo escapado
  // ==========================================================
  const generateHTML = () => {
    let html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>LESSSO C2 Report</title>
    <style>
      body{font-family:system-ui,-apple-system,sans-serif;background-color:#f1f5f9;color:#0f172a;margin:0;padding:20px}
      .container{max-width:1200px;margin:0 auto;}
      .header-card{background:white;padding:25px;border-radius:12px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1); border-top: 5px solid #0b282c; margin-bottom: 30px;}
      h1{color:#0b282c;margin-top:0;font-size:1.8rem; font-weight:900;}
      .meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:15px;margin-top:20px;}
      .meta-item{background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0;}
      .meta-label{font-size:0.75rem;text-transform:uppercase;color:#64748b;font-weight:bold;margin-bottom:4px;display:block;}
      .meta-value{font-size:0.95rem;font-weight:600;font-family:monospace;color:#334155;word-break:break-all;}
      .host-card{background:white;border-radius:12px;box-shadow:0 2px 4px rgba(0,0,0,0.05);border:1px solid #cbd5e1;overflow:hidden;margin-bottom:30px;page-break-inside:avoid;}
      .host-header{background:#f8fafc;padding:15px 20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;}
      .host-title{font-size:1.4rem;font-weight:900;color:#0b282c; display:flex; align-items:center; gap: 10px;}
      .badge{padding:4px 10px;border-radius:9999px;font-size:0.75rem;font-weight:bold;text-transform:uppercase;}
      .bg-green{background:#dcfce7;color:#166534;border:1px solid #22c55e;}
      .bg-red{background:#fee2e2;color:#991b1b;border:1px solid #ef4444;}
      .table-container{width:100%;overflow-x:auto;}
      table{width:100%;border-collapse:collapse;text-align:left;font-size:0.85rem;}
      th,td{padding:10px 15px;border-bottom:1px solid #e2e8f0;vertical-align:top;word-break:break-word;}
      th{background:#f1f5f9;text-transform:uppercase;font-size:0.7rem;color:#64748b;font-weight:bold;letter-spacing:0.05em;}
      .port-row:hover{background-color:#f8fafc;}
      .port-open{color:#059669;font-weight:900;}
      .port-other{color:#d97706;font-weight:bold;}
      .script-block{background:#0b1120;color:#10b981;padding:12px;border-radius:6px;font-family:monospace;font-size:0.8rem;white-space:pre-wrap;margin-top:6px;border-left:3px solid #0b282c;}
      .script-title{color:#5eead4;font-weight:bold;margin-bottom:4px;display:block;}
      .section-title{background:#ccfbf1;color:#0f766e;padding:8px 15px;font-size:0.85rem;font-weight:bold;text-transform:uppercase;}
    </style></head><body><div class="container">

    <div class="header-card">
      <h1>LESSSO C2 Security Report</h1>
      <div class="meta-grid">
        <div class="meta-item"><span class="meta-label">Objetivo</span><span class="meta-value">${escapeHtml(target) || 'N/A'}</span></div>
        <div class="meta-item"><span class="meta-label">Fecha Ejecución</span><span class="meta-value">${escapeHtml(new Date().toLocaleString())}</span></div>
        <div class="meta-item"><span class="meta-label">Duración</span><span class="meta-value">${escapeHtml(scanDuration)}</span></div>
        <div class="meta-item" style="grid-column: 1 / -1;"><span class="meta-label">Comando Exacto</span><span class="meta-value">${escapeHtml(commandString)}</span></div>
      </div>
    </div>`

    filteredData.forEach(host => {
      const statusClass = host.status === 'up' ? 'bg-green' : 'bg-red'
      const hostnameBlock = host.hostname
        ? `<span style="font-size:0.9rem;color:#64748b;font-weight:normal;background:#e2e8f0;padding:2px 8px;border-radius:4px;">${escapeHtml(host.hostname)}</span>`
        : ''

      html += `<div class="host-card">
        <div class="host-header">
          <div class="host-title">${escapeHtml(host.ip)} ${hostnameBlock}</div>
          <div><span class="badge ${statusClass}">${escapeHtml(host.status)}</span></div>
        </div>
        <div style="padding:15px 20px; font-size:0.85rem; color:#475569; border-bottom:1px solid #e2e8f0; display:flex; gap: 20px; flex-wrap:wrap;">
          <div><strong>OS:</strong> ${escapeHtml(host.os) || 'Desconocido'}</div>
          <div><strong>MAC:</strong> ${escapeHtml(host.mac) || '-'}</div>
        </div>`

      if (host.ports && host.ports.length > 0) {
        html += `<div class="section-title">Puertos Descubiertos</div>
        <div class="table-container"><table><thead><tr><th>Puerto</th><th>Estado / Razón</th><th>Servicio</th><th>Versión / Producto</th><th>Scripts Extra</th></tr></thead><tbody>`

        host.ports.forEach(p => {
          const hasScripts = p.scripts && p.scripts.length > 0
          let scriptsHtml = ''
          if (hasScripts) {
            p.scripts!.forEach(s => {
              scriptsHtml += `<div class="script-block"><span class="script-title">↳ ${escapeHtml(s.id)}</span>${escapeHtml(s.output)}</div>`
            })
          }

          html += `<tr class="port-row">
            <td><strong>${escapeHtml(p.portid)}/${escapeHtml(p.protocol)}</strong></td>
            <td><div class="${p.state === 'open' ? 'port-open' : 'port-other'}">${escapeHtml(p.state.toUpperCase())}</div><div style="font-size:0.7rem;color:#94a3b8;">${escapeHtml(p.reason)}</div></td>
            <td><strong>${escapeHtml(p.service) || '-'}</strong></td>
            <td>${escapeHtml(p.version) || '-'}</td>
            <td>${hasScripts ? scriptsHtml : '<span style="color:#cbd5e1">-</span>'}</td>
          </tr>`
        })
        html += `</tbody></table></div>`
      } else {
        html += `<div style="padding:20px; color:#64748b; font-style:italic;">Sin puertos abiertos detectados.</div>`
      }

      if (host.scripts && host.scripts.length > 0) {
        html += `<div class="section-title" style="background:#fce7f3;color:#be185d;">Host Script Output</div>
        <div class="table-container"><table><thead><tr><th style="width:20%;">Script Name</th><th>Output</th></tr></thead><tbody>`
        host.scripts.forEach(s => {
          html += `<tr><td><strong>${escapeHtml(s.id)}</strong></td><td><div class="script-block" style="margin-top:0;">${escapeHtml(s.output)}</div></td></tr>`
        })
        html += `</tbody></table></div>`
      }
      html += `</div>`
    })

    if (vaultCredentials.length > 0) {
      html += `<div class="host-card" style="border-color:#10b981;">
        <div class="host-header" style="background:#ecfdf5;"><div class="host-title" style="color:#047857;">🔐 Bóveda de Credenciales</div></div>
        <div class="table-container"><table><thead><tr><th>Target</th><th>Tipo</th><th>Usuario</th><th>Secreto</th></tr></thead><tbody>`
      vaultCredentials.forEach(c => {
        html += `<tr><td><strong>${escapeHtml(c.target)}</strong></td><td><span class="badge" style="background:#e2e8f0;color:#334155;">${escapeHtml(c.type)}</span></td><td>${escapeHtml(c.username) || '-'}</td><td><code style="color:#059669;background:#d1fae5;padding:2px 6px;border-radius:4px;">${escapeHtml(c.secret)}</code></td></tr>`
      })
      html += `</tbody></table></div></div>`
    }

    if (redTeamNotes) {
      html += `<div class="host-card" style="border-color:#f59e0b;">
        <div class="host-header" style="background:#fffbeb;"><div class="host-title" style="color:#b45309;">📝 Bitácora de Auditoría</div></div>
        <div style="padding:20px; white-space: pre-wrap; font-family: monospace; font-size: 0.9rem; color: #334155;">${escapeHtml(redTeamNotes)}</div>
      </div>`
    }

    html += `</div></body></html>`
    return html
  }

  // ==========================================================
  // GUARDAR / IMPORTAR
  // ==========================================================
  const handleSaveFile = async (type: 'md' | 'html' | 'json', content: string) => {
    try {
      const extension = type === 'md' ? 'md' : type === 'html' ? 'html' : 'json'
      const filePath = await save({
        defaultPath: `lessso_c2_report_${Date.now()}.${extension}`,
        filters: [{ name: 'Documento', extensions: [extension] }],
      })
      if (filePath) {
        await writeTextFile(filePath, content)
        alert(`Guardado en:\n${filePath}`)
      }
    } catch (e: any) {
      alert(`Error al guardar:\n${e.message || e}`)
    }
  }

  const handleImport = async () => {
    try {
      const selected = await open({ filters: [{ name: 'JSON Workspace', extensions: ['json'] }] })
      if (selected && !Array.isArray(selected)) {
        const contents = await readTextFile(selected)
        importWorkspace(JSON.parse(contents))
      }
    } catch (err: any) {
      alert(`Error al cargar archivo:\n${err.message || err}`)
    }
  }

  const togglePortExpand = (id: string) => setExpandedPorts(prev => ({ ...prev, [id]: !prev[id] }))
  const toggleHostExpand = (id: string) => setExpandedHosts(prev => ({ ...prev, [id]: !prev[id] }))

  const paginatedData = filteredData.slice(0, visibleCount)

  // ==========================================================
  // ESTADOS VACÍOS
  // ==========================================================
  if (isScanning && (!parsedData || parsedData.length === 0)) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl p-12 text-center shadow-sm">
        <h3 className="text-slate-900 dark:text-white animate-pulse font-bold">Estructurando Base de Datos de Nmap...</h3>
      </div>
    )
  }

  if (!parsedData || parsedData.length === 0) {
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
    )
  }

  const pyClass = compactMode ? 'py-1' : 'py-2'

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

      {/* MÉTRICAS */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 shrink-0 print:hidden">
        <div className="flex flex-col justify-center space-y-2 col-span-2">
          <div className="bg-slate-100 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-200 dark:border-slate-700 flex justify-between items-center">
            <span className="block text-[9px] font-bold text-slate-500 uppercase">Hosts Activos</span>
            <span className="text-lg font-black text-slate-900 dark:text-white">{upHosts}/{parsedData.length}</span>
          </div>

          <div className={`p-2 rounded-lg border flex flex-col justify-center ${sevMetrics.total > 0 ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/50' : 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/50'}`}>
            <div className="flex justify-between items-center mb-1">
              <span className={`text-[9px] font-bold uppercase ${sevMetrics.total > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>CVEs Detectados</span>
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

        {/* FIX M6 COMPLETO: RECHARTS CON SINTAXIS REACT LIMPIA */}
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center">
          <span className="text-[9px] font-bold text-slate-500 uppercase">Estado Puertos</span>
          <div className="h-16 w-full mt-1">
            <ResponsiveContainer width="100%" height="100%">
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
            <ResponsiveContainer width="100%" height="100%">
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
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topServicesData}>
                <XAxis dataKey="name" hide />
                <RechartsTooltip cursor={{ fill: 'transparent' }} contentStyle={{ background: theme === 'dark' ? '#1e293b' : '#fff', border: 'none', borderRadius: '6px', fontSize: '10px' }} />
                <Bar dataKey="count" fill="#0b282c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="flex flex-col gap-1 justify-center p-2 rounded-lg border border-slate-200 dark:border-slate-700 overflow-y-auto custom-scrollbar">
          <button onClick={() => setPreviewModal('json')} className="w-full text-[9px] font-bold uppercase bg-slate-800 dark:bg-slate-700 text-white py-1.5 rounded hover:bg-slate-700 shadow-sm transition-colors">Exportar JSON</button>
          <div className="flex gap-1 w-full">
            <button onClick={() => setPreviewModal('md')} className="flex-1 text-[9px] font-bold uppercase bg-teal-600 text-white py-1.5 rounded hover:bg-teal-500 shadow-sm transition-colors">.MD</button>
            <button onClick={() => setPreviewModal('html')} className="flex-1 text-[9px] font-bold uppercase bg-[#0b282c] text-white py-1.5 rounded hover:bg-[#081e21] shadow-sm transition-colors">.HTML</button>
          </div>
          <button onClick={handlePrint} className="w-full text-[9px] font-bold uppercase border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 shadow-sm transition-colors">Imprimir PDF</button>
          <button onClick={clearHistory} className="w-full text-[9px] font-bold uppercase border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 py-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 shadow-sm transition-colors mt-1">Borrar Datos</button>
        </div>
      </div>

      {/* BUSCADOR Y FILTROS */}
      <div className="flex flex-col sm:flex-row gap-3 shrink-0 print:hidden justify-between items-center bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setVisibleCount(20) }}
          placeholder="Buscar IP, puerto:22, os:linux..."
          className="flex-1 px-3 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-[11px] outline-none dark:text-white"
        />

        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => { setFilterUp(!filterUp); setVisibleCount(20) }} className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-colors border ${filterUp ? 'bg-[#0b282c] border-[#0b282c] text-white shadow-sm' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>🟢 Activos</button>
          <button onClick={() => { setFilterWeb(!filterWeb); setVisibleCount(20) }} className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-colors border ${filterWeb ? 'bg-[#0b282c] border-[#0b282c] text-white shadow-sm' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>🌐 Web</button>
          <button onClick={() => { setFilterVuln(!filterVuln); setVisibleCount(20) }} className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-colors border ${filterVuln ? 'bg-red-600 border-red-600 text-white shadow-sm' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>🚨 CVEs</button>

          <div className="h-6 w-px bg-slate-300 dark:bg-slate-600 mx-1"></div>

          <select value={filterOS} onChange={(e) => {setFilterOS(e.target.value as any); setVisibleCount(20)}} className="px-2 py-1 text-[10px] font-bold uppercase rounded-full border border-slate-200 dark:border-slate-700 bg-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 outline-none">
              <option value="all">🖥 OS: Todos</option>
              <option value="windows">🪟 OS: Windows</option>
              <option value="linux">🐧 OS: Linux</option>
          </select>

          <button onClick={() => { setFilterCritPorts(!filterCritPorts); setVisibleCount(20) }} className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-colors border ${filterCritPorts ? 'bg-orange-600 border-orange-600 text-white shadow-sm' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>🔥 Pts Críticos</button>

          <button onClick={toggleCompactMode} className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase transition-colors border ${compactMode ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 shadow-sm' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>≡ Comp</button>
          <label className={`flex items-center space-x-1.5 cursor-pointer px-3 py-1 rounded-full border transition-colors ${historyData.length > 0 ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 hover:bg-teal-100' : 'opacity-50 border-slate-200'}`}>
            <input type="checkbox" checked={showDiff} disabled={historyData.length === 0} onChange={() => setShowDiff(!showDiff)} className="rounded w-3 h-3 accent-[#0b282c]" />
            <span className="text-[10px] font-bold uppercase text-teal-700 dark:text-teal-400">Diff</span>
          </label>
        </div>
      </div>

      {/* LISTA DE HOSTS */}
      <div className="flex-1 overflow-visible space-y-4 pb-8 print:block print:space-y-6">
        <div className="hidden print:block mb-8 border-b-2 border-[#0b282c] pb-4 print-force-colors">
          <h1 className="text-3xl font-black text-[#0b282c] uppercase tracking-widest font-['Poppins']">LESSSO C2 Report</h1>
          <p className="text-sm font-bold text-slate-500 mt-2">Objetivo: {target} | Fecha: {new Date().toLocaleString()}</p>
        </div>

        {paginatedData.map((host, idx) => {
          const { score, grade, color, vulns } = calculateScore(host)
          const hasHostScripts = host.scripts && host.scripts.length > 0
          const hostExpanded = expandedHosts[host.ip]

          let osIcon = '💻'
          if (host.os.toLowerCase().includes('win')) osIcon = '🪟'
          if (host.os.toLowerCase().includes('linux')) osIcon = '🐧'
          if (host.os.toLowerCase().includes('mac') || host.os.toLowerCase().includes('apple')) osIcon = '🍎'

          return (
            <div key={`${host.ip}-${idx}`} className={`print-page-break print-force-colors bg-white dark:bg-slate-800 rounded-lg shadow-sm border ${vulns > 0 ? 'border-red-300 dark:border-red-900/50 print:border-slate-300' : 'border-slate-200 dark:border-slate-700 print:border-slate-300'} overflow-hidden flex flex-col print:shadow-none print:bg-white print:text-black`}>

              <div className="bg-slate-50 dark:bg-slate-900/50 px-4 py-2 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center print:bg-white print:border-slate-300">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-[13px] font-black text-[#0b282c] dark:text-white print:text-black flex items-center gap-1">{osIcon} {host.ip}</h2>
                    {host.hostname && <span className="text-[9px] font-bold text-slate-500 bg-slate-200 dark:bg-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 print:bg-slate-100 print:text-slate-800">{host.hostname}</span>}
                  </div>
                  <div className="flex gap-1.5 items-center mt-0.5">
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${host.status === 'up' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'} print:border print:bg-slate-100 print:text-black`}>{host.status}</span>
                    <span title={`Score: ${score}/100`} className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${color} print:bg-slate-100 print:text-black print:border`}>Sec Grade: {grade}</span>

                    {hasHostScripts && (
                      <button onClick={() => toggleHostExpand(host.ip)} className="ml-2 px-1.5 py-0.5 bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 text-[9px] font-bold uppercase rounded-md border border-teal-300 dark:border-teal-800/50 hover:bg-teal-200 flex items-center gap-1 transition-colors print:hidden">
                        {hostExpanded ? 'Ocultar Info Extra' : `[+] ${host.scripts!.length} Scripts de Host`}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {hostExpanded && hasHostScripts && (
                <div className="bg-[#0b1120] border-b border-slate-700 p-3 overflow-x-auto custom-scrollbar shadow-inner print:bg-slate-50 print:border-slate-300 print:shadow-none print:break-inside-avoid">
                  {host.scripts?.map((s, idx) => (
                    <div key={idx} className="mb-2 last:mb-0">
                      <span className="text-[10px] font-black uppercase text-teal-400 border-b border-teal-900 block mb-1 print:text-teal-700 print:border-teal-300">↳ {s.id}</span>
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
                      host.ports.map((port) => {
                        const cvList = detectCVEs(port.service, port.version)
                        const ianaDesc = IANA_PORTS[port.portid]
                        const pastHost = historyData.find(h => h.ip === host.ip)
                        const isNewPort = showDiff && pastHost && !(pastHost.ports || []).some(p => p.portid === port.portid)

                        const portKey = `${host.ip}-${port.portid}`
                        const hasScripts = port.scripts && port.scripts.length > 0
                        const isExpanded = expandedPorts[portKey]

                        return (
                          <Fragment key={portKey}>
                            <tr className={`border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50/50 dark:hover:bg-slate-700/20 transition-colors ${isNewPort ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''} print:border-slate-200 print:break-inside-avoid`}>
                              <td className={`px-3 ${pyClass} font-bold text-slate-900 dark:text-slate-200 print:text-black flex items-center gap-1`}>
                                {hasScripts && <button onClick={() => togglePortExpand(portKey)} className="text-[9px] w-4 h-4 flex items-center justify-center bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-400 font-black rounded hover:bg-teal-500 hover:text-white transition-colors print:hidden">{isExpanded ? '-' : '+'}</button>}
                                {port.portid}/{port.protocol}{isNewPort && <span className="ml-1 bg-emerald-500 text-white text-[8px] px-1 py-0.5 rounded-sm">NUEVO</span>}
                              </td>
                              <td className={`px-3 ${pyClass}`}><span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase w-fit ${port.state === 'open' ? 'text-emerald-600 dark:text-emerald-400 print:text-emerald-700' : 'text-orange-500 dark:text-orange-400 print:text-orange-600'}`}>{port.state}</span></td>
                              <td className={`px-3 ${pyClass} font-medium text-slate-700 dark:text-slate-300 print:text-slate-800 flex flex-col`}><span>{port.service || '-'}</span>{ianaDesc && !compactMode && <span className="text-[8px] text-[#0b282c] dark:text-teal-400">{ianaDesc}</span>}</td>
                              <td className={`px-3 ${pyClass} text-slate-500 dark:text-slate-400 print:text-slate-600`}>{port.version || '-'}</td>
                              <td className={`px-3 ${pyClass} flex justify-end gap-1.5`}>
                                {cvList.length > 0 ? (
                                  <div className="flex flex-col gap-1">
                                    {cvList.map((v, i) => <span key={i} className={`text-white text-[9px] px-1.5 py-0.5 rounded font-bold w-fit print:border ${v.severity === 'critical' ? 'bg-red-600 print:border-red-600' : 'bg-orange-500 print:border-orange-500'}`}>{compactMode ? '⚠' : v.id}</span>)}
                                  </div>
                                ) : !compactMode && <span className="text-[9px] text-slate-400 print:text-slate-500">Ok</span>}
                              </td>
                            </tr>

                            {isExpanded && hasScripts && (
                              <tr className="bg-slate-100 dark:bg-slate-900/50 print:bg-slate-50 print:break-inside-avoid">
                                <td colSpan={5} className="p-0 border-b border-slate-200 dark:border-slate-800 print:border-slate-300">
                                  <div className="p-3 m-2 bg-[#0b1120] rounded-lg shadow-inner overflow-x-auto custom-scrollbar print:bg-transparent print:shadow-none print:border print:border-slate-200">
                                    {port.scripts?.map((s, sidx) => (
                                      <div key={sidx} className="mb-2 last:mb-0">
                                        <span className="text-[10px] font-black uppercase text-teal-400 border-b border-teal-900 block mb-1 print:text-teal-700 print:border-teal-300">↳ {s.id}</span>
                                        <pre className="text-[10px] font-mono text-emerald-400 whitespace-pre-wrap leading-relaxed print:text-slate-800">{s.output}</pre>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}

        {/* IMPRESIÓN: BÓVEDA + NOTAS (solo print) */}
        <div className="hidden print:block mt-8 print-page-break print-force-colors">
          {vaultCredentials.length > 0 && (
            <div className="border border-[#0b282c] rounded-lg overflow-hidden mb-6">
              <div className="bg-[#0b282c]/10 px-4 py-2 border-b border-[#0b282c]">
                <h2 className="text-[13px] font-black text-[#0b282c]">🔐 Bóveda de Credenciales</h2>
              </div>
              <table className="w-full text-[11px] text-left text-black">
                <thead className="text-[9px] uppercase bg-slate-100 border-b border-slate-300">
                  <tr><th className="px-3 py-1.5">Target</th><th className="px-3 py-1.5">Tipo</th><th className="px-3 py-1.5">Usuario</th><th className="px-3 py-1.5">Secreto</th></tr>
                </thead>
                <tbody>
                  {vaultCredentials.map(c => (
                    <tr key={c.id} className="border-b border-slate-200">
                      <td className="px-3 py-2 font-bold">{c.target}</td>
                      <td className="px-3 py-2"><span className="bg-slate-200 px-1 py-0.5 rounded">{c.type}</span></td>
                      <td className="px-3 py-2">{c.username || '-'}</td>
                      <td className="px-3 py-2 font-mono text-[#0b282c] bg-[#0b282c]/10 px-1">{c.secret}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {redTeamNotes && (
            <div className="border border-orange-300 rounded-lg overflow-hidden">
              <div className="bg-orange-50 px-4 py-2 border-b border-orange-300">
                <h2 className="text-[13px] font-black text-orange-800">📝 Bitácora de Auditoría</h2>
              </div>
              <pre className="p-4 text-[11px] text-slate-800 whitespace-pre-wrap font-mono">{redTeamNotes}</pre>
            </div>
          )}
        </div>

        {visibleCount < filteredData.length && (
          <div className="flex justify-center mt-3 print:hidden">
            <button
              onClick={() => setVisibleCount(v => v + 50)}
              className="px-4 py-1.5 bg-[#0b282c]/10 text-[#0b282c] dark:bg-[#0b282c]/50 dark:text-teal-400 text-[10px] font-bold uppercase rounded shadow-sm hover:bg-[#0b282c]/20 transition-colors"
            >
              Cargar más hosts ({filteredData.length - visibleCount} ocultos)
            </button>
          </div>
        )}
      </div>

      {/* MODAL DE VISTA PREVIA */}
      {previewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-[80vh] rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center px-4 py-3 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-xs font-bold uppercase text-slate-800 dark:text-slate-200">Vista Previa: {previewModal.toUpperCase()}</h3>
              <button onClick={() => setPreviewModal(null)} className="text-slate-400 hover:text-red-500 font-bold">✕ Cerrar</button>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-slate-100 dark:bg-slate-950">
              {previewModal === 'json' && (
                <pre className="text-[11px] font-mono text-[#0b282c] dark:text-teal-400">
                  {JSON.stringify(filteredData, null, 2)}
                </pre>
              )}
              {previewModal === 'md' && (
                <pre className="text-[11px] font-mono text-slate-700 dark:text-slate-300">
                  {generateMarkdown()}
                </pre>
              )}
              {previewModal === 'html' && (
                // ======================================================
                // SEGURIDAD: sandbox SIN allow-scripts.
                // Cualquier <script> inyectado no se ejecuta.
                // Además escapamos todo el HTML antes de meterlo aquí.
                // ======================================================
                <iframe
                  title="Preview HTML"
                  sandbox=""
                  srcDoc={generateHTML()}
                  className="w-full h-full bg-white rounded shadow-sm border-0"
                />
              )}
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
              <button onClick={() => setPreviewModal(null)} className="px-4 py-1.5 rounded text-xs font-bold text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700">Cancelar</button>
              <button
                onClick={() => handleSaveFile(previewModal, previewModal === 'json' ? JSON.stringify(filteredData, null, 2) : previewModal === 'md' ? generateMarkdown() : generateHTML())}
                className="px-4 py-1.5 bg-[#0b282c] text-white rounded text-xs font-bold shadow hover:bg-[#081e21]"
              >
                Guardar Archivo {previewModal.toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
