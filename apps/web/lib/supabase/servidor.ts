import { NeonPostgrestClient, fetchWithToken } from "@neondatabase/postgrest-js";
import type { SupabaseClient } from "@diprem/api";

/**
 * Cliente de datos para Server Components / Route Handlers (App Router).
 * Consulta la Neon Data API inyectando, de forma perezosa por request, el JWT
 * de la sesión por cookie (Neon Auth). Así la RLS de Postgres se evalúa con la
 * identidad real del usuario, igual que en el navegador.
 *
 * Se conserva la ruta `@/lib/supabase/servidor`; el cast confina el reemplazo
 * del cliente a esta fábrica (el objeto expone `.from()` / `.rpc()`).
 */
export async function clienteServidor(): Promise<SupabaseClient> {
  const cliente = new NeonPostgrestClient({
    dataApiUrl: process.env.NEXT_PUBLIC_DATA_API_URL!,
    options: {
      global: {
        // F2: el JWT de sesión del lado servidor (Server Components) se cablea
        // en F3, cuando confirmemos contra la instancia real de Neon el accesor
        // del token de la Data API para `createNeonAuth`. Hasta entonces este
        // cliente va sin token → la RLS/allowlist lo trata como anónimo y niega
        // (fail-closed), en vez de exponer datos. La autenticación y el acceso
        // a datos de F2 ocurren por el navegador (ver /estado), donde el cliente
        // neon-js adjunta el access_token de la sesión automáticamente.
        fetch: fetchWithToken(async () => null),
      },
    },
  });
  return cliente as unknown as SupabaseClient;
}
