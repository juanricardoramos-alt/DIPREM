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
