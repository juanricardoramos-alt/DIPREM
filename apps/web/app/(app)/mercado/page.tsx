import { redirect } from "next/navigation";
import { rutaInicial } from "@diprem/core";
import { obtenerPerfil } from "@diprem/api";
import { clienteServidor } from "@/lib/supabase/servidor";
import { MercadoCliente } from "@/components/mercado/mercado-cliente";

export default async function PaginaMercado() {
  const supabase = await clienteServidor();
  const perfil = await obtenerPerfil(supabase);
  if (!perfil) redirect("/login");
  // RBAC de UI: solo admin y gerente (la RLS de proyectos_mercado es la barrera real)
  if (perfil.rol !== "admin" && perfil.rol !== "gerente") {
    redirect(rutaInicial(perfil.rol));
  }

  return <MercadoCliente />;
}
