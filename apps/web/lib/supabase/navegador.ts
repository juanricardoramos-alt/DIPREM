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
  // El navegador habla con el proxy /api/auth del MISMO origen (no con el
  // servidor de Neon Auth directo): así la cookie de sesión se fija en el
  // dominio de la app y el middleware/gate del servidor la ven. Apuntar directo
  // dejaría la cookie en otro dominio y rompería por CORS.
  const origen = typeof window !== "undefined" ? window.location.origin : "";
  return createClient({
    auth: {
      adapter: SupabaseAuthAdapter(),
      url: `${origen}/api/auth`,
    },
    dataApi: {
      url: process.env.NEXT_PUBLIC_DATA_API_URL!,
    },
  }) as unknown as SupabaseClient;
}
