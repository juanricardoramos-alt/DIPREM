import type { PipelineFila, RankingFila } from "./metas";
import { diasSinActividad } from "./metas";

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
