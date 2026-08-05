import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Fábrica de cliente Supabase (móvil y scripts heredados).
 * La app web ya migró a Neon Auth + Neon Data API (ver apps/web/lib/neon y
 * lib/supabase/*); el móvil se migra en la Fase 2b. Los helpers de dominio de
 * este paquete solo usan `.from()` / `.rpc()`, comunes a ambos clientes.
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
