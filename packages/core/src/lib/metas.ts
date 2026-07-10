import type { Moneda, TipoMeta } from "../types/dominio";

/** Fila de v_avance_metas: meta + avance real calculado por la BD. */
export interface MetaAvance {
  id: string;
  usuario_id: string;
  ejecutivo: string;
  equipo_id: string | null;
  periodo: string; // 'YYYY-MM'
  tipo: TipoMeta;
  objetivo: number;
  moneda: Moneda | null;
  avance: number;
}

/** Fila de v_ranking_equipo. */
export interface RankingFila {
  usuario_id: string;
  nombre: string;
  rol: string;
  equipo_id: string | null;
  equipo: string | null;
  pais: string | null;
  actividades_mes: number;
  actividades_hoy: number;
  oportunidades_abiertas: number;
  adjudicadas_mes: number;
  perdidas_mes: number;
  nuevas_mes: number;
  /** Solo con la migración 0006 (actualizacion_control.sql); antes viene undefined. */
  actividades_7d?: number;
}

/** Fila de v_pipeline_detalle. */
export interface PipelineFila {
  id: string;
  nombre: string;
  monto: number;
  moneda: Moneda;
  modalidad_contrato: string;
  probabilidad: number | null;
  creado_en: string;
  cerrada_en: string | null;
  ultimo_contacto_en: string | null;
  fecha_cierre_estimada: string | null;
  etapa_id: string;
  etapa: string;
  etapa_orden: number;
  es_ganada: boolean;
  es_perdida: boolean;
  propietario_id: string;
  ejecutivo: string;
  equipo_id: string | null;
  equipo: string | null;
  pais: string | null;
  cuenta: string;
  vertical: string;
}

export const ETIQUETAS_TIPO_META: Record<TipoMeta, string> = {
  monto_adjudicado: "Monto adjudicado",
  propuestas_enviadas: "Propuestas enviadas",
  actividades: "Actividades realizadas",
  oportunidades_nuevas: "Oportunidades nuevas",
};

export const TIPOS_META: TipoMeta[] = [
  "monto_adjudicado",
  "propuestas_enviadas",
  "actividades",
  "oportunidades_nuevas",
];

/** Periodo 'YYYY-MM' del mes en curso (o del Date dado). */
export function periodoActual(fecha: Date = new Date()): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
}

export function etiquetaPeriodo(periodo: string): string {
  const [anio, mes] = periodo.split("-").map(Number);
  const fecha = new Date(anio ?? 2026, (mes ?? 1) - 1, 1);
  return fecha.toLocaleDateString("es", { month: "long", year: "numeric" });
}

/** Fracción del mes transcurrida (0..1) para prorratear la meta. */
export function fraccionMesTranscurrida(fecha: Date = new Date()): number {
  const diasMes = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();
  return Math.min(1, fecha.getDate() / diasMes);
}

export type Semaforo = "verde" | "ambar" | "rojo";

/**
 * Semáforo contra el ritmo esperado del mes:
 *   verde ≥ 100% de lo esperado a la fecha · ámbar ≥ 70% · rojo < 70%.
 * Si el periodo NO es el mes en curso, se compara contra la meta completa.
 */
export function semaforoMeta(
  meta: Pick<MetaAvance, "avance" | "objetivo" | "periodo">,
  fecha: Date = new Date(),
): Semaforo {
  if (meta.objetivo <= 0) return "verde";
  const esMesActual = meta.periodo === periodoActual(fecha);
  const esperado = meta.objetivo * (esMesActual ? fraccionMesTranscurrida(fecha) : 1);
  if (esperado <= 0) return "verde";
  const razon = Number(meta.avance) / esperado;
  if (razon >= 1) return "verde";
  if (razon >= 0.7) return "ambar";
  return "rojo";
}

/** % de cumplimiento de la meta completa (0..100+, tope visual en la UI). */
export function porcentajeMeta(meta: Pick<MetaAvance, "avance" | "objetivo">): number {
  if (meta.objetivo <= 0) return 100;
  return Math.round((Number(meta.avance) / Number(meta.objetivo)) * 100);
}

/** Semáforo global de un ejecutivo = el peor de sus metas del mes (null sin metas). */
export function semaforoGlobal(
  metas: Pick<MetaAvance, "avance" | "objetivo" | "periodo">[],
  fecha: Date = new Date(),
): Semaforo | null {
  if (!metas.length) return null;
  const orden: Semaforo[] = ["rojo", "ambar", "verde"];
  return orden.find((s) => metas.some((m) => semaforoMeta(m, fecha) === s)) ?? "verde";
}

/** Umbral de oportunidad estancada (regla de negocio pedida por gerencia). */
export const DIAS_ESTANCADA = 14;

export function diasSinActividad(
  fila: Pick<PipelineFila, "ultimo_contacto_en" | "creado_en">,
  ahora: Date = new Date(),
): number {
  const ref = fila.ultimo_contacto_en ?? fila.creado_en;
  return Math.max(0, Math.floor((ahora.getTime() - new Date(ref).getTime()) / 86_400_000));
}

export function estancadas<T extends PipelineFila>(filas: T[], ahora: Date = new Date()) {
  return filas
    .filter((f) => !f.cerrada_en)
    .map((f) => ({ ...f, dias_sin_actividad: diasSinActividad(f, ahora) }))
    .filter((f) => f.dias_sin_actividad > DIAS_ESTANCADA)
    .sort((a, b) => b.dias_sin_actividad - a.dias_sin_actividad);
}
