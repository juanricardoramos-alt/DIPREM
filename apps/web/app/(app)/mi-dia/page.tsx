import { redirect } from "next/navigation";
import { es, rutaInicial } from "@diprem/core";
import { obtenerPerfil } from "@diprem/api";
import { clienteServidor } from "@/lib/supabase/servidor";
import { PantallaPlaceholder } from "@/components/pantalla-placeholder";

export default async function PaginaMiDia() {
  const supabase = await clienteServidor();
  const perfil = await obtenerPerfil(supabase);
  if (!perfil) redirect("/login");
  if (perfil.rol === "lectura") redirect(rutaInicial(perfil.rol));

  return (
    <PantallaPlaceholder
      titulo={`${es.fase0.bienvenida}, ${perfil.nombre.split(" ")[0]} — ${es.nav.miDia}`}
      descripcion={es.fase0.descripcionMiDia}
    />
  );
}
