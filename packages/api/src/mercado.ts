import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EstadoProyectoMercado,
  FilaProyecto,
  PrioridadProyecto,
  ProyectoMercado,
} from "@diprem/core";

/**
 * Base de proyectos del mercado nacional (solo admin/gerente — RLS).
 * Requiere haber corrido supabase/deploy/actualizacion_mercado.sql.
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

const SELECT_PROYECTO =
  "*, asignado:usuarios!proyectos_mercado_asignado_a_fkey(nombre)";

export interface FiltrosMercado {
  estado?: EstadoProyectoMercado;
  rubro?: string;
  region?: string;
  busqueda?: string;
}

export async function listarProyectosMercado(
  sb: SupabaseClient,
  filtros?: FiltrosMercado,
): Promise<ProyectoMercado[]> {
  let query = sb
    .from("proyectos_mercado")
    .select(SELECT_PROYECTO)
    .order("creado_en", { ascending: false })
    .limit(2000);
  if (filtros?.estado) query = query.eq("estado", filtros.estado);
  if (filtros?.rubro) query = query.eq("rubro", filtros.rubro);
  if (filtros?.region) query = query.eq("region", filtros.region);
  if (filtros?.busqueda?.trim()) {
    const b = `%${filtros.busqueda.trim()}%`;
    query = query.or(`nombre.ilike.${b},empresa.ilike.${b}`);
  }
  const { data, error } = await query;
  lanzar(error);
  return (data ?? []) as unknown as ProyectoMercado[];
}

export interface ResultadoImportacion {
  insertados: number;
  duplicados: number;
  invalidos: number;
}

/** Importa el lote validado; la BD deduplica por nombre + empresa. */
export async function importarProyectosMercado(
  sb: SupabaseClient,
  proyectos: FilaProyecto[],
): Promise<ResultadoImportacion> {
  const { data, error } = await sb.rpc("importar_proyectos_mercado", {
    p_proyectos: proyectos,
  });
  lanzar(error);
  const fila = Array.isArray(data) ? data[0] : data;
  return fila as ResultadoImportacion;
}

export interface ResultadoAsignacion {
  asignados: number;
  omitidos: number;
}

export interface OpcionesAsignacion {
  prioridad?: PrioridadProyecto;
  fecha_limite?: string | null; // 'YYYY-MM-DD'
  nota?: string | null; // nota privada del dueño al ejecutivo
  dias_alerta?: number; // alerta automática si no hay gestión en N días
}

/** Asigna proyectos (uno o en lote) a un ejecutivo: crea un lead por proyecto. */
export async function asignarProyectosMercado(
  sb: SupabaseClient,
  proyectoIds: string[],
  ejecutivoId: string,
  opciones?: OpcionesAsignacion,
): Promise<ResultadoAsignacion> {
  const { data, error } = await sb.rpc("asignar_proyectos_mercado", {
    p_proyecto_ids: proyectoIds,
    p_ejecutivo_id: ejecutivoId,
    ...(opciones?.prioridad ? { p_prioridad: opciones.prioridad } : {}),
    ...(opciones?.fecha_limite ? { p_fecha_limite: opciones.fecha_limite } : {}),
    ...(opciones?.nota ? { p_nota: opciones.nota } : {}),
    ...(opciones?.dias_alerta ? { p_dias_alerta: opciones.dias_alerta } : {}),
  });
  lanzar(error);
  const fila = Array.isArray(data) ? data[0] : data;
  return fila as ResultadoAsignacion;
}

/** Cambia la etapa de un proyecto del radar (editable: el dato de origen
 *  envejece). El trigger de la BD re-sella score/cubeta y audita el cambio. */
export async function actualizarEtapaProyecto(
  sb: SupabaseClient,
  proyectoId: string,
  etapa: string | null,
): Promise<void> {
  const { error } = await sb
    .from("proyectos_mercado")
    .update({ etapa, es_watchlist: false })
    .eq("id", proyectoId);
  lanzar(error);
}

/** Recalcula el scoring completo del radar (admin/gerente). */
export async function recalcularScores(sb: SupabaseClient): Promise<number> {
  const { data, error } = await sb.rpc("recalcular_scores_mercado");
  lanzar(error);
  return Number(data ?? 0);
}

export interface ContactoPuerta {
  cuenta_id: string;
  contacto_id: string;
  nombre: string;
  cargo: string | null;
  es_principal: boolean;
  peso_decision: number;
}

/** Contactos puerta de entrada de una cuenta, ordenados por peso de decisión
 *  (la acción de derivación: a quién pedirle llegar al gerente de proyecto). */
export async function listarContactosPuerta(
  sb: SupabaseClient,
  cuentaId: string,
): Promise<ContactoPuerta[]> {
  const { data, error } = await sb
    .from("v_contactos_puerta")
    .select("*")
    .eq("cuenta_id", cuentaId)
    .order("peso_decision", { ascending: false })
    .order("es_principal", { ascending: false });
  lanzar(error);
  return (data ?? []) as ContactoPuerta[];
}

/** Ejecutivos a los que se puede asignar (la RLS de usuarios limita al equipo del gerente). */
export async function listarEjecutivosAsignables(
  sb: SupabaseClient,
): Promise<{ id: string; nombre: string; rol: string }[]> {
  const { data, error } = await sb
    .from("usuarios")
    .select("id, nombre, rol")
    .eq("activo", true)
    .in("rol", ["ejecutivo", "gerente"])
    .order("nombre");
  lanzar(error);
  return (data ?? []) as { id: string; nombre: string; rol: string }[];
}
