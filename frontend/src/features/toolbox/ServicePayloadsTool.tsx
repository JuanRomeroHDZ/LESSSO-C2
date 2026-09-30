import { useMemo } from 'react';
import {
  SERVICE_PAYLOADS,
  SERVICE_CATEGORIES,
  type ServiceCategory,
} from '../../core/data/service-payloads';
import {
  serviceToSelectable,
  fuzzyMatch,
  type SelectablePayload,
  type ArsenalPlaceholders,
} from '../../core/data/arsenal-types';

// ==========================================================
// TIPOS DE PROPS
// ----------------------------------------------------------
// Este componente es PRESENTACIONAL: recibe todo del padre.
// El padre (ArsenalLayout) gestiona búsqueda, filtros,
// selección y el panel de detalle.
//
// La conversión ServicePayload → SelectablePayload se hace
// con el mapper OFICIAL `serviceToSelectable` de arsenal-types,
// para no duplicar lógica entre herramientas.
// ==========================================================
interface ServicePayloadsToolProps {
  /** Callback cuando el usuario selecciona un payload */
  onSelect: (payload: SelectablePayload) => void;

  /** ID del payload actualmente seleccionado (formato "service:smb-null-session") */
  selectedId: string | null;

  /** Query de búsqueda (gestionada por el padre) */
  searchQuery: string;

  /**
   * Placeholders para renderizado. Se recibe el subconjunto
   * que este componente necesita (el resto lo ignora el mapper).
   */
  placeholders: Pick<
    ArsenalPlaceholders,
    | 'TARGET'
    | 'USER'
    | 'PASS'
    | 'HASH'
    | 'DOMAIN'
    | 'LHOST'
    | 'LPORT'
    | 'COLLAB'
    | 'PORT'
    | 'INDEX'
    | 'ROLE_NAME'
    | 'INTERFACE'
  >;
}

// ==========================================================
// ORDEN DE CATEGORÍAS PARA RENDERIZADO
// ----------------------------------------------------------
// Agrupamos por "relevancia operativa" en un pentest típico:
// primero lo más usado (AD/SMB), luego app servers, luego
// cloud, etc.
//
// Filtramos contra SERVICE_CATEGORIES para no renderizar
// claves que no existan (defensivo).
// ==========================================================
const CATEGORY_ORDER: ServiceCategory[] = (
  [
    'smb',
    'ldap',
    'winrm',
    'ssh',
    'sql',
    'redis',
    'mongodb',
    'elastic',
    'docker',
    'kubernetes',
    'jndi',
    'tomcat',
    'jenkins',
    'rmi',
    'graphql',
    'ftp',
    'cloud',
  ] as ServiceCategory[]
).filter(c => Object.prototype.hasOwnProperty.call(SERVICE_CATEGORIES, c));

// ==========================================================
// HELPER: convierte los props de placeholders al formato
// completo que espera el mapper `serviceToSelectable`.
//
// El mapper oficial usa `ArsenalPlaceholders` (todos los
// campos), así que aquí rellenamos los que no aplican a
// servicios con valores neutros.
// ==========================================================
function buildFullPlaceholders(
  partial: ServicePayloadsToolProps['placeholders']
): ArsenalPlaceholders {
  return {
    LHOST: partial.LHOST,
    LPORT: partial.LPORT,
    TARGET: partial.TARGET,
    USER: partial.USER,
    PASS: partial.PASS,
    HASH: partial.HASH,
    DOMAIN: partial.DOMAIN,
    COLLAB: partial.COLLAB,
    PORT: partial.PORT,
    PARAM: '',       // No aplica a servicios
    INDEX: partial.INDEX,
    ROLE_NAME: partial.ROLE_NAME,
    INTERFACE: partial.INTERFACE,
  };
}

// ==========================================================
// COMPONENTE
// ==========================================================
export function ServicePayloadsTool({
  onSelect,
  selectedId,
  searchQuery,
  placeholders,
}: ServicePayloadsToolProps) {
  // ========================================================
  // Placeholders completos (memoizado)
  // ========================================================
  const fullPlaceholders = useMemo(
    () => buildFullPlaceholders(placeholders),
    [placeholders]
  );

  // ========================================================
  // Filtrar payloads por búsqueda (fuzzy, oficial)
  // --------------------------------------------------------
  // Usamos fuzzyMatch de arsenal-types: buscamos en el
  // SelectablePayload ya mapeado (nombre, preview, tags, tool).
  // ========================================================
  const filteredPayloads = useMemo(() => {
    if (!searchQuery.trim()) return SERVICE_PAYLOADS;

    return SERVICE_PAYLOADS.filter(service => {
      const selectable = serviceToSelectable(service, fullPlaceholders);
      return fuzzyMatch(searchQuery, selectable);
    });
  }, [searchQuery, fullPlaceholders]);

  // ========================================================
  // Agrupar por categoría
  // ========================================================
  const groupedPayloads = useMemo(() => {
    const groups: Partial<Record<ServiceCategory, typeof SERVICE_PAYLOADS>> = {};
    filteredPayloads.forEach(p => {
      if (!groups[p.category]) groups[p.category] = [];
      groups[p.category]!.push(p);
    });
    return groups;
  }, [filteredPayloads]);

  // ========================================================
  // Handler: click en un payload
  // ========================================================
  const handleClick = (service: (typeof SERVICE_PAYLOADS)[number]) => {
    onSelect(serviceToSelectable(service, fullPlaceholders));
  };

  // ========================================================
  // Render: empty state
  // ========================================================
  if (filteredPayloads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <span className="text-3xl mb-2 opacity-40">🔍</span>
        <p className="text-[11px] text-slate-500 italic">
          {searchQuery
            ? `Sin resultados para "${searchQuery}"`
            : 'Sin payloads de servicios disponibles'}
        </p>
      </div>
    );
  }

  // ========================================================
  // Render: lista agrupada
  // ========================================================
  return (
    <div className="flex flex-col h-full">
      {CATEGORY_ORDER.map(catKey => {
        const payloads = groupedPayloads[catKey];
        if (!payloads || payloads.length === 0) return null;

        const catMeta = SERVICE_CATEGORIES[catKey];
        if (!catMeta) return null;

        return (
          <div key={catKey} className="mb-2 last:mb-0">
            {/* Cabecera del grupo (sticky) */}
            <div className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900/95 backdrop-blur-sm px-2 py-1 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <span className="text-xs">{catMeta.icon}</span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                {catMeta.label}
              </span>
              <span className="text-[8px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-500 px-1.5 rounded-full">
                {payloads.length}
              </span>
            </div>

            {/* Payloads del grupo */}
            <div className="py-1">
              {payloads.map(service => {
                const selectable = serviceToSelectable(service, fullPlaceholders);
                const isSelected = selectedId === selectable.id;

                return (
                  <button
                    key={service.id}
                    onClick={() => handleClick(service)}
                    title={selectable.fullContent}
                    className={`w-full text-left px-3 py-1.5 border-l-2 transition-colors flex items-start gap-2 ${
                      isSelected
                        ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-500'
                        : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold truncate ${
                            isSelected
                              ? 'text-cyan-600 dark:text-cyan-400'
                              : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {service.name}
                        </span>
                        {service.tool && (
                          <span className="text-[7px] font-bold px-1 py-0.5 rounded shrink-0 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono">
                            {service.tool}
                          </span>
                        )}
                      </div>
                      <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 truncate">
                        {selectable.preview}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
