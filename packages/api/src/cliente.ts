import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Fábrica de cliente Supabase compartida (móvil y scripts).
 * La app web usa @supabase/ssr directamente por el manejo de cookies del App
 * Router; ambos comparten los helpers de dominio de este paquete.
 */
export function crearClienteSupabase(
  url: string,
  anonKey: string,
  storage?: {
    getItem: (key: string) => Promise<string | null> | string | null;
    setItem: (key: string, value: string) => Promise<void> | void;
    removeItem: (key: string) => Promise<void> | void;
  },
): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      ...(storage ? { storage } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

export type { SupabaseClient };
