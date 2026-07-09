import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetaAvance, Moneda, PipelineFila, RankingFila, TipoMeta } from "@diprem/core";

/**
 * Datos para metas y dashboards (vistas de la migración 0004).
 * Si el proyecto Supabase aún no corrió el script de actualización de la
 * Fase 3, avisamos con un mensaje accionable en vez de un error críptico.
 */

const AVISO_SCRIPT =
  "Falta actualizar la base de datos: ejecuta supabase/deploy/actualizacion_fase3.sql " +
  "en el SQL Editor de Supabase (ver docs/DEPLOY.md).";

function lanzar(error: { message: string } | null): void {
  if (!error) return;
  if (/does not exist|schema cache/i.test(error.message)) {
    throw new Error(AVISO_SCRIPT);
  }
  throw new Error(error.message);
}

export async function listarAvanceMetas(
  sb: SupabaseClient,
  filtros?: { periodo?: string; usuario_id?: string },
): Promise<MetaAvance[]> {
  let query = sb.from("v_avance_metas").select("*").order("ejecutivo").order("tipo");
  if (filtros?.periodo) query = query.eq("periodo", filtros.periodo);
  if (filtros?.usuario_id) query = query.eq("usuario_id", filtros.usuario_id);
  const { data, error } = await query;
  lanzar(error);
  return (data ?? []) as MetaAvance[];
}

export async function listarRanking(sb: SupabaseClient): Promise<RankingFila[]> {
  const { data, error } = await sb
    .from("v_ranking_equipo")
    .select("*")
    .order("actividades_mes", { ascending: false });
  lanzar(error);
  return (data ?? []) as RankingFila[];
}

export async function listarPipelineDetalle(sb: SupabaseClient): Promise<PipelineFila[]> {
  const { data, error } = await sb
    .from("v_pipeline_detalle")
    .select("*")
    .order("etapa_orden")
    .limit(1000);
  lanzar(error);
  return (data ?? []) as PipelineFila[];
}

// ---------------------------------------------------------------------------
// Administración de metas (RLS: admin todo; gerente su equipo)
// ---------------------------------------------------------------------------
export interface DatosMeta {
  usuario_id: string;
  periodo: string; // 'YYYY-MM'
  tipo: TipoMeta;
  objetivo: number;
  moneda?: Moneda | null;
}

export async function guardarMeta(sb: SupabaseClient, meta: DatosMeta): Promise<void> {
  const { error } = await sb
    .from("metas")
    .upsert(meta, { onConflict: "usuario_id,periodo,tipo" });
  lanzar(error);
}

export async function eliminarMeta(
  sb: SupabaseClient,
  usuario_id: string,
  periodo: string,
  tipo: TipoMeta,
): Promise<void> {
  const { error } = await sb
    .from("metas")
    .delete()
    .eq("usuario_id", usuario_id)
    .eq("periodo", periodo)
    .eq("tipo", tipo);
  lanzar(error);
}

/** Comerciales visibles (para el editor de metas y filtros de reportes). */
export async function listarComerciales(
  sb: SupabaseClient,
): Promise<{ id: string; nombre: string; equipo: string | null; pais: string | null }[]> {
  const { data, error } = await sb
    .from("v_ranking_equipo")
    .select("usuario_id, nombre, equipo, pais")
    .order("nombre");
  lanzar(error);
  return (data ?? []).map((f: Record<string, unknown>) => ({
    id: f.usuario_id as string,
    nombre: f.nombre as string,
    equipo: f.equipo as string | null,
    pais: f.pais as string | null,
  }));
}
