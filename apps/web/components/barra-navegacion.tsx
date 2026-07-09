"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { es, itemsParaRol, type Usuario } from "@diprem/core";
import { clienteNavegador } from "@/lib/supabase/navegador";

export function BarraNavegacion({ usuario }: { usuario: Usuario }) {
  const pathname = usePathname();
  const router = useRouter();
  const items = itemsParaRol(usuario.rol);

  async function salir() {
    const supabase = clienteNavegador();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="text-lg font-bold text-[var(--color-diprem)]">
            {es.app.nombre}
          </span>
          <nav className="hidden items-center gap-1 md:flex">
            {items.map((item) => {
              const activo = pathname.startsWith(item.ruta);
              return (
                <Link
                  key={item.ruta}
                  href={item.ruta}
                  className={
                    "rounded-md px-3 py-1.5 text-sm font-medium " +
                    (activo
                      ? "bg-[var(--color-diprem)] text-white"
                      : "text-slate-600 hover:bg-slate-100")
                  }
                >
                  {item.etiqueta}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium">{usuario.nombre}</p>
            <p className="text-xs text-slate-500">{es.roles[usuario.rol]}</p>
          </div>
          <button
            onClick={salir}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            {es.auth.salir}
          </button>
        </div>
      </div>
      {/* Navegación móvil (web responsive) */}
      <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden">
        {items.map((item) => {
          const activo = pathname.startsWith(item.ruta);
          return (
            <Link
              key={item.ruta}
              href={item.ruta}
              className={
                "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium " +
                (activo
                  ? "bg-[var(--color-diprem)] text-white"
                  : "text-slate-600 hover:bg-slate-100")
              }
            >
              {item.etiqueta}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
