"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { es, rutaInicial } from "@diprem/core";
import { usePerfil } from "@/lib/hooks";
import { Proveedores } from "@/components/proveedores";

/**
 * Entrada de la app. El middleware de Neon Auth garantiza que aquí solo llegan
 * usuarios con sesión. La ruta inicial depende del rol (Fase D): quien dirige
 * (gerente, dueño, revisor) aterriza en el Control; el ejecutivo en Mi Día;
 * los de consulta en Reportes. El perfil se resuelve en el cliente, igual que
 * en ShellApp.
 */
function RedireccionInicial() {
  const router = useRouter();
  const { data: perfil, isError } = usePerfil();

  useEffect(() => {
    if (isError) router.replace("/login");
    else if (perfil) router.replace(perfil.activo ? rutaInicial(perfil.rol) : "/login");
  }, [perfil, isError, router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-tinta-suave">
      {es.comunes.cargando}
    </div>
  );
}

export default function Inicio() {
  return (
    <Proveedores>
      <RedireccionInicial />
    </Proveedores>
  );
}
