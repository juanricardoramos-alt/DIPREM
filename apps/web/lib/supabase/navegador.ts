"use client";

import { createClient, SupabaseAuthAdapter } from "@neondatabase/neon-js";
import type { SupabaseClient } from "@diprem/api";

/**
 * Cliente de datos para componentes cliente (Neon Data API + Neon Auth).
 * El SupabaseAuthAdapter expone `auth.signInWithPassword` / `signOut` /
 * `getUser`, compatibles con el código de login/logout existente; el cliente
 * adjunta el JWT del usuario a cada request de la Data API automáticamente.
 *
 * Se conserva la ruta de import `@/lib/supabase/navegador` (la usan ~30
 * componentes) cambiando solo el interior. El cast confina el reemplazo del
 * cliente a esta fábrica: el objeto expone `.from()`, `.rpc()` y `.auth`, que
 * es lo único que consume `@diprem/api`.
 */
export function clienteNavegador(): SupabaseClient {
  return createClient({
    auth: {
      adapter: SupabaseAuthAdapter(),
      // El navegador habla con el proxy /api/auth para compartir la cookie de
      // sesión con el servidor (middleware y gate). Ver route.ts + auth.ts.
      url: process.env.NEXT_PUBLIC_NEON_AUTH_BASE_URL!,
    },
    dataApi: {
      url: process.env.NEXT_PUBLIC_DATA_API_URL!,
    },
  }) as unknown as SupabaseClient;
}
