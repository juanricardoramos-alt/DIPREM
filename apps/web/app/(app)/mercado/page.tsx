"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { rutaInicial } from "@diprem/core";
import { usePerfil } from "@/lib/hooks";
import { MercadoCliente } from "@/components/mercado/mercado-cliente";

export default function PaginaMercado() {
  const router = useRouter();
  const { data: perfil } = usePerfil();
  // RBAC de UI: solo admin y gerente (la RLS de proyectos_mercado es la barrera real)
  const permitido = !!perfil && (perfil.rol === "admin" || perfil.rol === "gerente");

  useEffect(() => {
    if (perfil && !permitido) router.replace(rutaInicial(perfil.rol));
  }, [perfil, permitido, router]);

  if (!perfil || !permitido) return null;
  return <MercadoCliente />;
}
