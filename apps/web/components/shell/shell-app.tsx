"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePerfil } from "@/lib/hooks";
import { BarraLateral } from "@/components/shell/barra-lateral";
import { Encabezado } from "@/components/shell/encabezado";
import { TabBarMovil } from "@/components/shell/tab-bar-movil";
import { BotonFlotante } from "@/components/shell/boton-flotante";

/**
 * Shell de la app con el gate de perfil resuelto EN EL CLIENTE (Fase 3).
 *
 * El middleware de Neon Auth ya garantiza que aquí solo llega gente con sesión
 * (cookie). Aquí resolvemos el PERFIL con el cliente del navegador —el mismo
 * camino JWT → Data API → RLS → allowlist que ya funciona en /estado— para el
 * RBAC de UI y para pintar el shell. Si no hay perfil activo, a /login.
 *
 * Antes esto se hacía en un server component con clienteServidor(), que
 * requería un JWT del lado servidor (pieza pendiente). Al moverlo al cliente,
 * todo el CRM (páginas ya client-side) queda accesible sin ese token.
 */
export function ShellApp({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: perfil, isLoading, isError } = usePerfil();

  useEffect(() => {
    if (isLoading) return;
    if (isError || !perfil || !perfil.activo) router.replace("/login");
  }, [isLoading, isError, perfil, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-tinta-suave">
        Cargando…
      </div>
    );
  }
  if (!perfil || !perfil.activo) return null;

  return (
    // overflow-x-clip: la PÁGINA jamás se mueve de lado — lo ancho scrollea
    // dentro de su propio contenedor (clip no crea scroll container, así que
    // la sidebar sticky y los overflow-x-auto internos siguen funcionando)
    <div className="min-h-screen overflow-x-clip lg:flex">
      <BarraLateral rol={perfil.rol} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col overflow-x-clip">
        <Encabezado usuario={perfil} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-28 lg:px-8 lg:py-8 print:pb-4">
          {children}
        </main>
        <TabBarMovil rol={perfil.rol} />
      </div>
      <BotonFlotante rol={perfil.rol} />
    </div>
  );
}
