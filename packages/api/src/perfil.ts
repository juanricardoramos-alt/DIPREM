import type { SupabaseClient } from "@supabase/supabase-js";
import type { Equipo, Usuario } from "@diprem/core";

/**
 * Perfil del usuario autenticado (fila de `usuarios` para el auth.uid actual).
 * Devuelve null si no hay sesión o el perfil aún no existe.
 */
export async function obtenerPerfil(supabase: SupabaseClient): Promise<Usuario | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nombre, email, rol, equipo_id, telefono, activo")
    .eq("id", user.id)
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
