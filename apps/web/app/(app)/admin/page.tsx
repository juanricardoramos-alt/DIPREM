"use client";

import { EncabezadoPagina } from "@/components/ui";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { es, rutaInicial } from "@diprem/core";
import { usePerfil } from "@/lib/hooks";
import { EditorEtapas } from "@/components/editor-etapas";
import { EditorMetas } from "@/components/editor-metas";
import { PantallaPlaceholder } from "@/components/pantalla-placeholder";

export default function PaginaAdmin() {
  const router = useRouter();
  const { data: perfil } = usePerfil();

  // RBAC de UI: solo admin entra (la RLS de BD es la barrera de datos real)
  useEffect(() => {
    if (perfil && perfil.rol !== "admin") router.replace(rutaInicial(perfil.rol));
  }, [perfil, router]);

  if (!perfil || perfil.rol !== "admin") return null;

  return (
    <div className="space-y-10">
      <EncabezadoPagina titulo={es.nav.admin} />
      <EditorMetas />
      <EditorEtapas />
      <PantallaPlaceholder
        titulo="Usuarios, equipos y servicios"
        descripcion={es.fase0.descripcionAdmin}
      />
    </div>
  );
}
