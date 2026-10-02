import { useCallback } from 'react'
import { save, open } from '@tauri-apps/plugin-dialog'
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs'
import type { HostInfo, VaultCred, PortInfo } from '../../../core/store/useScanStore'
import type { CveMatch, Severity } from '../utils/cve'
import { useUiStore, type PhaseLogEntry } from '../../../core/store/uiStore'
import {
  escapeMdInline,
  escapeMdCell,
  escapeMdCode,
  escapeHtml,
  escapeUrl,
  isSafeUrl,
  nvdUrl,
  nvdMdLink,
} from '../utils/escape'
import { sha256Hex, hashAlgorithmLabel } from '../utils/hash'
import { parseFlags, type ParsedCommand } from '../utils/flags'
import {
  cvssBand,
  cvssHtmlStyle,
  cvssMdCell,
} from '../utils/cvss'

// ==========================================================
// CONSTANTES DE SEVERIDAD
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

// ==========================================================
// TIPOS INTERNOS
// ==========================================================
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

interface ScanMetrics {
  totalHosts: number
  upHosts: number
  totalPorts: number
  openPorts: number
  uniqueServices: number
  totalCves: number
  cvesBySeverity: {
    critical: number
    high: number
    medium: number
    low: number
    unknown: number
  }
}

interface TimelineSnapshot {
  examStartAt: number | null
  examDurationMs: number
  phaseLog: PhaseLogEntry[]
}

// ==========================================================
// HELPERS DE CVEs
// ==========================================================

function collectPortCves(port: PortInfo): CveMatch[] {
  const real = port.cves || []
  return real.filter((c) => c.source !== 'heuristic')
}

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

// ==========================================================
// MÉTRICAS
// ==========================================================
function computeScanMetrics(hosts: HostInfo[]): ScanMetrics {
  const global = collectGlobalCves(hosts)
  let totalHosts = hosts.length
  let upHosts = 0
  let totalPorts = 0
  let openPorts = 0
  const servicesSet = new Set<string>()

  for (const h of hosts) {
    if (h.status === 'up') upHosts++
    for (const p of h.ports || []) {
      totalPorts++
      if (p.state === 'open') {
        openPorts++
        const svc = (p.service || 'desconocido').toLowerCase().trim()
        if (svc) servicesSet.add(svc)
      }
    }
  }

  return {
    totalHosts,
    upHosts,
    totalPorts,
    openPorts,
    uniqueServices: servicesSet.size,
    totalCves: global.total,
    cvesBySeverity: {
      critical: global.crit,
      high: global.high,
      medium: global.med,
      low: global.low,
      unknown: global.unknown,
    },
  }
}

