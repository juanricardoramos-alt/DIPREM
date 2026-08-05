import type { SupabaseClient } from "@supabase/supabase-js";
import type { FilaAsignacion, FilaGestionProyecto } from "@diprem/core";

/**
 * Panel de Control del dueño (vistas de la migración 0006).
 * Requiere haber corrido supabase/deploy/actualizacion_control.sql.
 */

const AVISO_SCRIPT =
  "Falta actualizar la base de datos: ejecuta supabase/deploy/actualizacion_control.sql " +
  "en el SQL Editor de Supabase (ver docs/DEPLOY.md).";

function lanzar(error: { message: string } | null): void {
  if (!error) return;
  if (/does not exist|schema cache/i.test(error.message)) {
    throw new Error(AVISO_SCRIPT);
  }
  throw new Error(error.message);
}

/** Proyectos asignados/convertidos con su última gestión real. */
export async function listarGestionProyectos(
  sb: SupabaseClient,
): Promise<FilaGestionProyecto[]> {
  const { data, error } = await sb
    .from("v_gestion_proyectos")
    .select("*")
    .limit(2000);
  lanzar(error);
  return (data ?? []) as FilaGestionProyecto[];
}

/** Historial: quién asignó qué proyecto, a quién y cuándo. */
export async function listarHistorialAsignaciones(
  sb: SupabaseClient,
): Promise<FilaAsignacion[]> {
  const { data, error } = await sb
    .from("v_historial_asignaciones")
    .select("*")
    .order("asignado_en", { ascending: false })
    .limit(500);
  lanzar(error);
  return (data ?? []) as FilaAsignacion[];
}

/** Botón "Recordar": crea una notificación in-app para el ejecutivo responsable. */
export async function recordarProyecto(
  sb: SupabaseClient,
  proyectoId: string,
): Promise<void> {
  const { error } = await sb.rpc("recordar_proyecto", { p_proyecto_id: proyectoId });
  lanzar(error);
}

// ---------------------------------------------------------------------------
// Control por RESULTADO (vistas de la migración 0018) — no por actividad
// ---------------------------------------------------------------------------

export interface FilaCobertura {
  usuario_id: string;
  nombre: string;
  rol: string;
  equipo_id: string | null;
  equipo: string | null;
  cartera: number;
  gestionadas_30d: number;
  cobertura_pct: number | null;
}

/** Cobertura: % de la cartera con gestión en 30 días (peor primero). */
export async function listarControlCobertura(sb: SupabaseClient): Promise<FilaCobertura[]> {
  const { data, error } = await sb.from("v_control_cobertura").select("*");
  lanzar(error);
  return (data ?? []) as FilaCobertura[];
}

export interface FilaCritica {
  cuenta_id: string;
  razon_social: string;
  rol_mercado: string | null;
  propietario_id: string;
  ejecutivo: string;
  equipo_id: string | null;
  ultima_gestion: string | null;
  dias_sin_gestion: number;
  n_proyectos: number;
  capex_max: number | null;
  score_max: number | null;
}

/** Cuentas asignadas con su tiempo sin gestión y el CAPEX vinculado. */
export async function listarControlCriticas(sb: SupabaseClient): Promise<FilaCritica[]> {
  const { data, error } = await sb.from("v_control_criticas").select("*").limit(5000);
  lanzar(error);
  return (data ?? []) as FilaCritica[];
}

export interface FilaAvanceDecisor {
  cuenta_id: string;
  razon_social: string;
  propietario_id: string;
  ejecutivo: string;
  equipo_id: string | null;
  logrado_en: string;
  creado_por: string;
  autor: string | null;
}

/** Cuentas cuyo PRIMER decisor técnico lo consiguió una persona. */
export async function listarControlAvanceDecisor(
  sb: SupabaseClient,
): Promise<FilaAvanceDecisor[]> {
  const { data, error } = await sb
    .from("v_control_avance_decisor")
    .select("*")
    .order("logrado_en", { ascending: false })
    .limit(1000);
  lanzar(error);
  return (data ?? []) as FilaAvanceDecisor[];
}

export interface FilaEmbudo {
  oportunidad_id: string;
  oportunidad: string;
  monto: number;
  moneda: string;
  propietario_id: string;
  ejecutivo: string | null;
  movido_por_id: string | null;
  movido_por: string | null;
  movido_en: string;
  de_etapa: string;
  a_etapa: string;
  avance: boolean;
}

/** Oportunidades que cambiaron de etapa (desde auditoría). */
export async function listarControlEmbudo(
  sb: SupabaseClient,
  desdeIso?: string,
): Promise<FilaEmbudo[]> {
  let q = sb
    .from("v_control_embudo")
    .select("*")
    .order("movido_en", { ascending: false })
    .limit(1000);
  if (desdeIso) q = q.gte("movido_en", desdeIso);
  const { data, error } = await q;
  lanzar(error);
  return (data ?? []) as FilaEmbudo[];
}

export interface FilaHuerfana {
  oportunidad_id: string;
  oportunidad: string;
  monto: number;
  moneda: string;
  cuenta_id: string;
  razon_social: string;
  propietario_id: string;
  ejecutivo: string;
  equipo_id: string | null;
  etapa: string;
  dias_sin_contacto: number;
}

/** Oportunidades abiertas SIN próximo paso con fecha: abandono. */
export async function listarControlHuerfanas(sb: SupabaseClient): Promise<FilaHuerfana[]> {
  const { data, error } = await sb
    .from("v_control_huerfanas")
    .select("*")
    .order("dias_sin_contacto", { ascending: false })
    .limit(1000);
  lanzar(error);
  return (data ?? []) as FilaHuerfana[];
}

export interface FilaRespuesta {
  usuario_id: string;
  ejecutivo: string;
  equipo_id: string | null;
  gestiones_30d: number;
  con_respuesta: number;
  sin_respuesta: number;
  sin_registro: number;
  tasa_pct: number | null;
}

/** Tasa de respuesta 30d: efectividad de la gestión, no conteo. */
export async function listarControlRespuesta(sb: SupabaseClient): Promise<FilaRespuesta[]> {
  const { data, error } = await sb.from("v_control_respuesta").select("*");
  lanzar(error);
  return (data ?? []) as FilaRespuesta[];
}
