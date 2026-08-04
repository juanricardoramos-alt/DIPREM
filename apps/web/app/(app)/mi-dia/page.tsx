"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { rutaInicial } from "@diprem/core";
import { usePerfil } from "@/lib/hooks";
import { MiDiaCliente } from "@/components/mi-dia-cliente";

export default function PaginaMiDia() {
  const router = useRouter();
  const { data: perfil } = usePerfil();

  useEffect(() => {
    if (perfil && perfil.rol === "lectura") router.replace(rutaInicial(perfil.rol));
  }, [perfil, router]);

  if (!perfil || perfil.rol === "lectura") return null;
  return <MiDiaCliente nombre={perfil.nombre} />;
}