function computeExecutiveSummary(hosts: HostInfo[]) {
  const global = collectGlobalCves(hosts)
  const metrics = computeScanMetrics(hosts)
  const servicesMap = new Map<string, number>()

  for (const h of hosts) {
    for (const p of h.ports || []) {
      if (p.state === 'open') {
        const svc = (p.service || 'desconocido').toLowerCase().trim()
        servicesMap.set(svc, (servicesMap.get(svc) || 0) + 1)
      }
    }
  }

  const topServices = Array.from(servicesMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const topCves = global.cves.slice(0, 5)

  return {
    global,
    metrics,
    topServices,
    topCves,
    totalHosts: metrics.totalHosts,
    upHosts: metrics.upHosts,
    totalPorts: metrics.totalPorts,
    openPorts: metrics.openPorts,
  }
}

// ==========================================================
// FILAS MARKDOWN
// ==========================================================
function cveMdRow(cve: CveMatch, includeCvss: boolean): string {
  const sev = SEVERITY_LABEL[cve.severity]
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
  const cveLink = nvdMdLink(cve.id)
  if (includeCvss) {
    return `| ${cveLink} \vert{} **${sev}** | ${cvssMdCell(cve.cvss)} \vert{}${escapeMdCell(cwe)} | ${src} \vert{}${desc} |`
  }
  return `| ${cveLink} | **${sev}** \vert{}${escapeMdCell(cwe)} | ${src} \vert{}${desc} |`
}

function cveMdHeader(includeCvss: boolean): { header: string; sep: string } {
  if (includeCvss) {
    return {
      header: `| CVE | Severidad | CVSS | CWE | Fuente | Descripción |`,
      sep: `|---|---|---|---|---|---|`,
    }
  }
  return {
    header: `| CVE | Severidad | CWE | Fuente | Descripción |`,
    sep: `|---|---|---|---|---|`,
  }
}

// ==========================================================
// HELPERS HTML
// ==========================================================
function cvssHtmlPill(score: number | undefined | null): string {
  if (score === undefined || score === null || isNaN(score)) {
    return `<span class="cve-pill sev-unknown" style="font-weight:600">N/A</span>`
  }
  const s = cvssHtmlStyle(score)
  const band = cvssBand(score)
  return (
    `<span class="cve-pill sev-${band}" ` +
    `style="background:${s.bg};color:${s.fg};border-color:${s.border};font-weight:800">` +
    `${score.toFixed(1)} <span style="opacity:.7;font-size:7.5pt">${s.label}</span>` +
    `</span>`
  )
}

function cveHtmlLink(cveId: string): string {
  const url = nvdUrl(cveId)
  const text = escapeHtml(cveId)
  if (!url || !isSafeUrl(url)) {
    return `<code>${text}</code>`
  }
  return (
    `<a href="${escapeUrl(url)}" target="_blank" rel="noopener noreferrer" ` +
    `style="color:#0b282c;text-decoration:none;font-weight:700">` +
    `<code style="background:#e0f2fe;color:#075985;padding:2px 6px;border-radius:4px">${text}</code>` +
    `</a>`
  )
}

// ==========================================================
// BLOQUES MD
// ==========================================================
function buildScopeMd(
  target: string,
  commandString: string,
  scanDuration: string,
  startedAtIso: string,
  finishedAtIso: string,
  parsed: ParsedCommand,
): string {
  let md = `## Scope & Metodología\n\n`

  md += `### Target(s)\n\n`
  md += `- **Objetivo principal:** \`${escapeMdInline(target || '<sin target>')}\`\n`
  if (parsed.target && parsed.target !== '<sin target>' && parsed.target !== target) {
    md += `- **Target detectado en comando:** \`${escapeMdInline(parsed.target)}\`\n`
  }
  md += `\n`

  md += `### Comando ejecutado\n\n`
  md += `\`\`\`bash\n${escapeMdCode(commandString || '<sin comando>')}\n\`\`\`\n\n`

  md += `### Flags desglosadas\n\n`
  md += `- **Herramienta:** \`${parsed.tool}\`\n`
  if (parsed.flags.length > 0) {
    md += `\n| Flag | Descripción |\n`
    md += `|---|---|\n`
    for (const f of parsed.flags) {
      md += `| \`${escapeMdInline(f.flag)}\` | ${escapeMdCell(f.desc)} |\n`
    }
    md += `\n`
  } else {
    md += `\n*No se detectaron flags explícitas (escaneo con defaults).*\n\n`
  }

  md += `### Ventana temporal\n\n`
  md += `| Campo | Valor (UTC) |\n`
  md += `|---|---|\n`
  md += `| **Inicio** | \`${startedAtIso}\` |\n`
  md += `| **Fin** | \`${finishedAtIso}\` |\n`
  md += `| **Duración** | ${escapeMdCell(scanDuration || 'N/A')} |\n\n`

  md += `### Herramientas utilizadas\n\n`
  md += `- **Nmap** — descubrimiento de hosts, puertos y detección de servicios/versiones.\n`
  md += `- **NVD API v2** — enriquecimiento de CVEs filtrados por versión (CVSS, CWE, descripción).\n`
  md += `- **LESSSO C2** — orquestador, parser y generador de reportes.\n\n`

  md += `### Limitaciones\n\n`
  md += `> Este reporte **no incluye explotación**; es únicamente reconocimiento ` +
    `y correlación pasiva/activa de vulnerabilidades conocidas. Los CVEs ` +
    `listados corresponden a coincidencias contra la base de datos NVD ` +
    `filtradas por la versión exacta del servicio detectado.\n\n`

  return md
}


function buildSignatureMd(signatures: any): string {
  const auditor = signatures.auditor;
  const reviewer = signatures.reviewer;

  if (!auditor || !auditor.name || auditor.name.trim() === '') {
    return '';
  }

  let md = "## Firmas de Aprobación\n\n";
  
  if (reviewer && reviewer.name && reviewer.name.trim() !== '') {
    const audRole = escapeMdCell(auditor.role ? auditor.role : '-');
    const revRole = escapeMdCell(reviewer.role ? reviewer.role : '-');
    const audComp = escapeMdCell(auditor.company ? auditor.company : '-');
    const revComp = escapeMdCell(reviewer.company ? reviewer.company : '-');
    const audDate = auditor.date ? auditor.date : new Date().toISOString();
    const revDate = reviewer.date ? reviewer.date : new Date().toISOString();

    md += "| Campo | Auditor Principal | Validador (QA) |\n";
    md += "|---|---|---|\n";
    md += "| **Nombre** | " + escapeMdCell(auditor.name) + " | " + escapeMdCell(reviewer.name) + " |\n";
    md += "| **Cargo** | " + audRole + " | " + revRole + " |\n";
    md += "| **Organización** | " + audComp + " | " + revComp + " |\n";
    md += "| **Fecha (UTC)** | `" + audDate + "` | `" + revDate + "` |\n\n";
  } else {
    md += "| Campo | Detalle |\n";
    md += "|---|---|\n";
    md += "| **Auditor** | " + escapeMdCell(auditor.name) + " |\n";
    
    if (auditor.role && auditor.role.trim() !== '') {
      md += "| **Cargo** | " + escapeMdCell(auditor.role) + " |\n";
    }
    
    if (auditor.company && auditor.company.trim() !== '') {
      md += "| **Empresa** | " + escapeMdCell(auditor.company) + " |\n";
    }
    
    const audDate = auditor.date ? auditor.date : new Date().toISOString();
    md += "| **Fecha (UTC)** | `" + audDate + "` |\n\n";
  }
  
  md += "---\n\n";
  return md;
}



function buildHashMd(hash: string): string {
  const algo = hashAlgorithmLabel(hash)
  return (
    `### Integridad del reporte\n\n` +
    `**Hash (${algo}):** \`${hash}\`\n\n` +
    `> Este hash se calcula sobre el JSON exportado y permite verificar ` +
    `que el reporte no fue alterado después de su generación.\n\n`
  )
}

// ==========================================================
// TIMELINE DEL EXAMEN
// ==========================================================
function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return '—'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m${s}s`
  if (m > 0) return `${m}m${s}s`
  return `${s}s`
}

function buildTimelineMd(snap: TimelineSnapshot): string {
  if (!snap.examStartAt || snap.phaseLog.length === 0) return ''
  const startedAt = new Date(snap.examStartAt).toISOString()

  let md = `## Timeline del Examen\n\n`
  md += `| Campo | Valor |\n`
  md += `|---|---|\n`
  md += `| **Inicio del examen (UTC)** | \`${startedAt}\` |\n`
  md += `| **Duración configurada** | ${(snap.examDurationMs / 3_600_000).toFixed(1)} h |\n`
  md += `| **Fases registradas** | ${snap.phaseLog.length} |\n\n`

  md += `| Fase | Inicio (UTC) | Fin (UTC) | Duración |\n`
  md += `|---|---|---|---|\n`
  for (const p of snap.phaseLog) {
    const dur = formatDuration(p.durationMs)
    const fin = p.endedAt ? `\`${p.endedAt}\`` : '—'
    md += `| **${p.phase.toUpperCase()}** | \`${p.startedAt}\` | ${fin} | ${dur} |\n`
  }
  md += `\n`
  return md
}

