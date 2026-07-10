import { redirect } from "next/navigation";
import { obtenerPerfil } from "@diprem/api";
import { clienteServidor } from "@/lib/supabase/servidor";
import { Proveedores } from "@/components/proveedores";
import { BarraLateral } from "@/components/shell/barra-lateral";
import { Encabezado } from "@/components/shell/encabezado";
import { TabBarMovil } from "@/components/shell/tab-bar-movil";
import { BotonFlotante } from "@/components/shell/boton-flotante";

export default async function LayoutApp({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await clienteServidor();
  const perfil = await obtenerPerfil(supabase);

  if (!perfil) redirect("/login");
  if (!perfil.activo) redirect("/login");

  return (
    <Proveedores>
      <div className="min-h-screen lg:flex">
        <BarraLateral rol={perfil.rol} />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <Encabezado usuario={perfil} />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-28 lg:px-8 lg:py-8 print:pb-4">
            {children}
          </main>
          <TabBarMovil rol={perfil.rol} />
        </div>
        <BotonFlotante rol={perfil.rol} />
      </div>
    </Proveedores>
  );
}
