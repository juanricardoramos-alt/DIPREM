import type { SupabaseClient } from "@supabase/supabase-js";
import type { Equipo, Usuario } from "@diprem/core";

/**
 * Perfil del usuario autenticado (su fila de `usuarios`).
 * Resuelve la identidad con la función SQL `usuario_actual()` (SECURITY DEFINER,
 * con grant execute a authenticated): devuelve el id de `usuarios` del portador
 * del JWT, o null si el JWT no está en la allowlist. Funciona igual en servidor
 * y navegador porque ambos clientes envían el JWT a la Data API.
 * Devuelve null si no hay sesión o el perfil no está en la allowlist.
 */
export async function obtenerPerfil(supabase: SupabaseClient): Promise<Usuario | null> {
  const { data: miId, error: errorId } = await supabase.rpc("usuario_actual");
  if (errorId || !miId) return null;

  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nombre, email, rol, equipo_id, telefono, activo")
    .eq("id", miId as string)
    .maybeSingle();

  if (error || !data) return null;
  return data as Usuario;
}

/** Equipo (oficina/país) al que pertenece un usuario — para moneda default. */
export async function obtenerEquipo(
  supabase: SupabaseClient,
  equipoId: string | null,
): Promise<Equipo | null> {
  if (!equipoId) return null;
  const { data, error } = await supabase
    .from("equipos")
    .select("*")
    .eq("id", equipoId)
    .maybeSingle();
  if (error || !data) return null;
  return data as Equipo;
}
