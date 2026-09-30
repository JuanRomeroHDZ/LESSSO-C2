// ==========================================================
// LESSSO C2 — Tipos unificados del Arsenal
// ----------------------------------------------------------
// Interfaz normalizada que TODOS los payloads del Arsenal
// (shells, vulns, services) implementan, para que el layout
// orquestador (ArsenalLayout) pueda trabajar con ellos sin
// conocer su origen específico.
//
// Cada dataset tiene una función `toSelectable()` que mapea
// su tipo nativo a este tipo común.
// ==========================================================

import type { ReverseShell } from './reverse-shells';
import type { VulnPayload } from './vuln-payloads';
import type { ServicePayload } from './service-payloads';
import { renderShell } from './reverse-shells';
import { renderVulnPayload } from './vuln-payloads';
import { renderServicePayload } from './service-payloads';

// ==========================================================
// Tipo unificado
// ==========================================================
export type PayloadSource = 'shell' | 'vuln' | 'service';
export type PayloadNoise = 'stealth' | 'normal' | 'noisy';

export interface SelectablePayload {
  /** ID único global (formato: "shell:bash-tcp", "vuln:sqli-auth-bypass") */
  id: string;

  /** ID original en su dataset de origen */
  sourceId: string;

  /** Tipo de origen */
  category: PayloadSource;

  /** Subcategoría (plataforma para shells, tipo vuln, tipo servicio) */
  subcategory: string;

  /** Nombre legible */
  name: string;

  /** Texto corto para la lista (una línea, sin saltos) */
  preview: string;

  /** Contenido completo (payload renderizado o comando final) */
  fullContent: string;

  /** Descripción opcional */
  description?: string;

  /** Tags para búsqueda */
  tags?: string[];

  /** Herramienta (solo para servicios) */
  tool?: string;

  /** Nivel de ruido (solo para vulns) */
  noise?: PayloadNoise;

  /** Plataforma (solo para shells) */
  platform?: string;

  /** Puede enviarse a un ListenerTool (true para shells reverse) */
  canSendToListener: boolean;

  /** Puede enviarse a la bitácora */
  canSendToNotes: boolean;
}

// ==========================================================
// Tipos de variables para renderizado (placeholders)
// ==========================================================
export interface ArsenalPlaceholders {
  LHOST: string;
  LPORT: string;
  TARGET: string;
  USER: string;
  PASS: string;
  HASH: string;
  DOMAIN: string;
  COLLAB: string;
  PORT: string;
  PARAM: string;
  INDEX: string;
  ROLE_NAME: string;
  INTERFACE: string;
}

export const DEFAULT_PLACEHOLDERS: ArsenalPlaceholders = {
  LHOST: '10.10.14.5',
  LPORT: '4444',
  TARGET: '{TARGET}',
  USER: 'administrator',
  PASS: '{PASS}',
  HASH: '{HASH}',
  DOMAIN: '{DOMAIN}',
  COLLAB: '{COLLAB}',
  PORT: '{PORT}',
  PARAM: 'id',
  INDEX: '{INDEX}',
  ROLE_NAME: '{ROLE_NAME}',
  INTERFACE: 'tun0',
};

// ==========================================================
// Mappers: de tipo nativo → SelectablePayload
// ==========================================================

/**
 * Convierte un ReverseShell en un SelectablePayload.
 * El payload se renderiza con los placeholders actuales.
 */
export function shellToSelectable(
  shell: ReverseShell,
  placeholders: ArsenalPlaceholders
): SelectablePayload {
  const rendered = renderShell(shell, placeholders.LHOST, placeholders.LPORT);

  return {
    id: `shell:${shell.id}`,
    sourceId: shell.id,
    category: 'shell',
    subcategory: shell.platform,
    name: shell.name,
    preview: rendered.split('\n')[0].slice(0, 100),
    fullContent: rendered,
    description: shell.description,
    tags: shell.tags,
    platform: shell.platform,
    canSendToListener: shell.type === 'reverse' || shell.type === 'bind',
    canSendToNotes: true,
  };
}

