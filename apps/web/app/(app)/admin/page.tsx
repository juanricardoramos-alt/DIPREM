import { redirect } from "next/navigation";
import { es, rutaInicial } from "@diprem/core";
import { obtenerPerfil } from "@diprem/api";
import { clienteServidor } from "@/lib/supabase/servidor";
import { EditorEtapas } from "@/components/editor-etapas";
import { PantallaPlaceholder } from "@/components/pantalla-placeholder";

export default async function PaginaAdmin() {
  const supabase = await clienteServidor();
  const perfil = await obtenerPerfil(supabase);
  if (!perfil) redirect("/login");
  // RBAC de UI: solo admin entra (la RLS de BD es la barrera de datos real)
  if (perfil.rol !== "admin") redirect(rutaInicial(perfil.rol));

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold">{es.nav.admin}</h1>
      </div>
      <EditorEtapas />
      <PantallaPlaceholder
        titulo="Usuarios, equipos, servicios y metas"
        descripcion={es.fase0.descripcionAdmin}
      />
    </div>
  );
}
