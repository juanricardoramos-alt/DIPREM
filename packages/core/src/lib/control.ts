import type { Lead, PrioridadProyecto } from "../types/dominio";
import type { PipelineFila, RankingFila } from "./metas";
import { diasSinActividad } from "./metas";
import { ORDEN_PRIORIDAD } from "./etiquetas";

/**
 * Panel de Control del dueño: reglas e interpretación de las vistas
 * v_gestion_proyectos y v_historial_asignaciones (migración 0006).
 */

/** Oportunidad "en riesgo": abierta y sin actividad hace más de N días. */
export const DIAS_RIESGO_OPORTUNIDAD = 10;
/** Proyecto asignado "sin gestión": sin actividad del ejecutivo hace N días o más. */
export const DIAS_PROYECTO_SIN_GESTION = 7;

/** Fila de v_gestion_proyectos. */
export interface FilaGestionProyecto {
  id: string;
  proyecto: string;
  empresa: string;
  estado: "asignado" | "convertido";
  asignado_a: string | null;
  ejecutivo: string | null;
  asignado_en: string | null;
  lead_id: string | null;
  ultima_gestion: string | null;
  /** Desde la migración 0007; antes vienen undefined. */
  prioridad?: PrioridadProyecto;
  fecha_limite_contacto?: string | null;
  nota_asignacion?: string | null;
  dias_alerta_sin_gestion?: number;
}

/** Fila de v_historial_asignaciones. */
export interface FilaAsignacion {
  id: string;
  proyecto: string;
  empresa: string;
  estado: "asignado" | "convertido" | "sin_asignar";
  asignado_en: string;
  asignado_a: string | null;
  asignado_a_nombre: string | null;
  asignado_por: string | null;
  asignado_por_nombre: string | null;
  lead_id: string | null;
}

/** Lunes 00:00 de la semana de la fecha dada (semana comercial local). */
export function inicioSemana(referencia: Date = new Date()): Date {
  const fecha = new Date(referencia);
  fecha.setHours(0, 0, 0, 0);
  const dia = fecha.getDay(); // 0 = domingo
  fecha.setDate(fecha.getDate() - ((dia + 6) % 7));
  return fecha;
}

/** Métrica 1: proyectos asignados vs trabajados esta semana. */
export function resumenProyectos(
  filas: FilaGestionProyecto[],
  ahora: Date = new Date(),
): { asignados: number; trabajadosSemana: number } {
  const desde = inicioSemana(ahora).getTime();
  const trabajados = filas.filter(
    (f) => f.ultima_gestion && new Date(f.ultima_gestion).getTime() >= desde,
  ).length;
  return { asignados: filas.length, trabajadosSemana: trabajados };
}

/** Días sin gestión de un proyecto asignado (desde la asignación si nunca hubo). */
export function diasSinGestionProyecto(
  fila: Pick<FilaGestionProyecto, "ultima_gestion" | "asignado_en">,
  ahora: Date = new Date(),
): number {
  const referencia = fila.ultima_gestion ?? fila.asignado_en;
  if (!referencia) return 0;
  return Math.max(
    0,
    Math.floor((ahora.getTime() - new Date(referencia).getTime()) / 86_400_000),
  );
}

/** Proyectos asignados sin gestión en los últimos 7 días, del más abandonado al menos. */
export function proyectosSinGestion(
  filas: FilaGestionProyecto[],
  ahora: Date = new Date(),
): (FilaGestionProyecto & { dias: number })[] {
  return filas
    .filter((f) => f.estado === "asignado")
    .map((f) => ({ ...f, dias: diasSinGestionProyecto(f, ahora) }))
    .filter((f) => f.dias >= DIAS_PROYECTO_SIN_GESTION)
    .sort((a, b) => b.dias - a.dias);
}

/**
 * ¿La asignación está vencida? Sin gestión más allá de su umbral configurado
 * o con la fecha límite de primer contacto pasada y sin gestión alguna.
 */
