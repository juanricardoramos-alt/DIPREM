import type { SupabaseClient } from "@supabase/supabase-js";
import type { Actividad, DistribucionGestion, GestionContacto, Lead } from "@diprem/core";

/**
 * Análisis de gestión por contacto (lead/cuenta) y por ejecutivo.
 * Vistas de la migración 0005 (supabase/deploy/actualizacion_mercado.sql).
 */

const AVISO_SCRIPT =
  "Falta actualizar la base de datos: ejecuta supabase/deploy/actualizacion_mercado.sql " +
  "en el SQL Editor de Supabase (ver docs/DEPLOY.md).";

function lanzar(error: { message: string } | null): void {
  if (!error) return;
  if (/does not exist|schema cache/i.test(error.message)) {
    throw new Error(AVISO_SCRIPT);
  }
  throw new Error(error.message);
}

const SELECT_ACTIVIDAD_GESTION =
  "*, propietario:usuarios!actividades_propietario_id_fkey(nombre)," +
  " contacto:contactos!actividades_contacto_id_fkey(nombre)," +
  " oportunidad:oportunidades!actividades_oportunidad_id_fkey(nombre)";

/** Todas las gestiones (completadas y pendientes) de un lead o una cuenta. */
export async function actividadesDeEntidad(
  sb: SupabaseClient,
  entidad: "lead" | "cuenta",
  entidadId: string,
): Promise<Actividad[]> {
  const columna = entidad === "lead" ? "lead_id" : "cuenta_id";
  const { data, error } = await sb
    .from("actividades")
    .select(SELECT_ACTIVIDAD_GESTION)
    .eq(columna, entidadId)
    .neq("estado", "cancelada")
    .order("completada_en", { ascending: false, nullsFirst: true })
    .order("creado_en", { ascending: false })
    .limit(500);
  lanzar(error);
  return (data ?? []) as unknown as Actividad[];
}

/** Leads o cuentas activas con su última gestión (v_gestion_contactos). */
export async function listarGestionContactos(
  sb: SupabaseClient,
): Promise<GestionContacto[]> {
  const { data, error } = await sb
    .from("v_gestion_contactos")
    .select("*")
    .limit(5000);
  lanzar(error);
  return (data ?? []) as GestionContacto[];
}

/** Gestiones por tipo y ejecutivo, últimos 90 días (v_distribucion_gestion). */
export async function listarDistribucionGestion(
  sb: SupabaseClient,
): Promise<DistribucionGestion[]> {
  const { data, error } = await sb.from("v_distribucion_gestion").select("*");
  lanzar(error);
  return (data ?? []) as DistribucionGestion[];
}

/** Leads nuevos (recién asignados, sin primera gestión) para Mi Día. */
export async function listarLeadsNuevos(sb: SupabaseClient): Promise<Lead[]> {
  const { data, error } = await sb
    .from("leads")
    .select("*")
    .eq("estado", "nuevo")
    .order("creado_en", { ascending: false })
    .limit(20);
  lanzar(error);
  return (data ?? []) as Lead[];
}
