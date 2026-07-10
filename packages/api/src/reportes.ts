import type { SupabaseClient } from "@supabase/supabase-js";
import type { FilaConversion, RegistroAuditoria } from "@diprem/core";

/**
 * Reportes del dueño (migración 0009).
 * Requiere haber corrido supabase/deploy/actualizacion_reportes.sql.
 */

const AVISO_SCRIPT =
  "Falta actualizar la base de datos: ejecuta supabase/deploy/actualizacion_reportes.sql " +
  "en el SQL Editor de Supabase (ver docs/DEPLOY.md).";

function lanzar(error: { message: string } | null): void {
  if (!error) return;
  if (/does not exist|schema cache/i.test(error.message)) {
    throw new Error(AVISO_SCRIPT);
  }
  throw new Error(error.message);
}

/** Embudo de conversión de proyectos asignados (v_conversion_proyectos). */
export async function listarConversionProyectos(
  sb: SupabaseClient,
): Promise<FilaConversion[]> {
  const { data, error } = await sb
    .from("v_conversion_proyectos")
    .select("*")
    .order("asignado_en", { ascending: false })
    .limit(5000);
  lanzar(error);
  return (data ?? []) as FilaConversion[];
}

/**
 * Cambios registrados sobre oportunidades en un rango (tabla de auditoría).
 * La RLS ya limita: admin ve todo; gerente, lo de su equipo.
 */
export async function listarCambiosOportunidades(
  sb: SupabaseClient,
  desdeISO: string,
  hastaISO: string,
): Promise<RegistroAuditoria[]> {
  const { data, error } = await sb
    .from("auditoria")
    .select("creado_en, usuario_id, cambios")
    .eq("entidad", "oportunidades")
    .eq("accion", "UPDATE")
    .gte("creado_en", desdeISO)
    .lt("creado_en", hastaISO)
    .limit(3000);
  lanzar(error);
  return (data ?? []) as RegistroAuditoria[];
}