/**
 * Convierte un VulnPayload en un SelectablePayload.
 * El payload se renderiza con los placeholders actuales.
 */
export function vulnToSelectable(
  vuln: VulnPayload,
  placeholders: ArsenalPlaceholders
): SelectablePayload {
  const rendered = renderVulnPayload(vuln, {
    TARGET: placeholders.TARGET,
    COLLAB: placeholders.COLLAB,
    PARAM: placeholders.PARAM,
  });

  return {
    id: `vuln:${vuln.id}`,
    sourceId: vuln.id,
    category: 'vuln',
    subcategory: vuln.category,
    name: vuln.name,
    preview: rendered.split('\n')[0].slice(0, 100),
    fullContent: rendered,
    description: vuln.description,
    tags: vuln.tags,
    noise: vuln.noise,
    canSendToListener: false, // Las vulns no se envían a listener
    canSendToNotes: true,
  };
}

/**
 * Convierte un ServicePayload en un SelectablePayload.
 * El comando se renderiza con los placeholders actuales.
 */
export function serviceToSelectable(
  service: ServicePayload,
  placeholders: ArsenalPlaceholders
): SelectablePayload {
  const rendered = renderServicePayload(service, {
    TARGET: placeholders.TARGET,
    USER: placeholders.USER,
    PASS: placeholders.PASS,
    HASH: placeholders.HASH,
    DOMAIN: placeholders.DOMAIN,
    LHOST: placeholders.LHOST,
    LPORT: placeholders.LPORT,
    COLLAB: placeholders.COLLAB,
    PORT: placeholders.PORT,
    INDEX: placeholders.INDEX,
    ROLE_NAME: placeholders.ROLE_NAME,
    INTERFACE: placeholders.INTERFACE,
  });

  return {
    id: `service:${service.id}`,
    sourceId: service.id,
    category: 'service',
    subcategory: service.category,
    name: service.name,
    preview: rendered.split('\n')[0].slice(0, 100),
    fullContent: rendered,
    description: service.description,
    tags: service.tags,
    tool: service.tool,
    canSendToListener: false,
    canSendToNotes: true,
  };
}

// ==========================================================
// Helpers de categorización para la UI
// ==========================================================

/** Metadata visual por categoría de origen */
export const CATEGORY_META: Record<PayloadSource, { label: string; icon: string; color: string }> = {
  shell:   { label: 'Shells',   icon: '🐚', color: 'emerald' },
  vuln:    { label: 'Vulns',    icon: '💉', color: 'red' },
  service: { label: 'Services', icon: '🎯', color: 'cyan' },
};

/** Metadata visual por nivel de ruido */
export const NOISE_META: Record<PayloadNoise, { label: string; color: string; bg: string }> = {
  stealth: { label: 'Sigiloso', color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  normal:  { label: 'Normal',   color: 'text-yellow-500',  bg: 'bg-yellow-100 dark:bg-yellow-900/30' },
  noisy:   { label: 'Ruidoso',  color: 'text-red-500',     bg: 'bg-red-100 dark:bg-red-900/30' },
};

// ==========================================================
// Búsqueda fuzzy simple (matchea "bht" contra "bash-tcp")
// ==========================================================
export function fuzzyMatch(query: string, payload: SelectablePayload): boolean {
  if (!query.trim()) return true;

  const q = query.toLowerCase();
  const searchable = [
    payload.name,
    payload.preview,
    payload.subcategory,
    payload.tool || '',
    ...(payload.tags || []),
  ].join(' ').toLowerCase();

  // 1. Match directo
  if (searchable.includes(q)) return true;

  // 2. Fuzzy match: cada carácter del query aparece en orden
  let qIdx = 0;
  for (let i = 0; i < searchable.length && qIdx < q.length; i++) {
    if (searchable[i] === q[qIdx]) qIdx++;
  }
  return qIdx === q.length;
}

// ==========================================================
// Generador de ID de selección
// ==========================================================
export function selectionId(category: PayloadSource, sourceId: string): string {
  return `${category}:${sourceId}`;
}
