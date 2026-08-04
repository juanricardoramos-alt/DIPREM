import { auth } from "@/lib/neon/auth";

/**
 * Proxy de Neon Auth: el cliente del navegador habla con /api/auth/* y este
 * handler reenvía a Neon Auth gestionando la cookie de sesión en el dominio de
 * la app (login, logout, refresh, get-session, get-access-token).
 */
export const { GET, POST } = auth.handler();
