import { redirect } from "next/navigation";
import { rutaInicial } from "@diprem/core";
import { obtenerPerfil } from "@diprem/api";
import { clienteServidor } from "@/lib/supabase/servidor";
import { ControlCliente } from "@/components/control/control-cliente";

export default async function PaginaControl() {
  const supabase = await clienteServidor();
  const perfil = await obtenerPerfil(supabase);
  if (!perfil) redirect("/login");
  // RBAC de UI: solo admin y gerente (las vistas heredan la RLS real)
  if (perfil.rol !== "admin" && perfil.rol !== "gerente") {
    redirect(rutaInicial(perfil.rol));
  }

  return <ControlCliente />;
}
