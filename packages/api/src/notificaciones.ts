import type { SupabaseClient } from "@supabase/supabase-js";
import type { Notificacion } from "@diprem/core";

/** Notificaciones in-app del usuario (la RLS limita a las propias). */

function lanzar(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function listarNotificacionesNoLeidas(
  sb: SupabaseClient,
): Promise<Notificacion[]> {
  const { data, error } = await sb
    .from("notificaciones")
    .select("*")
    .eq("leida", false)
    .order("creado_en", { ascending: false })
    .limit(20);
  lanzar(error);
  return (data ?? []) as Notificacion[];
}

export async function marcarNotificacionLeida(
  sb: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await sb.from("notificaciones").update({ leida: true }).eq("id", id);
  lanzar(error);
}
