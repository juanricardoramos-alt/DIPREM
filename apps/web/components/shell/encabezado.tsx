"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Moon, Search, Sun } from "lucide-react";
import { es, type Usuario } from "@diprem/core";
import { clienteNavegador } from "@/lib/supabase/navegador";
import { Avatar } from "@/components/ui";
import { BusquedaGlobal } from "@/components/shell/busqueda-global";
import { Campana } from "@/components/shell/campana";

function temaOscuroActivo(): boolean {
  return typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");
}

/** Header: buscador global (Ctrl+K) + menú del usuario (tema, salir). */
export function Encabezado({ usuario }: { usuario: Usuario }) {
  const router = useRouter();
  const [buscando, setBuscando] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [oscuro, setOscuro] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setOscuro(temaOscuroActivo()), []);

  // Atajo global Ctrl/Cmd+K
  useEffect(() => {
    const manejar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBuscando(true);
      }
    };
    window.addEventListener("keydown", manejar);
    return () => window.removeEventListener("keydown", manejar);
  }, []);

  // Cerrar el menú al hacer clic fuera
  useEffect(() => {
    if (!menuAbierto) return;
    const manejar = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuAbierto(false);
    };
    window.addEventListener("mousedown", manejar);
    return () => window.removeEventListener("mousedown", manejar);
  }, [menuAbierto]);

  const alternarTema = () => {
    const activar = !temaOscuroActivo();
    document.documentElement.classList.toggle("dark", activar);
    try {
      localStorage.setItem("tema", activar ? "oscuro" : "claro");
    } catch {
      /* sin localStorage */
    }
    setOscuro(activar);
  };

  async function salir() {
    const supabase = clienteNavegador();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-borde bg-superficie/90 backdrop-blur print:hidden">
      <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
        {/* Logo (solo móvil: en PC está en la sidebar) */}
        <span className="flex items-center gap-2 font-bold text-primario lg:hidden">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primario text-sm text-white">
            D
          </span>
        </span>

        {/* Buscador global */}
        <button
          onClick={() => setBuscando(true)}
          className="flex h-10 flex-1 items-center gap-2.5 rounded-xl border border-borde bg-fondo px-3.5 text-sm text-tinta-tenue transition-colors hover:border-primario/50 lg:max-w-md"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="truncate">{es.buscador.placeholder}</span>
          <kbd className="ml-auto hidden shrink-0 rounded border border-borde bg-superficie px-1.5 py-0.5 text-[10px] font-medium lg:block">
            Ctrl K
          </kbd>
        </button>

        <div className="ml-auto" />

        {/* Campana de notificaciones */}
        <Campana />

        {/* Menú del usuario */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuAbierto((v) => !v)}
            className="flex items-center gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-superficie-2"
            aria-haspopup="menu"
            aria-expanded={menuAbierto}
          >
            <Avatar nombre={usuario.nombre} />
            <span className="hidden text-left leading-tight md:block">
              <span className="block text-sm font-semibold text-tinta">
                {usuario.nombre}
              </span>
              <span className="block text-xs text-tinta-tenue">
                {es.roles[usuario.rol]}
              </span>
            </span>
          </button>

          {menuAbierto && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 w-56 overflow-hidden rounded-xl border border-borde bg-superficie py-1 shadow-xl"
            >
              <div className="border-b border-borde px-4 py-2.5 md:hidden">
                <p className="text-sm font-semibold text-tinta">{usuario.nombre}</p>
                <p className="text-xs text-tinta-tenue">{es.roles[usuario.rol]}</p>
              </div>
              <button
                role="menuitem"
                onClick={alternarTema}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-tinta-suave transition-colors hover:bg-superficie-2 hover:text-tinta"
              >
                {oscuro ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {oscuro ? es.shell.modoClaro : es.shell.modoOscuro}
              </button>
              <button
                role="menuitem"
                onClick={salir}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-tinta-suave transition-colors hover:bg-superficie-2 hover:text-tinta"
              >
                <LogOut className="h-4 w-4" />
                {es.auth.salir}
              </button>
            </div>
          )}
        </div>
      </div>

      <BusquedaGlobal abierta={buscando} onCerrar={() => setBuscando(false)} />
    </header>
  );
}
