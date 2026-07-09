import { redirect } from "next/navigation";
import { es, rutaInicial } from "@diprem/core";
import { obtenerPerfil } from "@diprem/api";
import { clienteServidor } from "@/lib/supabase/servidor";
import { PantallaPlaceholder } from "@/components/pantalla-placeholder";

export default async function PaginaAdmin() {
  const supabase = await clienteServidor();
  const perfil = await obtenerPerfil(supabase);
  if (!perfil) redirect("/login");
  // RBAC de UI: solo admin entra (la RLS de BD es la barrera de datos real)
  if (perfil.rol !== "admin") redirect(rutaInicial(perfil.rol));

  return (
    <PantallaPlaceholder
      titulo={es.nav.admin}
      descripcion={es.fase0.descripcionAdmin}
    />
  );
}
