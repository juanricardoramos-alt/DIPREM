import { redirect } from "next/navigation";
import { rutaInicial } from "@diprem/core";
import { obtenerPerfil } from "@diprem/api";
import { clienteServidor } from "@/lib/supabase/servidor";

export default async function Inicio() {
  const supabase = await clienteServidor();
  const perfil = await obtenerPerfil(supabase);

  if (!perfil) redirect("/login");
  redirect(rutaInicial(perfil.rol));
}
