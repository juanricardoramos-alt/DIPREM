"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { es, esquemaLogin } from "@diprem/core";
import { clienteNavegador } from "@/lib/supabase/navegador";

export default function PaginaLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function ingresar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const datos = esquemaLogin.safeParse({ email, password });
    if (!datos.success) {
      setError(datos.error.issues[0]?.message ?? es.auth.errores.generico);
      return;
    }

    setCargando(true);
    const supabase = clienteNavegador();
    const { error: errorAuth } = await supabase.auth.signInWithPassword(datos.data);
    setCargando(false);

    if (errorAuth) {
      setError(
        errorAuth.message.includes("Invalid login credentials")
          ? es.auth.errores.credenciales
          : es.auth.errores.generico,
      );
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-borde bg-superficie p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-primario">
          {es.app.nombre}
        </h1>
        <p className="mt-1 text-sm text-tinta-suave">{es.app.lema}</p>

        <form onSubmit={ingresar} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium">
              {es.auth.email}
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-borde px-3 py-2 text-sm focus:border-primario focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium">
              {es.auth.password}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-borde px-3 py-2 text-sm focus:border-primario focus:outline-none"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={cargando}
            className="w-full rounded-md bg-primario px-4 py-2 text-sm font-semibold text-white hover:bg-primario-oscuro disabled:opacity-60"
          >
            {cargando ? es.auth.entrando : es.auth.entrar}
          </button>
        </form>
      </div>
    </main>
  );
}
