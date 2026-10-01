import { useCallback } from 'react'
import { save, open } from '@tauri-apps/plugin-dialog'
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs'
import type { HostInfo, VaultCred, PortInfo } from '../../../core/store/useScanStore'
import type { CveMatch, Severity } from '../utils/cve'
import { detectCVEs } from '../utils/cve'
import {
  escapeMdInline,
  escapeMdCell,
  escapeMdCode,
  escapeHtml,
} from '../utils/escape'

// ==========================================================
// HELPERS DE CVEs
// ==========================================================
const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  unknown: 0,
}

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'CRÍTICO',
  high: 'ALTO',
  medium: 'MEDIO',
  low: 'BAJO',
  unknown: 'DESCONOCIDO',
}

const SEVERITY_HTML_CLASS: Record<Severity, string> = {
  critical: 'sev-critical',
  high: 'sev-high',
  medium: 'sev-medium',
  low: 'sev-low',
  unknown: 'sev-unknown',
}

interface HostCveSummary {
  total: number
  crit: number
  high: number
  med: number
  low: number
  unknown: number
  cves: CveMatch[]
}

interface PortWithCves {
  port: PortInfo
  cves: CveMatch[]
}

/**
 * Extrae los CVEs de un puerto, prefiriendo los enriquecidos del
 * backend y cayendo al matching local si no hay.
 */
function collectPortCves(port: PortInfo): CveMatch[] {
  const real = port.cves || []
  if (real.length > 0) return real
  return detectCVEs(port.service, port.version, port.cpe)
}

/**
 * Devuelve los CVEs de un host, deduplicados por id y ordenados
 * por severidad descendente.
 */
function collectHostCves(host: HostInfo): HostCveSummary {
  const all: CveMatch[] = []
  for (const port of host.ports || []) {
    all.push(...collectPortCves(port))
  }
  const byId = new Map<string, CveMatch>()
  for (const c of all) {
    const prev = byId.get(c.id)
    if (!prev || (SEVERITY_ORDER[c.severity] ?? 0) > (SEVERITY_ORDER[prev.severity] ?? 0)) {
      byId.set(c.id, c)
    }
  }
  const cves = Array.from(byId.values()).sort(
    (a, b) =>
      (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0) ||
      (b.cvss ?? 0) - (a.cvss ?? 0),
  )
  const summary: HostCveSummary = {
    total: cves.length,
    crit: 0,
    high: 0,
    med: 0,
    low: 0,
    unknown: 0,
    cves,
  }
  for (const c of cves) {
    if (c.severity === 'critical') summary.crit++
    else if (c.severity === 'high') summary.high++
    else if (c.severity === 'medium') summary.med++
    else if (c.severity === 'low') summary.low++
    else summary.unknown++
  }
  return summary
}

/**
 * Devuelve el resumen global (todos los hosts).
 */
function collectGlobalCves(hosts: HostInfo[]): HostCveSummary {
  const all: CveMatch[] = []
  for (const h of hosts) all.push(...collectHostCves(h).cves)
  const byId = new Map<string, CveMatch>()
  for (const c of all) {
    const prev = byId.get(c.id)
    if (!prev || (SEVERITY_ORDER[c.severity] ?? 0) > (SEVERITY_ORDER[prev.severity] ?? 0)) {
      byId.set(c.id, c)
    }
  }
  const cves = Array.from(byId.values()).sort(
    (a, b) =>
      (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0) ||
      (b.cvss ?? 0) - (a.cvss ?? 0),
  )
  const summary: HostCveSummary = {
    total: cves.length,
    crit: 0,
    high: 0,
    med: 0,
    low: 0,
    unknown: 0,
    cves,
  }
  for (const c of cves) {
    if (c.severity === 'critical') summary.crit++
    else if (c.severity === 'high') summary.high++
    else if (c.severity === 'medium') summary.med++
    else if (c.severity === 'low') summary.low++
    else summary.unknown++
  }
  return summary
}

