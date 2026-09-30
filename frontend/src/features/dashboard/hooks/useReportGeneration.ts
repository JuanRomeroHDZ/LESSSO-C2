import { useCallback } from 'react'
import { save, open } from '@tauri-apps/plugin-dialog'
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs'
import type { HostInfo, VaultCred } from '../../../core/store/useScanStore'
import { escapeMdInline, escapeMdCell, escapeMdCode, escapeHtml } from '../utils/escape'

export function useReportGeneration(
  target: string, 
  commandString: string, 
  scanDuration: string, 
  filteredData: HostInfo[],
  vaultCredentials: VaultCred[],
  redTeamNotes: string,
  importWorkspace: (data: HostInfo[]) => void,
  includeCredsInExport: boolean,
  setExpandedHosts: (hosts: Record<string, boolean>) => void,
  setExpandedPorts: (ports: Record<string, boolean>) => void
) {

  const generateMarkdown = useCallback(() => {
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

    if (includeCredsInExport && vaultCredentials.length > 0) {
      md += `\n## 🔐 Bóveda de Credenciales\n| Target | Tipo | Usuario | Secreto |\n|---|---|---|---|\n`
      vaultCredentials.forEach(c => {
        md += `| ${escapeMdCell(c.target)} | ${escapeMdCell(c.type.toUpperCase())} | ${escapeMdCell(c.username || '-')} | \`${escapeMdInline(c.secret)}\` |\n`
      })
    }

    if (redTeamNotes) {
      md += `\n## 📝 Bitácora de Auditoría\n\`\`\`text\n${escapeMdCode(redTeamNotes)}\n\`\`\`\n`
    }

    return md
  }, [target, commandString, scanDuration, filteredData, vaultCredentials, redTeamNotes, includeCredsInExport]);

  const generateHTML = useCallback(() => {
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

    if (includeCredsInExport && vaultCredentials.length > 0) {
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
  }, [target, commandString, scanDuration, filteredData, vaultCredentials, redTeamNotes, includeCredsInExport]);

  const handlePrint = useCallback(() => {
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
  }, [filteredData, generateHTML, setExpandedHosts, setExpandedPorts]);

  const handleSaveFile = async (type: 'md' | 'html' | 'json') => {
    try {
      const extension = type === 'md' ? 'md' : type === 'html' ? 'html' : 'json'
      const content = type === 'json' ? JSON.stringify(filteredData, null, 2) : type === 'md' ? generateMarkdown() : generateHTML();
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

  return {
    generateMarkdown,
    generateHTML,
    handlePrint,
    handleSaveFile,
    handleImport
  }
}
