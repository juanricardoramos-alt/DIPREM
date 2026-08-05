"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { es } from "@diprem/core";
import type { Usuario } from "@diprem/core";
import { obtenerPerfil } from "@diprem/api";
import { clienteNavegador } from "@/lib/supabase/navegador";

/**
 * Página de estado (Fase 2): prueba de extremo a extremo de la migración a
 * Neon. Con la sesión iniciada, resuelve el perfil por la Data API (JWT real →
 * RLS → allowlist vía `usuario_actual()`) y lo muestra. Es también el test
 * positivo que quedó pendiente de F1: un usuario CON perfil ve su fila.
 * Las pantallas del CRM se recablean a la Data API en F3.
 */
export default function PaginaEstado() {
  const router = useRouter();
  const cliente = useMemo(() => clienteNavegador(), []);
  const [perfil, setPerfil] = useState<Usuario | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerPerfil(cliente)
      .then(setPerfil)
      .catch(() => setError(es.auth.errores.generico));
  }, [cliente]);

  async function salir() {
    await cliente.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-borde bg-superficie p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-primario">{es.app.nombre}</h1>
        <p className="mt-1 text-sm text-tinta-suave">
          Conexión con Neon (Auth + Data API) — Fase 2
        </p>

        {perfil === undefined && !error && (
          <p className="mt-6 text-sm text-tinta-suave">Comprobando sesión…</p>
        )}

        {error && (
          <p role="alert" className="mt-6 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {perfil === null && !error && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-red-600 dark:text-red-400">
              Sesión iniciada, pero tu usuario no está habilitado en el sistema
              (sin perfil activo en la allowlist).
            </p>
            <button
              onClick={salir}
              className="w-full rounded-md border border-borde px-4 py-2 text-sm font-semibold hover:bg-fondo"
            >
              {es.auth.salir}
            </button>
          </div>
        )}

        {perfil && (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-borde bg-fondo p-4">
              <p className="text-xs uppercase tracking-wide text-tinta-suave">
                Conectado como
              </p>
              <p className="mt-1 text-lg font-semibold">{perfil.nombre}</p>
              <p className="text-sm text-tinta-suave">{perfil.email}</p>
              <p className="mt-2 inline-block rounded-full bg-primario/10 px-2.5 py-0.5 text-xs font-medium text-primario">
                {perfil.rol}
              </p>
            </div>
            <p className="text-sm text-tinta-suave">
              Auth, JWT y RLS funcionando de extremo a extremo. Las pantallas del
              CRM se conectan a la Data API en la Fase 3.
            </p>
            <button
              onClick={salir}
              className="w-full rounded-md border border-borde px-4 py-2 text-sm font-semibold hover:bg-fondo"
            >
              {es.auth.salir}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
