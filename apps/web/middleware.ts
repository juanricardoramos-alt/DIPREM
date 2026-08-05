import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/neon/auth";

/**
 * Middleware en dos puertas:
 *
 * 1. Basic-Auth OPCIONAL para el sitio completo (demo pública): se activa
 *    solo si BASIC_AUTH_USUARIO y BASIC_AUTH_CLAVE están definidas en el
 *    entorno (Vercel). Sin esas variables no interfiere — en local no cambia
 *    nada. Se desactiva borrando las variables y redeployando.
 * 2. Sesión de Neon Auth: protege las rutas y refresca la cookie en cada
 *    request; redirige a /login si no hay sesión. El proxy de auth
 *    (/api/auth/*) queda excluido para que el propio login no se bloquee.
 */
const conSesion = auth.middleware({ loginUrl: "/login" });

export default function middleware(req: NextRequest) {
  const usuario = process.env.BASIC_AUTH_USUARIO;
  const clave = process.env.BASIC_AUTH_CLAVE;
  if (usuario && clave) {
    const esperado = "Basic " + btoa(`${usuario}:${clave}`);
    if (req.headers.get("authorization") !== esperado) {
      return new NextResponse("Acceso restringido — DIPREM", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="DIPREM", charset="UTF-8"' },
      });
    }
  }
  return conSesion(req);
}

export const config = {
  matcher: [
    // Todo excepto estáticos, imágenes y el propio proxy de auth
    "/((?!_next/static|_next/image|favicon.ico|api/auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
