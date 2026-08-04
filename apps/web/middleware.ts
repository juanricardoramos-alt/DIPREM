import { auth } from "@/lib/neon/auth";

/**
 * Middleware de sesión de Neon Auth: protege las rutas y refresca la cookie de
 * sesión en cada request; redirige a /login si no hay sesión. El proxy de auth
 * (/api/auth/*) queda excluido para que el propio flujo de login no se bloquee.
 */
export default auth.middleware({ loginUrl: "/login" });

export const config = {
  matcher: [
    // Todo excepto estáticos, imágenes y el propio proxy de auth
    "/((?!_next/static|_next/image|favicon.ico|api/auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