/** Datos agregados para el resumen ejecutivo. */
function computeExecutiveSummary(hosts: HostInfo[]) {
  const global = collectGlobalCves(hosts)
  let totalPorts = 0
  let openPorts = 0
  const servicesMap = new Map<string, number>()
  const osMap = new Map<string, number>()

  for (const h of hosts) {
    const os = h.os?.split(' ')[0] || 'Desconocido'
    osMap.set(os, (osMap.get(os) || 0) + 1)
    for (const p of h.ports || []) {
      totalPorts++
      if (p.state === 'open') {
        openPorts++
        const svc = p.service || 'desconocido'
        servicesMap.set(svc, (servicesMap.get(svc) || 0) + 1)
      }
    }
  }

  const topServices = Array.from(servicesMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const topCves = global.cves.slice(0, 5)

  const upHosts = hosts.filter((h) => h.status === 'up').length

  return {
    global,
    totalHosts: hosts.length,
    upHosts,
    totalPorts,
    openPorts,
    topServices,
    topCves,
  }
}

// ==========================================================
// FILAS MARKDOWN
// ==========================================================
function cveMdRow(cve: CveMatch): string {
  const sev = SEVERITY_LABEL[cve.severity]
  const cvss = cve.cvss !== undefined ? cve.cvss.toFixed(1) : '-'
  const cwe = cve.cwe && cve.cwe.length > 0 ? cve.cwe.join(', ') : '-'
  const src =
    cve.source === 'nvd' || cve.source === 'cpe'
      ? 'NVD'
      : cve.source === 'cache'
        ? 'cache'
        : 'heurístico'
  const desc = cve.description
    ? escapeMdCell(cve.description.replace(/\s+/g, ' ').slice(0, 400))
    : '-'
  return `| \`${escapeMdInline(cve.id)}\` | **${sev}** | ${cvss} | ${escapeMdCell(cwe)} | ${src} | ${desc} |`
}

// ==========================================================
// HOOK
// ==========================================================
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
  setExpandedPorts: (ports: Record<string, boolean>) => void,
) {
  // ==========================================================
  // MARKDOWN
  // ==========================================================
  const generateMarkdown = useCallback(() => {
    const exec = computeExecutiveSummary(filteredData)

    let md = `# LESSSO C2 — Security Report\n\n`

    // ------------------------------------------------------
    // 1. PORTADA / METADATOS
    // ------------------------------------------------------
    md += `## Información del Escaneo\n\n`
    md += `| Campo | Valor |\n`
    md += `|---|---|\n`
    md += `| **Objetivo** | \`${escapeMdCell(target)}\` |\n`
    md += `| **Fecha** | ${new Date().toLocaleString()} |\n`
    md += `| **Duración** | ${escapeMdCell(scanDuration)} |\n`
    md += `| **Hosts** | ${exec.totalHosts} (${exec.upHosts} activos) |\n`
    md += `| **Puertos totales** | ${exec.totalPorts} (${exec.openPorts} abiertos) |\n`
    md += `| **CVEs únicos** | ${exec.global.total} |\n`
    md += `| **Comando** | \`${escapeMdInline(commandString)}\` |\n\n`

    // ------------------------------------------------------
    // 2. RESUMEN EJECUTIVO
    // ------------------------------------------------------
    md += `## Resumen Ejecutivo\n\n`
    md += `### Vulnerabilidades por Severidad\n\n`
    md += `| Severidad | Cantidad |\n`
    md += `|---|---|\n`
    md += `| **Críticos** | ${exec.global.crit} |\n`
    md += `| **Altos**    | ${exec.global.high} |\n`
    md += `| **Medios**   | ${exec.global.med} |\n`
    md += `| **Bajos**    | ${exec.global.low} |\n`
    md += `| **Total**    | **${exec.global.total}** |\n\n`

    if (exec.topServices.length > 0) {
      md += `### Top Servicios Expuestos\n\n`
      md += `| # | Servicio | Puertos abiertos |\n`
      md += `|---|---|---|\n`
      exec.topServices.forEach((s, i) => {
        md += `| ${i + 1} | ${escapeMdCell(s.name)} | ${s.count} |\n`
      })
      md += `\n`
    }

    if (exec.topCves.length > 0) {
      md += `### Top CVEs Críticos\n\n`
      md += `| CVE | Severidad | CVSS | Descripción |\n`
      md += `|---|---|---|---|\n`
      exec.topCves.forEach((c) => {
        const desc = c.description
          ? escapeMdCell(c.description.replace(/\s+/g, ' ').slice(0, 180))
          : '-'
        md += `| \`${escapeMdInline(c.id)}\` | **${SEVERITY_LABEL[c.severity]}** | ${c.cvss?.toFixed(1) ?? '-'} | ${desc} |\n`
      })
      md += `\n`
    }

    // ------------------------------------------------------
    // 3. RESUMEN DE HOSTS
    // ------------------------------------------------------
    md += `## Resumen de Hosts\n\n`
    md += `| IP | Hostname | SO | MAC | Puertos abiertos | Críticos | Altos | Medios | Score |\n`
    md += `|---|---|---|---|---|---|---|---|---|\n`
    filteredData.forEach((h) => {
      const cves = collectHostCves(h)
      const openCount = (h.ports || []).filter((p) => p.state === 'open').length
      md += `| \`${escapeMdCell(h.ip)}\` | ${escapeMdCell(h.hostname || '-')} | ${escapeMdCell(h.os || '-')} | ${escapeMdCell(h.mac || '-')} | ${openCount} | **${cves.crit}** | **${cves.high}** | ${cves.med} | - |\n`
    })
    md += `\n---\n\n`

    // ------------------------------------------------------
    // 4. DETALLE POR HOST
    // ------------------------------------------------------
    md += `## Detalle por Host\n\n`

    filteredData.forEach((host) => {
      const hostCves = collectHostCves(host)
      const portsWithCves: PortWithCves[] = (host.ports || []).map((port) => ({
        port,
        cves: collectPortCves(port),
      }))

      md += `### Host: \`${escapeMdInline(host.ip)}\`\n\n`
      md += `| Campo | Valor |\n`
      md += `|---|---|\n`
      md += `| **Estado** | ${escapeMdInline(host.status.toUpperCase())} |\n`
      if (host.hostname) md += `| **DNS** | ${escapeMdInline(host.hostname)} |\n`
      if (host.mac) md += `| **MAC** | ${escapeMdInline(host.mac)}${host.mac_vendor ? ` (${escapeMdInline(host.mac_vendor)})` : ''} |\n`
      if (host.os) md += `| **SO** | ${escapeMdInline(host.os)}${host.os_accuracy ? ` (${escapeMdInline(host.os_accuracy)}%)` : ''} |\n`
      if (host.uptime_seconds) md += `| **Uptime** | ${Math.floor(host.uptime_seconds / 3600)}h |\n`
      if (host.distance) md += `| **Saltos** | ${host.distance} |\n`
      md += `| **CVEs** | ${hostCves.crit} críticos · ${hostCves.high} altos · ${hostCves.med} medios · ${hostCves.total} total |\n\n`

      // Puertos con toda la info
      if (portsWithCves.length > 0) {
        md += `#### Puertos Detectados\n\n`
        md += `| Puerto/Proto | Estado | Razón | Servicio | Versión | CPE | CVEs |\n`
        md += `|---|---|---|---|---|---|---|\n`
        portsWithCves.forEach(({ port, cves }) => {
          const cpeStr = port.cpe && port.cpe.length > 0 ? port.cpe.join('<br>') : '-'
          const cveStr =
            cves.length > 0
              ? cves.map((c) => `\`${c.id}\` (${SEVERITY_LABEL[c.severity]})`).join('<br>')
              : '-'
          md += `| \`${escapeMdCell(port.portid)}/${escapeMdCell(port.protocol)}\` | ${escapeMdCell(port.state)} | ${escapeMdCell(port.reason || '-')} | ${escapeMdCell(port.service || '-')} | ${escapeMdCell(port.version || '-')} | ${cpeStr} | ${cveStr} |\n`
        })
        md += `\n`
      } else {
        md += `*Sin puertos detectados.*\n\n`
      }

      // CVEs detallados
      if (hostCves.total > 0) {
        md += `#### Vulnerabilidades Detectadas\n\n`
        md += `| CVE | Severidad | CVSS | CWE | Fuente | Descripción |\n`
        md += `|---|---|---|---|---|---|\n`
        hostCves.cves.forEach((c) => {
          md += cveMdRow(c) + `\n`
        })
        md += `\n`
      }

      // Scripts puertos
      const portsWithScripts = (host.ports || []).filter(
        (p) => p.scripts && p.scripts.length > 0,
      )
      if (portsWithScripts.length > 0) {
        md += `#### Scripts de Puertos\n\n`
        portsWithScripts.forEach((p) => {
          md += `**Puerto ${escapeMdInline(p.portid)}/${escapeMdInline(p.protocol)}**\n\n`
          p.scripts!.forEach((s) => {
            md += `- \`${escapeMdInline(s.id)}\`:\n\n\`\`\`\n${escapeMdCode(s.output)}\n\`\`\`\n\n`
          })
        })
      }

      // Scripts host
      if (host.scripts && host.scripts.length > 0) {
        md += `#### Host Script Output\n\n`
        host.scripts.forEach((s) => {
          md += `- \`${escapeMdInline(s.id)}\`:\n\n\`\`\`\n${escapeMdCode(s.output)}\n\`\`\`\n\n`
        })
      }

      md += `---\n\n`
    })

    // ------------------------------------------------------
    // 5. ANEXOS
    // ------------------------------------------------------
    if (includeCredsInExport && vaultCredentials.length > 0) {
      md += `## Anexo A — Bóveda de Credenciales\n\n`
      md += `| Target | Tipo | Usuario | Secreto |\n`
      md += `|---|---|---|---|\n`
      vaultCredentials.forEach((c) => {
        md += `| ${escapeMdCell(c.target)} | ${escapeMdCell(c.type.toUpperCase())} | ${escapeMdCell(c.username || '-')} | \`${escapeMdInline(c.secret)}\` |\n`
      })
      md += `\n`
    }

    if (redTeamNotes) {
      md += `## Anexo B — Bitácora de Auditoría\n\n\`\`\`text\n${escapeMdCode(redTeamNotes)}\n\`\`\`\n`
    }

    return md
  }, [
    target,
    commandString,
    scanDuration,
    filteredData,
    vaultCredentials,
    redTeamNotes,
    includeCredsInExport,
  ])

  // ==========================================================
  // HTML
  // ==========================================================
  const generateHTML = useCallback(() => {
    const exec = computeExecutiveSummary(filteredData)

    // ------------------------------------------------------
    // CSS con tipografía system-ui y jerarquía clara
    // ------------------------------------------------------
    const css = `
      :root{
        --c-dark:#0b282c;
        --c-crit:#dc2626;
        --c-high:#ea580c;
        --c-med:#ca8a04;
        --c-low:#2563eb;
        --c-unknown:#64748b;
        --c-border:#e2e8f0;
        --c-bg-soft:#f8fafc;
        --c-text:#0f172a;
        --c-muted:#64748b;
      }
      *{box-sizing:border-box}
      html,body{margin:0;padding:0;background:#f1f5f9}
      body{
        font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        color: var(--c-text);
        font-size: 10pt;
        line-height: 1.45;
        padding: 24px;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .container{max-width:1200px;margin:0 auto}

      /* TIPOGRAFÍA JERÁRQUICA */
      h1{font-size:20pt;font-weight:900;color:var(--c-dark);margin:0 0 6px;letter-spacing:-0.02em;text-transform:uppercase}
      h2{font-size:13pt;font-weight:800;color:var(--c-dark);margin:26px 0 10px;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid var(--c-dark);padding-bottom:4px}
      h3{font-size:12pt;font-weight:800;color:var(--c-dark);margin:20px 0 8px}
      h4{font-size:10.5pt;font-weight:700;color:#1e293b;margin:14px 0 6px;text-transform:uppercase;letter-spacing:.03em}

      /* METADATOS */
      .meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:16px}
      .meta-item{background:var(--c-bg-soft);padding:10px 12px;border-radius:6px;border:1px solid var(--c-border)}
      .meta-label{font-size:7.5pt;text-transform:uppercase;color:var(--c-muted);font-weight:700;letter-spacing:.05em;display:block;margin-bottom:2px}
      .meta-value{font-size:9.5pt;font-weight:600;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;color:#334155;word-break:break-all}

      /* TARJETAS DE SECCIÓN */
      .section{background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.06);border:1px solid var(--c-border);padding:18px 20px;margin-bottom:22px;page-break-inside:avoid}
      .section-flat{background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.06);border:1px solid var(--c-border);margin-bottom:22px;overflow:hidden;page-break-inside:avoid}
      .section-title{background:var(--c-dark);color:#fff;padding:8px 16px;font-size:10.5pt;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
      .section-title.alt{background:#334155}
      .section-title.danger{background:var(--c-crit)}

      /* RESUMEN EJECUTIVO */
      .exec-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}
      .exec-item{padding:12px 8px;border-radius:8px;text-align:center;border:2px solid}
      .exec-item .num{display:block;font-size:22pt;font-weight:900;line-height:1;margin-bottom:4px}
      .exec-item .lbl{font-size:7.5pt;text-transform:uppercase;font-weight:800;letter-spacing:.05em}
      .sev-critical{background:#fef2f2;color:var(--c-crit);border-color:var(--c-crit)}
      .sev-high{background:#fff7ed;color:var(--c-high);border-color:var(--c-high)}
      .sev-medium{background:#fefce8;color:var(--c-med);border-color:var(--c-med)}
      .sev-low{background:#eff6ff;color:var(--c-low);border-color:var(--c-low)}
      .sev-unknown{background:var(--c-bg-soft);color:var(--c-unknown);border-color:var(--c-unknown)}

      /* TABLAS */
      table{width:100%;border-collapse:collapse;font-size:9.5pt}
      thead th{
        background:var(--c-bg-soft);
        color:var(--c-muted);
        font-size:8pt;
        font-weight:800;
        text-transform:uppercase;
        letter-spacing:.05em;
        padding:8px 10px;
        text-align:left;
        border-bottom:2px solid var(--c-border);
        position:sticky;top:0;z-index:1;
      }
      tbody td{padding:8px 10px;border-bottom:1px solid var(--c-border);vertical-align:top;word-break:break-word}
      tbody tr:hover{background:#f8fafc}
      tbody tr:last-child td{border-bottom:none}
      table.compact{font-size:9pt}
      table.compact tbody td{padding:6px 8px}
      code{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:9pt;background:#f1f5f9;padding:1px 5px;border-radius:3px;color:#0f172a}

      /* BADGES */
      .badge{display:inline-block;padding:2px 8px;border-radius:9999px;font-size:8pt;font-weight:800;text-transform:uppercase;letter-spacing:.03em}
      .badge.up{background:#dcfce7;color:#166534;border:1px solid #22c55e}
      .badge.down{background:#fee2e2;color:#991b1b;border:1px solid #ef4444}
      .badge.cve{background:#fef2f2;color:var(--c-crit);border:1px solid var(--c-crit)}

      /* PILLS DE CVE */
      .cve-pill{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:5px;font-size:8.5pt;font-weight:700;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;border:1px solid;white-space:nowrap;margin:1px 2px 1px 0}
      .cve-pill .cvss{opacity:.75;font-size:8pt;font-weight:600}
      .cve-pill.sev-critical{background:#fee2e2;color:#991b1b;border-color:#ef4444}
      .cve-pill.sev-high{background:#ffedd5;color:#9a3412;border-color:#f97316}
      .cve-pill.sev-medium{background:#fef9c3;color:#854d0e;border-color:#eab308}
      .cve-pill.sev-low{background:#dbeafe;color:#1e40af;border-color:#3b82f6}
      .cve-pill.sev-unknown{background:#f1f5f9;color:#475569;border-color:#94a3b8}

      /* DESCRIPCIÓN CVE */
      .cve-desc{font-size:9pt;color:#475569;line-height:1.4}

      /* SCRIPT BLOCKS */
      .script-block{background:#0b1120;color:#10b981;padding:10px 12px;border-radius:6px;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:8.5pt;white-space:pre-wrap;margin-top:6px;border-left:3px solid var(--c-dark);line-height:1.4}
      .script-title{color:#5eead4;font-weight:700;margin-bottom:4px;display:block;font-size:8.5pt}

      /* PRINT */
      @media print {
        body{background:#fff;padding:0;font-size:9.5pt}
        .section,.section-flat{box-shadow:none;page-break-inside:avoid}
        h2{page-break-after:avoid}
        tr{page-break-inside:avoid}
        thead{display:table-header-group}
        .no-print{display:none}
      }
    `

    let html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>LESSSO C2 Report — ${escapeHtml(target)}</title><style>${css}</style></head><body><div class="container">`

    // ======================================================
    // 1. PORTADA
    // ======================================================
    html += `<div class="section">
      <h1>LESSSO C2 — Security Report</h1>
      <p style="color:var(--c-muted);font-size:10pt;margin:0 0 14px">Informe de auditoría de seguridad generado automáticamente</p>
      <div class="meta-grid">
        <div class="meta-item"><span class="meta-label">Objetivo</span><span class="meta-value">${escapeHtml(target) || 'N/A'}</span></div>
        <div class="meta-item"><span class="meta-label">Fecha</span><span class="meta-value">${escapeHtml(new Date().toLocaleString())}</span></div>
        <div class="meta-item"><span class="meta-label">Duración</span><span class="meta-value">${escapeHtml(scanDuration)}</span></div>
        <div class="meta-item"><span class="meta-label">Hosts</span><span class="meta-value">${exec.totalHosts} (${exec.upHosts} activos)</span></div>
        <div class="meta-item"><span class="meta-label">Puertos</span><span class="meta-value">${exec.totalPorts} (${exec.openPorts} abiertos)</span></div>
        <div class="meta-item"><span class="meta-label">CVEs únicos</span><span class="meta-value">${exec.global.total}</span></div>
        <div class="meta-item" style="grid-column:1/-1"><span class="meta-label">Comando</span><span class="meta-value">${escapeHtml(commandString)}</span></div>
      </div>
    </div>`

    // ======================================================
    // 2. RESUMEN EJECUTIVO
    // ======================================================
    html += `<h2>Resumen Ejecutivo</h2>`
    html += `<div class="section">
      <div class="exec-grid">
        <div class="exec-item sev-critical"><span class="num">${exec.global.crit}</span><span class="lbl">Críticos</span></div>
        <div class="exec-item sev-high"><span class="num">${exec.global.high}</span><span class="lbl">Altos</span></div>
        <div class="exec-item sev-medium"><span class="num">${exec.global.med}</span><span class="lbl">Medios</span></div>
        <div class="exec-item sev-low"><span class="num">${exec.global.low}</span><span class="lbl">Bajos</span></div>
        <div class="exec-item sev-unknown"><span class="num">${exec.global.total}</span><span class="lbl">Total</span></div>
      </div>
    </div>`

    if (exec.topServices.length > 0) {
      html += `<h3>Top Servicios Expuestos</h3>
      <div class="section-flat"><table class="compact">
        <thead><tr><th style="width:40px">#</th><th>Servicio</th><th style="width:140px">Puertos abiertos</th></tr></thead>
        <tbody>`
      exec.topServices.forEach((s, i) => {
        html += `<tr><td>${i + 1}</td><td><strong>${escapeHtml(s.name)}</strong></td><td>${s.count}</td></tr>`
      })
      html += `</tbody></table></div>`
    }

    if (exec.topCves.length > 0) {
      html += `<h3>Top CVEs Críticos</h3>
      <div class="section-flat"><table>
        <thead><tr><th>CVE</th><th style="width:110px">Severidad</th><th style="width:70px">CVSS</th><th>Descripción</th></tr></thead>
        <tbody>`
      exec.topCves.forEach((c) => {
        const sevCls = SEVERITY_HTML_CLASS[c.severity] || 'sev-unknown'
        html += `<tr>
          <td><code>${escapeHtml(c.id)}</code></td>
          <td><span class="cve-pill ${sevCls}">${escapeHtml(SEVERITY_LABEL[c.severity])}</span></td>
          <td><strong>${c.cvss?.toFixed(1) ?? '-'}</strong></td>
          <td><div class="cve-desc">${c.description ? escapeHtml(c.description) : '-'}</div></td>
        </tr>`
      })
      html += `</tbody></table></div>`
    }

    // ======================================================
    // 3. RESUMEN DE HOSTS
    // ======================================================
    html += `<h2>Resumen de Hosts</h2>`
    html += `<div class="section-flat"><table class="compact">
      <thead><tr>
        <th>IP</th><th>Hostname</th><th>SO</th><th>MAC</th>
        <th style="width:80px">Abiertos</th>
        <th style="width:70px">Crít</th>
        <th style="width:70px">Altos</th>
        <th style="width:70px">Medios</th>
        <th style="width:80px">Total CVEs</th>
      </tr></thead>
      <tbody>`
    filteredData.forEach((h) => {
      const cves = collectHostCves(h)
      const openCount = (h.ports || []).filter((p) => p.state === 'open').length
      html += `<tr>
        <td><code>${escapeHtml(h.ip)}</code></td>
        <td>${escapeHtml(h.hostname || '-')}</td>
        <td>${escapeHtml(h.os || '-')}</td>
        <td><code style="font-size:8pt">${escapeHtml(h.mac || '-')}</code></td>
        <td>${openCount}</td>
        <td><strong style="color:var(--c-crit)">${cves.crit}</strong></td>
        <td><strong style="color:var(--c-high)">${cves.high}</strong></td>
        <td><strong style="color:var(--c-med)">${cves.med}</strong></td>
        <td><strong>${cves.total}</strong></td>
      </tr>`
    })
    html += `</tbody></table></div>`

    // ======================================================
    // 4. DETALLE POR HOST
    // ======================================================
    html += `<h2>Detalle por Host</h2>`

    filteredData.forEach((host) => {
      const hostCves = collectHostCves(host)
      const portsWithCves: PortWithCves[] = (host.ports || []).map((port) => ({
        port,
        cves: collectPortCves(port),
      }))
      const statusClass = host.status === 'up' ? 'up' : 'down'

      html += `<div class="section-flat">`
      html += `<div class="section-title">${escapeHtml(host.ip)} ${host.hostname ? `— ${escapeHtml(host.hostname)}` : ''}
        <span style="float:right">
          <span class="badge ${statusClass}">${escapeHtml(host.status)}</span>
          ${hostCves.total > 0 ? `<span class="badge cve" style="margin-left:4px">${hostCves.total} CVEs</span>` : ''}
        </span>
      </div>`

      // Ficha del host
      html += `<div style="padding:14px 18px;border-bottom:1px solid var(--c-border)">
        <div class="meta-grid" style="margin-top:0">
          <div class="meta-item"><span class="meta-label">SO</span><span class="meta-value">${escapeHtml(host.os || 'Desconocido')}${host.os_accuracy ? ` (${escapeHtml(host.os_accuracy)}%)` : ''}</span></div>
          <div class="meta-item"><span class="meta-label">MAC</span><span class="meta-value">${escapeHtml(host.mac || '-')}${host.mac_vendor ? ` · ${escapeHtml(host.mac_vendor)}` : ''}</span></div>
          ${host.uptime_seconds ? `<div class="meta-item"><span class="meta-label">Uptime</span><span class="meta-value">${Math.floor(host.uptime_seconds / 3600)}h</span></div>` : ''}
          ${host.distance ? `<div class="meta-item"><span class="meta-label">Saltos</span><span class="meta-value">${host.distance}</span></div>` : ''}
        </div>
      </div>`

      // Puertos
      if (portsWithCves.length > 0) {
        html += `<div style="padding:14px 18px 4px"><h4>Puertos Detectados</h4></div>
        <div style="overflow-x:auto"><table>
          <thead><tr>
            <th style="width:110px">Puerto/Proto</th>
            <th style="width:90px">Estado</th>
            <th>Servicio</th>
            <th>Versión</th>
            <th>CPE</th>
            <th style="width:180px">CVEs</th>
          </tr></thead>
          <tbody>`
        portsWithCves.forEach(({ port, cves }) => {
          const cpeStr =
            port.cpe && port.cpe.length > 0
              ? port.cpe
                  .map((c) => `<code style="font-size:8pt;display:block;margin-bottom:2px">${escapeHtml(c)}</code>`)
                  .join('')
              : '<span style="color:#cbd5e1">-</span>'
          const cveStr =
            cves.length > 0
              ? cves
                  .map((c) => {
                    const cls = SEVERITY_HTML_CLASS[c.severity] || 'sev-unknown'
                    return `<span class="cve-pill ${cls}">${escapeHtml(c.id)}${c.cvss !== undefined ? `<span class="cvss">${c.cvss.toFixed(1)}</span>` : ''}</span>`
                  })
                  .join('')
              : '<span style="color:#cbd5e1">-</span>'

          html += `<tr>
            <td><code>${escapeHtml(port.portid)}/${escapeHtml(port.protocol)}</code></td>
            <td><strong style="color:${port.state === 'open' ? 'var(--c-crit)' : 'var(--c-muted)'}">${escapeHtml(port.state.toUpperCase())}</strong>
              ${port.reason ? `<div style="font-size:7.5pt;color:var(--c-muted)">${escapeHtml(port.reason)}</div>` : ''}
            </td>
            <td><strong>${escapeHtml(port.service || '-')}</strong></td>
            <td>${escapeHtml(port.version || '-')}</td>
            <td>${cpeStr}</td>
            <td>${cveStr}</td>
          </tr>`
        })
        html += `</tbody></table></div>`
      } else {
        html += `<div style="padding:14px 18px;color:var(--c-muted);font-style:italic">Sin puertos detectados.</div>`
      }

      // CVEs del host
      if (hostCves.total > 0) {
        html += `<div style="padding:14px 18px 4px"><h4>Vulnerabilidades Detectadas</h4></div>
        <div style="overflow-x:auto"><table>
          <thead><tr>
            <th style="width:150px">CVE</th>
            <th style="width:100px">Severidad</th>
            <th style="width:60px">CVSS</th>
            <th style="width:130px">CWE</th>
            <th style="width:80px">Fuente</th>
            <th>Descripción</th>
          </tr></thead>
          <tbody>`
        hostCves.cves.forEach((c) => {
          const sevCls = SEVERITY_HTML_CLASS[c.severity] || 'sev-unknown'
          const src =
            c.source === 'nvd' || c.source === 'cpe'
              ? 'NVD'
              : c.source === 'cache'
                ? 'cache'
                : 'heur.'
          html += `<tr>
            <td><code>${escapeHtml(c.id)}</code></td>
            <td><span class="cve-pill ${sevCls}">${escapeHtml(SEVERITY_LABEL[c.severity])}</span></td>
            <td><strong>${c.cvss !== undefined ? c.cvss.toFixed(1) : '-'}</strong></td>
            <td>${c.cwe && c.cwe.length > 0 ? escapeHtml(c.cwe.join(', ')) : '-'}</td>
            <td>${escapeHtml(src)}</td>
            <td><div class="cve-desc">${c.description ? escapeHtml(c.description) : '-'}</div></td>
          </tr>`
        })
        html += `</tbody></table></div>`
      }

      // Scripts puertos
      const portsWithScripts = (host.ports || []).filter(
        (p) => p.scripts && p.scripts.length > 0,
      )
      if (portsWithScripts.length > 0) {
        html += `<div style="padding:14px 18px 4px"><h4>Scripts de Puertos</h4></div>
        <div style="padding:0 18px 14px">`
        portsWithScripts.forEach((p) => {
          p.scripts!.forEach((s) => {
            html += `<div class="script-block"><span class="script-title">↳ ${escapeHtml(p.portid)}/${escapeHtml(p.protocol)} — ${escapeHtml(s.id)}</span>${escapeHtml(s.output)}</div>`
          })
        })
        html += `</div>`
      }

      // Scripts host
      if (host.scripts && host.scripts.length > 0) {
        html += `<div style="padding:14px 18px 4px"><h4>Host Script Output</h4></div>
        <div style="padding:0 18px 14px">`
        host.scripts.forEach((s) => {
          html += `<div class="script-block"><span class="script-title">↳ ${escapeHtml(s.id)}</span>${escapeHtml(s.output)}</div>`
        })
        html += `</div>`
      }

      html += `</div>`
    })

    // ======================================================
    // 5. ANEXOS
    // ======================================================
    if (includeCredsInExport && vaultCredentials.length > 0) {
      html += `<h2>Anexo A — Bóveda de Credenciales</h2>
      <div class="section-flat">
        <table>
          <thead><tr><th>Target</th><th style="width:90px">Tipo</th><th>Usuario</th><th>Secreto</th></tr></thead>
          <tbody>`
      vaultCredentials.forEach((c) => {
        html += `<tr>
          <td><strong>${escapeHtml(c.target)}</strong></td>
          <td><span class="badge" style="background:#e2e8f0;color:#334155">${escapeHtml(c.type)}</span></td>
          <td>${escapeHtml(c.username) || '-'}</td>
          <td><code style="color:#059669;background:#d1fae5;padding:2px 6px;border-radius:4px">${escapeHtml(c.secret)}</code></td>
        </tr>`
      })
      html += `</tbody></table></div>`
    }

    if (redTeamNotes) {
      html += `<h2>Anexo B — Bitácora de Auditoría</h2>
      <div class="section" style="white-space:pre-wrap;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:9pt;color:#334155">${escapeHtml(redTeamNotes)}</div>`
    }

    html += `</div></body></html>`
    return html
  }, [
    target,
    commandString,
    scanDuration,
    filteredData,
    vaultCredentials,
    redTeamNotes,
    includeCredsInExport,
  ])

  // ==========================================================
  // IMPRIMIR
  // ==========================================================
  const handlePrint = useCallback(() => {
    const allPorts: Record<string, boolean> = {}
    const allHosts: Record<string, boolean> = {}
    filteredData.forEach((h) => {
      if (h.scripts?.length) allHosts[h.ip] = true
      h.ports?.forEach((p) => {
        if (p.scripts?.length) allPorts[`${h.ip}-${p.portid}`] = true
      })
    })
    setExpandedHosts(allHosts)
    setExpandedPorts(allPorts)

    setTimeout(() => {
      const html = generateHTML()
      let printWindow: Window | null = null
      try {
        printWindow = window.open('', '_blank', 'width=1024,height=768')
      } catch {
        printWindow = null
      }

      if (printWindow) {
        printWindow.document.open()
        printWindow.document.write(html)
        printWindow.document.close()
        const triggerPrint = () => {
          try {
            printWindow!.focus()
            printWindow!.print()
          } catch (err) {
            console.error('[handlePrint] print() falló:', err)
          }
        }
        if (printWindow.document.readyState === 'complete') {
          setTimeout(triggerPrint, 300)
        } else {
          printWindow.onload = () => setTimeout(triggerPrint, 300)
        }
        return
      }

      const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `lessso_c2_report_${Date.now()}.html`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 5000)

      alert(
        'La ventana de impresión fue bloqueada por el navegador.\n\n' +
          'Se ha descargado el reporte como HTML. Ábrelo y usa Ctrl+P para imprimirlo.',
      )
    }, 300)
  }, [filteredData, generateHTML, setExpandedHosts, setExpandedPorts])

  // ==========================================================
  // GUARDAR / IMPORTAR
  // ==========================================================
  const handleSaveFile = async (type: 'md' | 'html' | 'json') => {
    try {
      const extension =
        type === 'md' ? 'md' : type === 'html' ? 'html' : 'json'
      const content =
        type === 'json'
          ? JSON.stringify(
              {
                exported_at: new Date().toISOString(),
                target,
                command: commandString,
                duration: scanDuration,
                hosts: filteredData,
                cves: collectGlobalCves(filteredData).cves,
                vault:
                  includeCredsInExport && vaultCredentials.length > 0
                    ? vaultCredentials
                    : undefined,
                notes: redTeamNotes || undefined,
              },
              null,
              2,
            )
          : type === 'md'
            ? generateMarkdown()
            : generateHTML()
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
      const selected = await open({
        filters: [{ name: 'JSON Workspace', extensions: ['json'] }],
      })
      if (selected && !Array.isArray(selected)) {
        const contents = await readTextFile(selected)
        const parsed = JSON.parse(contents)
        const hosts = Array.isArray(parsed) ? parsed : parsed.hosts
        if (Array.isArray(hosts)) importWorkspace(hosts)
        else alert('Formato de workspace no reconocido.')
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
    handleImport,
  }
}
