"use client";

import { usePerfil } from "@/lib/hooks";
import { ReportesCliente } from "@/components/reportes/reportes-cliente";

export default function PaginaReportes() {
  const { data: perfil } = usePerfil();
  if (!perfil) return null;
  return <ReportesCliente rol={perfil.rol} usuarioId={perfil.id} />;
}
