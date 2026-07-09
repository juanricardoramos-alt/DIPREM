import { redirect } from "next/navigation";
import { rutaInicial } from "@diprem/core";
import { obtenerPerfil } from "@diprem/api";
import { clienteServidor } from "@/lib/supabase/servidor";
import { MiDiaCliente } from "@/components/mi-dia-cliente";

export default async function PaginaMiDia() {
  const supabase = await clienteServidor();
  const perfil = await obtenerPerfil(supabase);
  if (!perfil) redirect("/login");
  if (perfil.rol === "lectura") redirect(rutaInicial(perfil.rol));

  return <MiDiaCliente nombre={perfil.nombre} />;
}
