"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, X } from "lucide-react";
import { es, itemsParaRol, rutaActiva, type RolUsuario } from "@diprem/core";
import { ICONOS_RUTA } from "@/components/shell/iconos-navegacion";

const MAX_TABS = 4; // + "Más"

/** Navegación móvil abajo (tab bar), con hoja "Más" para el resto del menú. */
export function TabBarMovil({ rol }: { rol: RolUsuario }) {
  const pathname = usePathname();
  const [masAbierto, setMasAbierto] = useState(false);

  const items = itemsParaRol(rol);
  const activa = rutaActiva(pathname, items);
  const principales = items.slice(0, MAX_TABS);
  const restantes = items.slice(MAX_TABS);
  const activoEnRestantes = restantes.some((i) => i.ruta === activa);

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-borde bg-superficie/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden">
        <div className="grid auto-cols-fr grid-flow-col">
          {principales.map((item) => {
            const Icono = ICONOS_RUTA[item.ruta];
            const activo = item.ruta === activa;
            return (
              <Link
                key={item.ruta}
                href={item.ruta}
                className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                  activo ? "text-primario" : "text-tinta-tenue"
                }`}
              >
                {Icono && <Icono className="h-5 w-5" strokeWidth={activo ? 2.4 : 2} />}
                <span className="truncate">{item.etiqueta}</span>
              </Link>
            );
          })}
          {restantes.length > 0 && (
            <button
              onClick={() => setMasAbierto(true)}
              className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                activoEnRestantes ? "text-primario" : "text-tinta-tenue"
              }`}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span>{es.shell.mas}</span>
            </button>
          )}
        </div>
      </nav>

      {/* Hoja "Más" */}
      {masAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/50 lg:hidden"
          onMouseDown={(e) => e.target === e.currentTarget && setMasAbierto(false)}
        >
          <div className="w-full rounded-t-2xl border-t border-borde bg-superficie p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-tinta">{es.shell.menuCompleto}</p>
              <button
                onClick={() => setMasAbierto(false)}
                aria-label="Cerrar"
                className="rounded-lg p-1 text-tinta-tenue hover:bg-superficie-2"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {restantes.map((item) => {
                const Icono = ICONOS_RUTA[item.ruta];
                const activo = item.ruta === activa;
                return (
                  <Link
                    key={item.ruta}
                    href={item.ruta}
                    onClick={() => setMasAbierto(false)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium ${
                      activo
                        ? "border-primario bg-primario-suave text-primario"
                        : "border-borde text-tinta-suave"
                    }`}
                  >
                    {Icono && <Icono className="h-6 w-6" />}
                    <span className="truncate">{item.etiqueta}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
