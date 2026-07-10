import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntidadNota, Nota } from "@diprem/core";

/**
 * Notas internas (tabla `notas`, RLS heredada del registro padre: las ven el
 * ejecutivo dueño, su gerente y el admin). Al insertar, un trigger notifica
 * al dueño del registro si comenta otra persona (migración 0010).
 */

function lanzar(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

const SELECT_NOTA = "*, autor:usuarios!notas_autor_id_fkey(nombre)";

export async function listarNotas(
  sb: SupabaseClient,
  entidad: EntidadNota,
  entidadId: string,
): Promise<Nota[]> {
  const { data, error } = await sb
    .from("notas")
    .select(SELECT_NOTA)
    .eq("entidad", entidad)
    .eq("entidad_id", entidadId)
    .order("creado_en", { ascending: false })
    .limit(100);
  lanzar(error);
  return (data ?? []) as unknown as Nota[];
}

export async function crearNota(
  sb: SupabaseClient,
  datos: { entidad: EntidadNota; entidad_id: string; autor_id: string; contenido: string },
): Promise<void> {
  const { error } = await sb.from("notas").insert(datos);
  lanzar(error);
}

export async function eliminarNota(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("notas").delete().eq("id", id);
  lanzar(error);
}
