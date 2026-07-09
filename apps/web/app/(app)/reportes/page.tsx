import { redirect } from "next/navigation";
import { obtenerPerfil } from "@diprem/api";
import { clienteServidor } from "@/lib/supabase/servidor";
import { ReportesCliente } from "@/components/reportes/reportes-cliente";

export default async function PaginaReportes() {
  const supabase = await clienteServidor();
  const perfil = await obtenerPerfil(supabase);
  if (!perfil) redirect("/login");

  return <ReportesCliente rol={perfil.rol} usuarioId={perfil.id} />;
}
