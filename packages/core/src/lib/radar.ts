import type { EtapaProyecto, ProyectoMercado } from "../types/dominio";

/**
 * Radar de Proyectos: segmentación aprobada (docs/RADAR-PROYECTOS.md).
 * La ventana caliente replica en_ventana_caliente() de la BD — una sola
 * definición conceptual, dos espejos (SQL manda; esto es presentación).
 */

export const ETAPAS_VENTANA: EtapaProyecto[] = [
  "ingenieria_detalle",
  "en_licitacion",
  "construccion",
  "comisionamiento",
];

export const ETAPAS_TEMPRANAS: EtapaProyecto[] = [
  "perfil",
  "prefactibilidad",
  "factibilidad",
];

export type SegmentoRadar =
  | "pipeline"       // ventana caliente con contactos en la cuenta
  | "prospeccion"    // ventana caliente SIN contactos: urgente, no malo
  | "activo_p2"      // perfil→factibilidad: compran SEIA/permisos AHORA
  | "om_hse"         // operación: P2 recurrente
  | "watchlist"      // exploración / rechazado (reversible)
  | "por_clasificar" // sin etapa (incl. rediseñado → prioridad alta)
  | "descarte";      // desistido / suspendido

export const ORDEN_SEGMENTOS: SegmentoRadar[] = [
  "pipeline",
  "prospeccion",
  "activo_p2",
  "om_hse",
  "watchlist",
  "por_clasificar",
  "descarte",
];

export function enVentanaCaliente(etapa: EtapaProyecto | null | undefined): boolean {
  return !!etapa && ETAPAS_VENTANA.includes(etapa);
}

/** Mejor bucket de contactos de la cuenta, leído del desglose del score. */
export function contactosDelProyecto(
  p: Pick<ProyectoMercado, "score_detalle">,
): "decisor" | "gestor" | "puerta" | "ninguno" {
  const detalle = p.score_detalle?.factores?.contactabilidad?.detalle ?? "";
  const base = detalle.split(" — ")[0]?.trim();
  return base === "decisor" || base === "gestor" || base === "puerta"
    ? base
    : "ninguno";
}

export function segmentoDelProyecto(
  p: Pick<ProyectoMercado, "etapa" | "es_watchlist" | "score_detalle">,
): SegmentoRadar {
  if (p.es_watchlist) return "watchlist";
  const etapa = p.etapa ?? null;
  if (!etapa) return "por_clasificar";
  if (enVentanaCaliente(etapa)) {
    return contactosDelProyecto(p) === "ninguno" ? "prospeccion" : "pipeline";
  }
  if (ETAPAS_TEMPRANAS.includes(etapa)) return "activo_p2";
  if (etapa === "operacion") return "om_hse";
  if (etapa === "paralizado" || etapa === "cerrado") return "descarte";
  // ingenieria_basica: rumbo a la ventana — se gestiona con el pipeline
  return contactosDelProyecto(p) === "ninguno" ? "prospeccion" : "pipeline";
}

/** Buckets de rol de contacto (0016/0017) para lógica de UI. */
export function bucketDeRol(rol: string | undefined | null): string {
  switch (rol) {
    case "gerente_proyecto":
    case "gerente_construccion":
    case "calidad_qaqc":
    case "hse":
    case "decisor_tecnico":
      return "decisor_tecnico";
    case "contratos_abastecimiento":
      return "gestor_compra";
    case "puerta_entrada":
      return "puerta_entrada";
    default:
      return "sin_clasificar";
  }
}
