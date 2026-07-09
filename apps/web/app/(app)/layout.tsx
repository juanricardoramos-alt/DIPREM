import { redirect } from "next/navigation";
import { obtenerPerfil } from "@diprem/api";
import { clienteServidor } from "@/lib/supabase/servidor";
import { BarraNavegacion } from "@/components/barra-navegacion";

export default async function LayoutApp({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await clienteServidor();
  const perfil = await obtenerPerfil(supabase);

  if (!perfil) redirect("/login");
  if (!perfil.activo) redirect("/login");

  return (
    <div className="min-h-screen">
      <BarraNavegacion usuario={perfil} />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
