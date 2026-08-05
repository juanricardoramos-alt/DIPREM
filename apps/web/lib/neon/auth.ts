import { createNeonAuth } from "@neondatabase/auth/next/server";

/**
 * Instancia de Neon Auth (Managed Better Auth) para el servidor.
 * Gestiona la sesión por cookie firmada (App Router): la usan el middleware,
 * el route handler /api/auth/[...path] y el cliente de datos del servidor
 * (para obtener el JWT que viaja a la Data API).
 *
 * Variables requeridas (server-only, nunca NEXT_PUBLIC):
 *   NEON_AUTH_BASE_URL       — URL del Auth server de Neon (consola → Auth)
 *   NEON_AUTH_COOKIE_SECRET  — secreto de firma de cookie (≥32 chars)
 */
export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
  },
});