export function estaVencido(
  fila: Pick<
    FilaGestionProyecto,
    "ultima_gestion" | "asignado_en" | "dias_alerta_sin_gestion" | "fecha_limite_contacto" | "estado"
  >,
  ahora: Date = new Date(),
): boolean {
  if (fila.estado !== "asignado") return false;
  const dias = diasSinGestionProyecto(fila, ahora);
  if (dias >= (fila.dias_alerta_sin_gestion ?? 5)) return true;
  if (
    fila.fecha_limite_contacto &&
    !fila.ultima_gestion &&
    ahora.getTime() > new Date(`${fila.fecha_limite_contacto}T23:59:59`).getTime()
  ) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Información de asignación que viaja con el lead (atributos jsonb)
// ---------------------------------------------------------------------------
export interface InfoAsignacionLead {
  proyecto_nombre: string | null;
  prioridad: PrioridadProyecto | null;
  fecha_limite_contacto: string | null;
  nota_asignacion: string | null;
}

const PRIORIDADES: PrioridadProyecto[] = ["alta", "media", "baja"];

/** Lee prioridad, fecha límite y nota del dueño desde lead.atributos. */
export function infoAsignacionLead(
  lead: Pick<Lead, "atributos">,
): InfoAsignacionLead | null {
  const atributos = lead.atributos;
  if (!atributos || typeof atributos !== "object") return null;
  const prioridad = PRIORIDADES.includes(atributos.prioridad as PrioridadProyecto)
    ? (atributos.prioridad as PrioridadProyecto)
    : null;
  const info: InfoAsignacionLead = {
    proyecto_nombre:
      typeof atributos.proyecto_nombre === "string" ? atributos.proyecto_nombre : null,
    prioridad,
    fecha_limite_contacto:
      typeof atributos.fecha_limite_contacto === "string"
        ? atributos.fecha_limite_contacto
        : null,
    nota_asignacion:
      typeof atributos.nota_asignacion === "string" ? atributos.nota_asignacion : null,
  };
  if (!info.proyecto_nombre && !info.prioridad && !info.fecha_limite_contacto && !info.nota_asignacion) {
    return null;
  }
  return info;
}

/** ¿Fecha límite de primer contacto ya pasada? */
export function fechaLimiteVencida(
  fechaLimite: string | null | undefined,
  ahora: Date = new Date(),
): boolean {
  if (!fechaLimite) return false;
  return ahora.getTime() > new Date(`${fechaLimite}T23:59:59`).getTime();
}

/** Leads nuevos ordenados: prioridad alta primero, luego fecha límite más próxima. */
export function ordenarLeadsPorPrioridad<T extends Pick<Lead, "atributos" | "creado_en">>(
  leads: T[],
): T[] {
  return [...leads].sort((a, b) => {
    const infoA = infoAsignacionLead(a);
    const infoB = infoAsignacionLead(b);
    const prioridadA = ORDEN_PRIORIDAD[infoA?.prioridad ?? "media"];
    const prioridadB = ORDEN_PRIORIDAD[infoB?.prioridad ?? "media"];
    if (prioridadA !== prioridadB) return prioridadA - prioridadB;
    const limiteA = infoA?.fecha_limite_contacto ?? "9999-12-31";
    const limiteB = infoB?.fecha_limite_contacto ?? "9999-12-31";
    if (limiteA !== limiteB) return limiteA.localeCompare(limiteB);
    return new Date(b.creado_en).getTime() - new Date(a.creado_en).getTime();
  });
}

/** Métrica 2: ejecutivo con mejor gestión del mes (null si nadie registró). */
export function mejorEjecutivo(ranking: RankingFila[]): RankingFila | null {
  const conGestion = ranking.filter((r) => Number(r.actividades_mes) > 0);
  if (conGestion.length === 0) return null;
  return conGestion.reduce((mejor, fila) =>
    Number(fila.actividades_mes) > Number(mejor.actividades_mes) ? fila : mejor,
  );
}

/** Métrica 3: oportunidades abiertas sin actividad hace más de 10 días. */
export function oportunidadesEnRiesgo<T extends PipelineFila>(
  filas: T[],
  ahora: Date = new Date(),
): (T & { dias_sin_actividad: number })[] {
  return filas
    .filter((f) => !f.cerrada_en)
    .map((f) => ({ ...f, dias_sin_actividad: diasSinActividad(f, ahora) }))
    .filter((f) => f.dias_sin_actividad > DIAS_RIESGO_OPORTUNIDAD)
    .sort((a, b) => b.dias_sin_actividad - a.dias_sin_actividad);
}
