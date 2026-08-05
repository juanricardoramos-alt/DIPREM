"use client";

import { createAuthClient } from "@neondatabase/auth";
import { SupabaseAuthAdapter } from "@neondatabase/auth/vanilla/adapters";
import { NeonPostgrestClient, fetchWithToken } from "@neondatabase/postgrest-js";
import type { SupabaseClient } from "@diprem/api";

/**
 * Cliente del navegador (Neon Auth + Neon Data API).
 *
 * Auth (login/logout/sesión) va por el cliente de Neon Auth apuntado al proxy
 * /api/auth del MISMO origen, para que la cookie de sesión se fije en el dominio
 * de la app y el middleware/gate del servidor la vean.
 *
 * Para los datos NO usamos el token automático de neon-js: su `getJWTToken()`
 * lee `session.token` confiando en un hook que copia la cabecera `set-auth-jwt`,
 * y ese hook no dispara de forma fiable a través del proxy. En su lugar leemos
 * la cabecera `set-auth-jwt` directamente del `get-session` del proxy (mismo
 * origen → JS puede leerla) y con ese JWT firmamos las llamadas a la Data API.
 */
export function clienteNavegador(): SupabaseClient {
  // En el navegador usamos el origen real (window.location.origin) → funciona
  // igual en localhost y en Vercel, sin URL fija. Durante el render en el
  // servidor (SSR) window no existe; ahí usamos un origen absoluto de relleno
  // solo para que createAuthClient no falle por URL relativa: NUNCA se usa para
  // peticiones, porque todas (login, get-session, Data API) ocurren en el
  // navegador (event handlers / useEffect), donde el origen ya es el real.
  const origen =
    typeof window !== "undefined" ? window.location.origin : "https://localhost";
  const proxy = `${origen}/api/auth`;

  const authClient = createAuthClient(proxy, { adapter: SupabaseAuthAdapter() });

  // JWT de la Data API, resuelto de forma perezosa por request. El proxy filtra
  // la cabecera set-auth-jwt de get-session, así que pedimos el JWT por el
  // endpoint dedicado GET /token, que lo devuelve en el CUERPO (y el proxy sí
  // reenvía cuerpos). Respaldo: la cabecera, por si el proxy la expone.
  const esJwt = (t: unknown): t is string =>
    typeof t === "string" && t.split(".").length === 3;
  const obtenerJwt = async (): Promise<string | null> => {
    try {
      const res = await fetch(`${proxy}/token`, { credentials: "same-origin" });
      if (res.ok) {
        const cuerpo = (await res.json().catch(() => null)) as { token?: string } | null;
        if (esJwt(cuerpo?.token)) return cuerpo!.token!;
      }
    } catch {
      /* sigue al respaldo */
    }
    try {
      const res = await fetch(`${proxy}/get-session`, { credentials: "same-origin" });
      const jwt = res.headers.get("set-auth-jwt");
      if (esJwt(jwt)) return jwt;
    } catch {
      /* sin token */
    }
    return null;
  };

  const datos = new NeonPostgrestClient({
    dataApiUrl: process.env.NEXT_PUBLIC_DATA_API_URL!,
    options: { global: { fetch: fetchWithToken(obtenerJwt) } },
  });

  // La app consume `.auth` (login/logout) y `.from()`/`.rpc()` (datos) desde el
  // mismo objeto. Los combinamos: `.auth` → cliente de Neon Auth; el resto →
  // cliente de la Data API (con métodos ligados a su instancia).
  return new Proxy(datos, {
    get(target, prop) {
      if (prop === "auth") return authClient;
      const valor = (target as unknown as Record<string | symbol, unknown>)[prop];
      return typeof valor === "function" ? valor.bind(target) : valor;
    },
  }) as unknown as SupabaseClient;
}
