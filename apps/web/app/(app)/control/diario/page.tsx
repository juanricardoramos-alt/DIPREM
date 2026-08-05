"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { rutaInicial } from "@diprem/core";
import { usePerfil } from "@/lib/hooks";
import { ReporteDiario } from "@/components/control/reporte-diario";

export default function PaginaReporteDiario() {
  const router = useRouter();
  const { data: perfil } = usePerfil();
  // RBAC de UI: solo admin y gerente (las vistas heredan la RLS real)
  const permitido = !!perfil && (perfil.rol === "admin" || perfil.rol === "gerente" || perfil.rol === "revisor");

  useEffect(() => {
    if (perfil && !permitido) router.replace(rutaInicial(perfil.rol));
  }, [perfil, permitido, router]);

  if (!perfil || !permitido) return null;
  return <ReporteDiario />;
}