function buildTimelineHtml(snap: TimelineSnapshot): string {
  if (!snap.examStartAt || snap.phaseLog.length === 0) return ''
  const startedAt = new Date(snap.examStartAt).toISOString()

  let html = `<h2>Timeline del Examen</h2>`
  html += `<div class="section">`
  html += `<div class="meta-grid">
    <div class="meta-item"><span class="meta-label">Inicio del examen (UTC)</span><span class="meta-value">${escapeHtml(startedAt)}</span></div>
    <div class="meta-item"><span class="meta-label">Duración configurada</span><span class="meta-value">${(snap.examDurationMs / 3_600_000).toFixed(1)} h</span></div>
    <div class="meta-item"><span class="meta-label">Fases registradas</span><span class="meta-value">${snap.phaseLog.length}</span></div>
  </div>`
  html += `<table style="margin-top:16px">
    <thead><tr>
      <th style="width:140px">Fase</th>
      <th>Inicio (UTC)</th>
      <th>Fin (UTC)</th>
      <th style="width:130px">Duración</th>
    </tr></thead>
    <tbody>`
  for (const p of snap.phaseLog) {
    html += `<tr>
      <td><strong>${escapeHtml(p.phase.toUpperCase())}</strong></td>
      <td><code>${escapeHtml(p.startedAt)}</code></td>
      <td>${p.endedAt ? `<code>${escapeHtml(p.endedAt)}</code>` : '—'}</td>
      <td>${escapeHtml(formatDuration(p.durationMs))}</td>
    </tr>`
  }
  html += `</tbody></table></div>`
  return html
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
  includeCvss: boolean = true,
  signatures: any = { auditor: { name: '', role: '', company: '', date: '' }, reviewer: { name: '', role: '', company: '', date: '' } },
  includeMetrics: boolean = true,
  includeInventory: boolean = true
) {

  const parsedCommand = parseFlags(commandString)

  const readTimelineSnapshot = useCallback((): TimelineSnapshot => {
    const s = useUiStore.getState()
    return {
      examStartAt: s.examStartAt,
      examDurationMs: s.examDurationMs,
      phaseLog: s.phaseLog,
    }
  }, [])

  const generateMarkdown = useCallback(
    (integrityHash?: string, nowIso: string = new Date().toISOString()) => {
      const exec = computeExecutiveSummary(filteredData)
      const timeline = readTimelineSnapshot()

      let md = `# LESSSO C2 — Security Report\n\n`
      md += `> Generado: \`${nowIso}\`\n\n`

      md += buildScopeMd(
        target,
        commandString,
        scanDuration,
        nowIso,
        nowIso,
        parsedCommand,
      )

      md += `## Información del Escaneo\n\n`
      md += `| Campo | Valor |\n`
      md += `|---|---|\n`
      md += `| **Objetivo** | \`${escapeMdCell(target || 'N/A')}\` |\n`
      md += `| **Fecha (UTC)** | \`${nowIso}\` |\n`
      md += `| **Duración** | ${escapeMdCell(scanDuration || 'N/A')} |\n`
      md += `| **Comando** | \`${escapeMdInline(commandString || 'N/A')}\` |\n`
      if (integrityHash) {
        md += `| **Hash de integridad** | \`${integrityHash}\` (${hashAlgorithmLabel(integrityHash)}) |\n`
      }
      md += `\n`

      md += buildTimelineMd(timeline)

      if (includeMetrics) {
        md += `## Métricas del Escaneo\n\n`
        md += `| Métrica | Valor |\n`
        md += `|---|---|\n`
        md += `| **Hosts totales** | ${exec.metrics.totalHosts} |\n`
        md += `| **Hosts activos** | ${exec.metrics.upHosts} |\n`
        md += `| **Puertos abiertos** | ${exec.metrics.openPorts} / ${exec.metrics.totalPorts} |\n`
        md += `| **Servicios únicos** | ${exec.metrics.uniqueServices} |\n`
        md += `| **CVEs totales** | ${exec.metrics.totalCves} |\n`
        md += `| **CVEs críticos** | ${exec.metrics.cvesBySeverity.critical} |\n`
        md += `| **CVEs altos** | ${exec.metrics.cvesBySeverity.high} |\n`
        md += `| **CVEs medios** | ${exec.metrics.cvesBySeverity.medium} |\n`
        md += `| **CVEs bajos** | ${exec.metrics.cvesBySeverity.low} |\n`
        md += `| **CVEs desconocidos** | ${exec.metrics.cvesBySeverity.unknown} |\n`
        md += `\n`

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
          if (includeCvss) {
            md += `| CVE | Severidad | CVSS | Descripción |\n`
            md += `|---|---|---|---|\n`
            exec.topCves.forEach((c) => {
              const desc = c.description ? escapeMdCell(c.description.replace(/\s+/g, ' ').slice(0, 180)) : '-'
              md += `| ${nvdMdLink(c.id)} | **${SEVERITY_LABEL[c.severity]}** | ${cvssMdCell(c.cvss)} | ${desc} |\n`
            })
          } else {
            md += `| CVE | Severidad | Descripción |\n`
            md += `|---|---|---|\n`
            exec.topCves.forEach((c) => {
              const desc = c.description ? escapeMdCell(c.description.replace(/\s+/g, ' ').slice(0, 180)) : '-'
              md += `| ${nvdMdLink(c.id)} | **${SEVERITY_LABEL[c.severity]}** | ${desc} |\n`
            })
          }
          md += `\n`
        }
      }

      if (includeInventory) {
        md += `## Resumen de Hosts\n\n`
        md += `| IP | Hostname | SO | MAC | Puertos abiertos | Críticos | Altos | Medios | Total CVEs |\n`
        md += `|---|---|---|---|---|---|---|---|---|\n`
        filteredData.forEach((h) => {
          const cves = collectHostCves(h)
          const openCount = (h.ports || []).filter((p) => p.state === 'open').length
          md += `| \`${escapeMdCell(h.ip)}\` | ${escapeMdCell(h.hostname || '-')} | ${escapeMdCell(h.os || '-')} | ${escapeMdCell(h.mac || '-')} | ${openCount} | **${cves.crit}** | **${cves.high}** | ${cves.med} | ${cves.total} |\n`
        })
        md += `\n---\n\n`

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

          if (portsWithCves.length > 0) {
            md += `#### Puertos Detectados\n\n`
            md += `| Puerto/Proto | Estado | Razón | Servicio | Versión | CPE | CVEs |\n`
            md += `|---|---|---|---|---|---|---|\n`
            portsWithCves.forEach(({ port, cves }) => {
              const cpeStr = port.cpe && port.cpe.length > 0 ? port.cpe.join('<br>') : '-'
              const cveStr = cves.length > 0 ? cves.map((c) => `${nvdMdLink(c.id)} (${SEVERITY_LABEL[c.severity]})`).join('<br>') : '-'
              md += `| \`${escapeMdCell(port.portid)}/${escapeMdCell(port.protocol)}\` | ${escapeMdCell(port.state)} | ${escapeMdCell(port.reason || '-')} | ${escapeMdCell(port.service || '-')} | ${escapeMdCell(port.version || '-')} | ${cpeStr} | ${cveStr} |\n`
            })
            md += `\n`
          } else {
            md += `*Sin puertos detectados.*\n\n`
          }

          if (hostCves.total > 0) {
            md += `#### Vulnerabilidades Detectadas\n\n`
            const { header, sep } = cveMdHeader(includeCvss)
            md += `${header}\n${sep}\n`
            hostCves.cves.forEach((c) => { md += cveMdRow(c, includeCvss) + `\n` })
            md += `\n`
          }

          const portsWithScripts = (host.ports || []).filter((p) => p.scripts && p.scripts.length > 0)
          if (portsWithScripts.length > 0) {
            md += `#### Scripts de Puertos\n\n`
            portsWithScripts.forEach((p) => {
              md += `**Puerto ${escapeMdInline(p.portid)}/${escapeMdInline(p.protocol)}**\n\n`
              p.scripts!.forEach((s) => {
                md += `- \`${escapeMdInline(s.id)}\`:\n\n\`\`\`\n${escapeMdCode(s.output)}\n\`\`\`\n\n`
              })
            })
          }

          if (host.scripts && host.scripts.length > 0) {
            md += `#### Host Script Output\n\n`
            host.scripts.forEach((s) => {
              md += `- \`${escapeMdInline(s.id)}\`:\n\n\`\`\`\n${escapeMdCode(s.output)}\n\`\`\`\n\n`
            })
          }

          md += `---\n\n`
        })
      }

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
        md += `## Anexo B — Bitácora de Auditoría\n\n\`\`\`text\n${escapeMdCode(redTeamNotes)}\n\`\`\`\n\n`
      }

      if (integrityHash) {
        md += buildHashMd(integrityHash)
      }

      const sigBlock = buildSignatureMd(signatures)
      if (sigBlock) {
        md += sigBlock
      }

      return md
    },
    [target, commandString, scanDuration, filteredData, vaultCredentials, redTeamNotes, includeCredsInExport, includeCvss, signatures, parsedCommand, readTimelineSnapshot, includeMetrics, includeInventory],
  )

  const generateHTML = useCallback(
    (integrityHash?: string, nowIso: string = new Date().toISOString()) => {
      const exec = computeExecutiveSummary(filteredData)
      const timeline = readTimelineSnapshot()

      const css = `
        :root{--c-dark:#0b282c;--c-crit:#dc2626;--c-high:#ea580c;--c-med:#ca8a04;--c-low:#2563eb;--c-unknown:#64748b;--c-border:#e2e8f0;--c-bg-soft:#f8fafc;--c-text:#0f172a;--c-muted:#64748b;}
        *{box-sizing:border-box} html{margin:0;padding:0;background:#f1f5f9;height:100%}
        body{margin:0;padding:24px;background:#f1f5f9;font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:var(--c-text);font-size:10pt;line-height:1.45;min-height:100%;-webkit-print-color-adjust:exact;print-color-adjust:exact;overflow-y:auto;}
        .container{max-width:1200px;margin:0 auto}
        h1{font-size:20pt;font-weight:900;color:var(--c-dark);margin:0 0 6px;letter-spacing:-0.02em;text-transform:uppercase}
        h2{font-size:13pt;font-weight:800;color:var(--c-dark);margin:26px 0 10px;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid var(--c-dark);padding-bottom:4px}
        h3{font-size:12pt;font-weight:800;color:var(--c-dark);margin:20px 0 8px}
        h4{font-size:10.5pt;font-weight:700;color:#1e293b;margin:14px 0 6px;text-transform:uppercase;letter-spacing:.03em}
        .meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:16px}
        .meta-item{background:var(--c-bg-soft);padding:10px 12px;border-radius:6px;border:1px solid var(--c-border)}
        .meta-label{font-size:7.5pt;text-transform:uppercase;color:var(--c-muted);font-weight:700;letter-spacing:.05em;display:block;margin-bottom:2px}
        .meta-value{font-size:9.5pt;font-weight:600;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;color:#334155;word-break:break-all}
        .section{background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.06);border:1px solid var(--c-border);padding:18px 20px;margin-bottom:22px;page-break-inside:avoid}
        .section-flat{background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.06);border:1px solid var(--c-border);margin-bottom:22px;overflow:hidden;page-break-inside:avoid}
        .section-title{background:var(--c-dark);color:#fff;padding:8px 16px;font-size:10.5pt;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
        .exec-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}
        .exec-item{padding:12px 8px;border-radius:8px;text-align:center;border:2px solid}
        .exec-item .num{display:block;font-size:22pt;font-weight:900;line-height:1;margin-bottom:4px}
        .exec-item .lbl{font-size:7.5pt;text-transform:uppercase;font-weight:800;letter-spacing:.05em}
        .sev-critical{background:#fef2f2;color:var(--c-crit);border-color:var(--c-crit)}
        .sev-high{background:#fff7ed;color:var(--c-high);border-color:var(--c-high)}
        .sev-medium{background:#fefce8;color:var(--c-med);border-color:var(--c-med)}
        .sev-low{background:#eff6ff;color:var(--c-low);border-color:var(--c-low)}
        .sev-unknown{background:var(--c-bg-soft);color:var(--c-unknown);border-color:var(--c-unknown)}
        table{width:100%;border-collapse:collapse;font-size:9.5pt}
        thead th{background:var(--c-bg-soft);color:var(--c-muted);font-size:8pt;font-weight:800;text-transform:uppercase;letter-spacing:.05em;padding:8px 10px;text-align:left;border-bottom:2px solid var(--c-border);}
        tbody td{padding:8px 10px;border-bottom:1px solid var(--c-border);vertical-align:top;word-break:break-word}
        tbody tr:hover{background:#f8fafc}
        tbody tr:last-child td{border-bottom:none}
        table.compact{font-size:9pt}
        table.compact tbody td{padding:6px 8px}
        code{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:9pt;background:#f1f5f9;padding:1px 5px;border-radius:3px;color:#0f172a}
        .badge{display:inline-block;padding:2px 8px;border-radius:9999px;font-size:8pt;font-weight:800;text-transform:uppercase;letter-spacing:.03em}
        .badge.up{background:#dcfce7;color:#166534;border:1px solid #22c55e}
        .badge.down{background:#fee2e2;color:#991b1b;border:1px solid #ef4444}
        .badge.cve{background:#fef2f2;color:var(--c-crit);border:1px solid var(--c-crit)}
        .cve-pill{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:5px;font-size:8.5pt;font-weight:700;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;border:1px solid;white-space:nowrap;margin:1px 2px 1px 0}
        .cve-desc{font-size:9pt;color:#475569;line-height:1.4}
        .script-block{background:#0b1120;color:#10b981;padding:10px 12px;border-radius:6px;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:8.5pt;white-space:pre-wrap;margin-top:6px;border-left:3px solid var(--c-dark);line-height:1.4}
        .script-title{color:#5eead4;font-weight:700;margin-bottom:4px;display:block;font-size:8.5pt}
        .scope-list{list-style:none;padding:0;margin:0}
        .scope-list li{padding:4px 0;border-bottom:1px dashed var(--c-border)}
        .scope-list li:last-child{border-bottom:none}
        .hash-box{background:#0b1120;color:#5eead4;padding:10px 12px;border-radius:6px;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:8.5pt;word-break:break-all;line-height:1.4}
        .hash-box .algo{color:#fbbf24;font-weight:700}
        .sig-block{background:var(--c-bg-soft);border:1px solid var(--c-border);border-radius:8px;padding:16px 20px}
        .sig-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px}
        .sig-item .lbl{font-size:7.5pt;text-transform:uppercase;color:var(--c-muted);font-weight:700;letter-spacing:.05em;display:block;margin-bottom:4px}
        .sig-item .val{font-size:10.5pt;font-weight:700;color:var(--c-dark);border-bottom:1px solid var(--c-dark);padding-bottom:2px;min-height:18px}
        .sig-line{margin-top:22px;border-top:1px solid #94a3b8;width:280px;padding-top:4px;font-size:8pt;color:var(--c-muted);text-transform:uppercase;letter-spacing:.05em}
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

      html += `<h2>Scope &amp; Metodología</h2>`
      html += `<div class="section">`
      html += `<h3 style="margin-top:0">Target(s)</h3>`
      html += `<ul class="scope-list">`
      html += `<li><strong>Objetivo principal:</strong> <code>${escapeHtml(target || '<sin target>')}</code></li>`
      if (parsedCommand.target && parsedCommand.target !== '<sin target>' && parsedCommand.target !== target) {
        html += `<li><strong>Target detectado en comando:</strong> <code>${escapeHtml(parsedCommand.target)}</code></li>`
      }
      html += `</ul>`

      html += `<h3>Comando ejecutado</h3>`
      html += `<div class="script-block" style="margin-top:0">${escapeHtml(commandString || '<sin comando>')}</div>`

      html += `<h3>Flags desglosadas</h3>`
      html += `<p style="margin:0 0 8px"><strong>Herramienta:</strong> <code>${escapeHtml(parsedCommand.tool)}</code></p>`
      if (parsedCommand.flags.length > 0) {
        html += `<table class="compact"><thead><tr><th style="width:220px">Flag</th><th>Descripción</th></tr></thead><tbody>`
        for (const f of parsedCommand.flags) {
          html += `<tr><td><code>${escapeHtml(f.flag)}</code></td><td>${escapeHtml(f.desc)}</td></tr>`
        }
        html += `</tbody></table>`
      } else {
        html += `<p style="color:var(--c-muted);font-style:italic">No se detectaron flags explícitas (escaneo con defaults).</p>`
      }

      html += `<h3>Ventana temporal</h3>`
      html += `<div class="meta-grid" style="margin-top:8px">
        <div class="meta-item"><span class="meta-label">Inicio (UTC)</span><span class="meta-value">${escapeHtml(nowIso)}</span></div>
        <div class="meta-item"><span class="meta-label">Fin (UTC)</span><span class="meta-value">${escapeHtml(nowIso)}</span></div>
        <div class="meta-item"><span class="meta-label">Duración</span><span class="meta-value">${escapeHtml(scanDuration || 'N/A')}</span></div>
      </div>`

      html += `<h3>Herramientas utilizadas</h3>`
      html += `<ul class="scope-list">
        <li><strong>Nmap</strong> — descubrimiento de hosts, puertos y detección de servicios/versiones.</li>
        <li><strong>NVD API v2</strong> — enriquecimiento de CVEs filtrados por versión (CVSS, CWE, descripción).</li>
        <li><strong>LESSSO C2</strong> — orquestador, parser y generador de reportes.</li>
      </ul>`

      html += `<h3>Limitaciones</h3>`
      html += `<p style="background:#fef9c3;border-left:3px solid #eab308;padding:10px 12px;border-radius:4px;font-size:9.5pt;margin:0">
        Este reporte <strong>no incluye explotación</strong>; es únicamente reconocimiento
        y correlación pasiva/activa de vulnerabilidades conocidas. Los CVEs listados
        corresponden a coincidencias contra la base de datos NVD filtradas por la
        versión exacta del servicio detectado.
      </p>`

      html += `</div>`

      html += `<div class="section">
        <h1>LESSSO C2 — Security Report</h1>
        <p style="color:var(--c-muted);font-size:10pt;margin:0 0 14px">Informe de auditoría de seguridad generado automáticamente</p>
        <div class="meta-grid">
          <div class="meta-item"><span class="meta-label">Objetivo</span><span class="meta-value">${escapeHtml(target) || 'N/A'}</span></div>
          <div class="meta-item"><span class="meta-label">Fecha (UTC)</span><span class="meta-value">${escapeHtml(nowIso)}</span></div>
          <div class="meta-item"><span class="meta-label">Duración</span><span class="meta-value">${escapeHtml(scanDuration || 'N/A')}</span></div>
          <div class="meta-item" style="grid-column:1/-1"><span class="meta-label">Comando</span><span class="meta-value">${escapeHtml(commandString || 'N/A')}</span></div>
          ${integrityHash ? `<div class="meta-item" style="grid-column:1/-1"><span class="meta-label">Hash de integridad (${hashAlgorithmLabel(integrityHash)})</span><span class="meta-value">${escapeHtml(integrityHash)}</span></div>` : ''}
        </div>
      </div>`

      html += buildTimelineHtml(timeline)

      if (includeMetrics) {
        html += `<h2>Métricas del Escaneo</h2>`
        html += `<div class="section-flat"><table class="compact">
          <thead><tr><th>Métrica</th><th style="width:180px">Valor</th></tr></thead>
          <tbody>
            <tr><td><strong>Hosts totales</strong></td><td>${exec.metrics.totalHosts}</td></tr>
            <tr><td><strong>Hosts activos</strong></td><td>${exec.metrics.upHosts}</td></tr>
            <tr><td><strong>Puertos abiertos</strong></td><td>${exec.metrics.openPorts} / ${exec.metrics.totalPorts}</td></tr>
            <tr><td><strong>Servicios únicos</strong></td><td>${exec.metrics.uniqueServices}</td></tr>
            <tr><td><strong>CVEs totales</strong></td><td><strong>${exec.metrics.totalCves}</strong></td></tr>
            <tr><td><strong>CVEs críticos</strong></td><td><strong style="color:var(--c-crit)">${exec.metrics.cvesBySeverity.critical}</strong></td></tr>
            <tr><td><strong>CVEs altos</strong></td><td><strong style="color:var(--c-high)">${exec.metrics.cvesBySeverity.high}</strong></td></tr>
            <tr><td><strong>CVEs medios</strong></td><td><strong style="color:var(--c-med)">${exec.metrics.cvesBySeverity.medium}</strong></td></tr>
            <tr><td><strong>CVEs bajos</strong></td><td><strong style="color:var(--c-low)">${exec.metrics.cvesBySeverity.low}</strong></td></tr>
            <tr><td><strong>CVEs desconocidos</strong></td><td>${exec.metrics.cvesBySeverity.unknown}</td></tr>
          </tbody>
        </table></div>`

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
            <thead><tr>
              <th>CVE</th>
              <th style="width:110px">Severidad</th>
              ${includeCvss ? `<th style="width:120px">CVSS</th>` : ''}
              <th>Descripción</th>
            </tr></thead>
            <tbody>`
          exec.topCves.forEach((c) => {
            const sevCls = SEVERITY_HTML_CLASS[c.severity] || 'sev-unknown'
            html += `<tr>
              <td>${cveHtmlLink(c.id)}</td>
              <td><span class="cve-pill ${sevCls}">${escapeHtml(SEVERITY_LABEL[c.severity])}</span></td>
              ${includeCvss ? `<td>${cvssHtmlPill(c.cvss)}</td>` : ''}
              <td><div class="cve-desc">${c.description ? escapeHtml(c.description) : '-'}</div></td>
            </tr>`
          })
          html += `</tbody></table></div>`
        }
      }

      if (includeInventory) {
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

          html += `<div style="padding:14px 18px;border-bottom:1px solid var(--c-border)">
            <div class="meta-grid" style="margin-top:0">
              <div class="meta-item"><span class="meta-label">SO</span><span class="meta-value">${escapeHtml(host.os || 'Desconocido')}${host.os_accuracy ? ` (${escapeHtml(host.os_accuracy)}%)` : ''}</span></div>
              <div class="meta-item"><span class="meta-label">MAC</span><span class="meta-value">${escapeHtml(host.mac || '-')}${host.mac_vendor ? ` · ${escapeHtml(host.mac_vendor)}` : ''}</span></div>
              ${host.uptime_seconds ? `<div class="meta-item"><span class="meta-label">Uptime</span><span class="meta-value">${Math.floor(host.uptime_seconds / 3600)}h</span></div>` : ''}
              ${host.distance ? `<div class="meta-item"><span class="meta-label">Saltos</span><span class="meta-value">${host.distance}</span></div>` : ''}
            </div>
          </div>`

          if (portsWithCves.length > 0) {
            html += `<div style="padding:14px 18px 4px"><h4>Puertos Detectados</h4></div>
            <div style="overflow-x:auto"><table>
              <thead><tr>
                <th style="width:110px">Puerto/Proto</th>
                <th style="width:90px">Estado</th>
                <th>Servicio</th>
                <th>Versión</th>
                <th>CPE</th>
                <th style="width:200px">CVEs</th>
              </tr></thead>
              <tbody>`
            portsWithCves.forEach(({ port, cves }) => {
              const cpeStr = port.cpe && port.cpe.length > 0 ? port.cpe.map((c) => `<code style="font-size:8pt;display:block;margin-bottom:2px">${escapeHtml(c)}</code>`).join('') : '<span style="color:#cbd5e1">-</span>'
              const cveStr = cves.length > 0 ? cves.map((c) => {
                const cls = SEVERITY_HTML_CLASS[c.severity] || 'sev-unknown'
                const score = c.cvss !== undefined ? `<span style="opacity:.75;font-size:8pt;font-weight:600">${c.cvss.toFixed(1)}</span>` : ''
                const url = nvdUrl(c.id)
                const inner = `${escapeHtml(c.id)}${score}`
                if (url && isSafeUrl(url)) { return `<a href="${escapeUrl(url)}" target="_blank" rel="noopener noreferrer" class="cve-pill ${cls}" style="text-decoration:none">${inner}</a>` }
                return `<span class="cve-pill ${cls}">${inner}</span>`
              }).join('') : '<span style="color:#cbd5e1">-</span>'

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

          if (hostCves.total > 0) {
            html += `<div style="padding:14px 18px 4px"><h4>Vulnerabilidades Detectadas</h4></div>
            <div style="overflow-x:auto"><table>
              <thead><tr>
                <th style="width:180px">CVE</th>
                <th style="width:100px">Severidad</th>
                ${includeCvss ? `<th style="width:130px">CVSS</th>` : ''}
                <th style="width:130px">CWE</th>
                <th style="width:80px">Fuente</th>
                <th>Descripción</th>
              </tr></thead>
              <tbody>`
            hostCves.cves.forEach((c) => {
              const sevCls = SEVERITY_HTML_CLASS[c.severity] || 'sev-unknown'
              const src = c.source === 'nvd' || c.source === 'cpe' ? 'NVD' : c.source === 'cache' ? 'cache' : 'heur.'
              html += `<tr>
                <td>${cveHtmlLink(c.id)}</td>
                <td><span class="cve-pill ${sevCls}">${escapeHtml(SEVERITY_LABEL[c.severity])}</span></td>
                ${includeCvss ? `<td>${cvssHtmlPill(c.cvss)}</td>` : ''}
                <td>${c.cwe && c.cwe.length > 0 ? escapeHtml(c.cwe.join(', ')) : '-'}</td>
                <td>${escapeHtml(src)}</td>
                <td><div class="cve-desc">${c.description ? escapeHtml(c.description) : '-'}</div></td>
              </tr>`
            })
            html += `</tbody></table></div>`
          }

          const portsWithScripts = (host.ports || []).filter((p) => p.scripts && p.scripts.length > 0)
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
      }

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

      if (integrityHash) {
        html += `<h2>Integridad del Reporte</h2>
        <div class="section">
          <p style="margin:0 0 8px;font-size:9.5pt;color:var(--c-muted)">
            Este hash se calcula sobre el JSON exportado y permite verificar que el
            reporte no fue alterado después de su generación.
          </p>
          <div class="hash-box">
            <span class="algo">${escapeHtml(hashAlgorithmLabel(integrityHash))}</span><br>
            ${escapeHtml(integrityHash)}
          </div>
        </div>`
      }

      if (signatures.auditor?.name.trim()) {
        const aud = signatures.auditor;
        const rev = signatures.reviewer;
        const dualMode = rev?.name.trim().length > 0;
        
        html += `<h2>Firmas de Aprobación</h2>`;
        
        if (dualMode) {
          html += `<div style="display:flex;gap:20px;">`;
          html += `<div class="sig-block" style="flex:1">
            <div style="font-size:10pt;font-weight:900;margin-bottom:12px;color:var(--c-dark);text-transform:uppercase;">Auditor Principal</div>
            <div class="sig-grid" style="grid-template-columns:1fr">
              <div class="sig-item"><span class="lbl">Nombre</span><span class="val">${escapeHtml(aud.name)}</span></div>
              ${aud.role.trim() ? `<div class="sig-item"><span class="lbl">Cargo</span><span class="val">${escapeHtml(aud.role)}</span></div>` : ''}
              ${aud.company.trim() ? `<div class="sig-item"><span class="lbl">Empresa</span><span class="val">${escapeHtml(aud.company)}</span></div>` : ''}
              <div class="sig-item"><span class="lbl">Fecha (UTC)</span><span class="val" style="font-family:monospace;font-size:9pt">${escapeHtml(aud.date || nowIso)}</span></div>
            </div>
            <div class="sig-line">Firma</div>
          </div>`;
          html += `<div class="sig-block" style="flex:1;background:#fff;border-style:dashed;">
            <div style="font-size:10pt;font-weight:900;margin-bottom:12px;color:var(--c-dark);text-transform:uppercase;">Validador (QA)</div>
            <div class="sig-grid" style="grid-template-columns:1fr">
              <div class="sig-item"><span class="lbl">Nombre</span><span class="val">${escapeHtml(rev.name)}</span></div>
              ${rev.role.trim() ? `<div class="sig-item"><span class="lbl">Cargo</span><span class="val">${escapeHtml(rev.role)}</span></div>` : ''}
              ${rev.company.trim() ? `<div class="sig-item"><span class="lbl">Empresa</span><span class="val">${escapeHtml(rev.company)}</span></div>` : ''}
              <div class="sig-item"><span class="lbl">Fecha (UTC)</span><span class="val" style="font-family:monospace;font-size:9pt">${escapeHtml(rev.date || nowIso)}</span></div>
            </div>
            <div class="sig-line">Firma QA</div>
          </div>`;
          html += `</div>`;
        } else {
          html += `<div class="sig-block">
            <div class="sig-grid">
              <div class="sig-item"><span class="lbl">Auditor</span><span class="val">${escapeHtml(aud.name)}</span></div>
              ${aud.role.trim() ? `<div class="sig-item"><span class="lbl">Cargo</span><span class="val">${escapeHtml(aud.role)}</span></div>` : ''}
              ${aud.company.trim() ? `<div class="sig-item"><span class="lbl">Empresa</span><span class="val">${escapeHtml(aud.company)}</span></div>` : ''}
              <div class="sig-item"><span class="lbl">Fecha de firma (UTC)</span><span class="val" style="font-family:ui-monospace,monospace;font-size:9.5pt">${escapeHtml(aud.date || nowIso)}</span></div>
            </div>
            <div class="sig-line">Firma</div>
          </div>`;
        }
      }

      html += `</div></body></html>`
      return html
    },
    [target, commandString, scanDuration, filteredData, vaultCredentials, redTeamNotes, includeCredsInExport, includeCvss, signatures, parsedCommand, readTimelineSnapshot, includeMetrics, includeInventory],
  )

  const buildJsonPayload = useCallback(
    (exportedAt: string) => {
      const timeline = readTimelineSnapshot()
      return {
        exported_at: exportedAt,
        target,
        command: commandString,
        duration: scanDuration,
        hosts: filteredData,
        cves: collectGlobalCves(filteredData).cves,
        vault: includeCredsInExport && vaultCredentials.length > 0 ? vaultCredentials : undefined,
        notes: redTeamNotes || undefined,
        signatures: signatures.auditor.name.trim() ? signatures : undefined,
        includeCvss,
        include_metrics: includeMetrics,     // Se inyecta en el JSON
        include_inventory: includeInventory, // Se inyecta en el JSON
        timeline: timeline.examStartAt
          ? {
              examStartAt: new Date(timeline.examStartAt).toISOString(),
              examDurationMs: timeline.examDurationMs,
              phases: timeline.phaseLog,
            }
          : undefined,
      }
    },
    [target, commandString, scanDuration, filteredData, vaultCredentials, redTeamNotes, includeCredsInExport, includeCvss, signatures, readTimelineSnapshot, includeMetrics, includeInventory],
  )

  const handlePrint = useCallback(async () => {
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

    const exportedAt = new Date().toISOString()
    const jsonPayload = JSON.stringify(buildJsonPayload(exportedAt), null, 2)
    const integrityHash = await sha256Hex(jsonPayload)

    setTimeout(() => {
      const html = generateHTML(integrityHash, exportedAt)
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

      alert('La ventana de impresión fue bloqueada por el navegador.\n\nSe ha descargado el reporte como HTML. Ábrelo y usa Ctrl+P para imprimirlo.')
    }, 300)
  }, [filteredData, generateHTML, setExpandedHosts, setExpandedPorts, buildJsonPayload])

  const handleSaveFile = async (type: 'md' | 'html' | 'json'): Promise<boolean> => {
    try {
      const extension = type === 'md' ? 'md' : type === 'html' ? 'html' : 'json'
      const exportedAt = new Date().toISOString()

      let content: string
      if (type === 'json') {
        const payload = buildJsonPayload(exportedAt)
        const jsonString = JSON.stringify(payload, null, 2)
        const integrityHash = await sha256Hex(jsonString)
        content = JSON.stringify({ ...payload, hash: integrityHash }, null, 2)
      } else {
        const jsonPayload = JSON.stringify(buildJsonPayload(exportedAt), null, 2)
        const integrityHash = await sha256Hex(jsonPayload)
        content = type === 'md' ? generateMarkdown(integrityHash, exportedAt) : generateHTML(integrityHash, exportedAt)
      }

      const filePath = await save({ defaultPath: `lessso_c2_report_${Date.now()}.${extension}`, filters: [{ name: 'Documento', extensions: [extension] }] })
      
      if (filePath) {
        await writeTextFile(filePath, content)
        alert(`✅ Reporte exportado exitosamente:\n${filePath}`)
        return true 
      }
      return false 
    } catch (e: any) {
      const errorMsg = e.message || String(e);
      if (!errorMsg.toLowerCase().includes('cancel')) alert(`Ocurrió un problema al guardar el archivo:\n${errorMsg}`);
      return false
    }
  }

  const handleImport = async () => {
    try {
      const selected = await open({ filters: [{ name: 'JSON Workspace', extensions: ['json'] }] })
      if (selected && !Array.isArray(selected)) {
        const contents = await readTextFile(selected)
        const parsed = JSON.parse(contents)
        const hosts = Array.isArray(parsed) ? parsed : parsed.hosts
        if (Array.isArray(hosts)) importWorkspace(hosts)
        else alert('Formato de workspace no reconocido.')
      }
    } catch (err: any) {
      const errorMsg = err.message || String(err);
      if (!errorMsg.toLowerCase().includes('cancel')) alert(`Ocurrió un problema al cargar el archivo:\n${errorMsg}`);
    }
  }

  const computeIntegrityHash = useCallback(
    async (exportedAt: string): Promise<string> => {
      const jsonPayload = JSON.stringify(buildJsonPayload(exportedAt), null, 2)
      return sha256Hex(jsonPayload)
    },
    [buildJsonPayload],
  )

  return { generateMarkdown, generateHTML, handlePrint, handleSaveFile, handleImport, computeIntegrityHash, buildJsonPayload }
}
