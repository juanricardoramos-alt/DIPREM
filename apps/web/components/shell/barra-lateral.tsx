"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { es, itemsParaRol, rutaActiva, type RolUsuario } from "@diprem/core";
import { ICONOS_RUTA } from "@/components/shell/iconos-navegacion";

/** Sidebar de escritorio: azul oscuro, colapsable, con estado activo. */
export function BarraLateral({ rol }: { rol: RolUsuario }) {
  const pathname = usePathname();
  const items = itemsParaRol(rol);
  const activa = rutaActiva(pathname, items);
  const [colapsada, setColapsada] = useState(false);

  useEffect(() => {
    try {
      setColapsada(localStorage.getItem("sidebar") === "colapsada");
    } catch {
      /* sin localStorage */
    }
  }, []);

  const alternar = () => {
    setColapsada((prev) => {
      try {
        localStorage.setItem("sidebar", prev ? "expandida" : "colapsada");
      } catch {
        /* sin localStorage */
      }
      return !prev;
    });
  };

  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 flex-col bg-sidebar text-sidebar-texto transition-[width] duration-200 lg:flex print:hidden ${
        colapsada ? "w-16" : "w-60"
      }`}
    >
      {/* Logo */}
      <div className={`flex h-16 items-center ${colapsada ? "justify-center" : "px-5"}`}>
        <Link href="/" className="flex items-center gap-2.5 font-bold text-white">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm">
            D
          </span>
          {!colapsada && <span className="text-base tracking-tight">DIPREM CRM</span>}
        </Link>
      </div>

      {/* Navegación */}
      <nav className="mt-2 flex-1 space-y-1 px-3">
        {items.map((item) => {
          const Icono = ICONOS_RUTA[item.ruta];
          const activo = item.ruta === activa;
          return (
            <Link
              key={item.ruta}
              href={item.ruta}
              title={colapsada ? item.etiqueta : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                activo
                  ? "bg-white/15 text-white"
                  : "hover:bg-sidebar-hover hover:text-white"
              } ${colapsada ? "justify-center px-0" : ""}`}
            >
              {Icono && <Icono className="h-5 w-5 shrink-0" strokeWidth={activo ? 2.4 : 2} />}
              {!colapsada && <span className="truncate">{item.etiqueta}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Colapsar */}
      <button
        onClick={alternar}
        title={colapsada ? es.shell.expandir : es.shell.colapsar}
        className={`m-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-sidebar-hover hover:text-white ${
          colapsada ? "justify-center px-0" : ""
        }`}
      >
        {colapsada ? (
          <PanelLeftOpen className="h-5 w-5" />
        ) : (
          <>
            <PanelLeftClose className="h-5 w-5" />
            <span>{es.shell.colapsar}</span>
          </>
        )}
      </button>
    </aside>
  );
}
