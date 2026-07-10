"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Building2,
  Search,
  SquareKanban,
  Store,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { es } from "@diprem/core";
import { busquedaGlobal, type ResultadoBusqueda, type TipoResultado } from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { Esqueleto } from "@/components/ui";

const ICONO_TIPO: Record<TipoResultado, LucideIcon> = {
  cuenta: Building2,
  lead: UserPlus,
  oportunidad: SquareKanban,
  proyecto: Store,
  ejecutivo: BarChart3,
};

/**
 * Buscador global: se abre con Ctrl+K (o el botón del header) y busca en
 * cuentas, leads, oportunidades, proyectos del mercado y ejecutivos.
 * Flechas + Enter para navegar directo al resultado.
 */
export function BusquedaGlobal({
  abierta,
  onCerrar,
}: {
  abierta: boolean;
  onCerrar: () => void;
}) {
  const supabase = useSupabase();
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [consulta, setConsulta] = useState("");
  const [indice, setIndice] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce de 250 ms para no consultar por cada tecla
  useEffect(() => {
    const timer = setTimeout(() => setConsulta(texto), 250);
    return () => clearTimeout(timer);
  }, [texto]);

  useEffect(() => {
    if (abierta) {
      setTexto("");
      setConsulta("");
      setIndice(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [abierta]);

  const { data: resultados, isFetching } = useQuery({
    queryKey: ["busqueda", consulta],
    queryFn: () => busquedaGlobal(supabase, consulta),
    enabled: abierta && consulta.trim().length >= 2,
    staleTime: 30_000,
  });

  const lista = useMemo(() => resultados ?? [], [resultados]);
  const grupos = useMemo(() => {
    const porTipo = new Map<TipoResultado, ResultadoBusqueda[]>();
    for (const r of lista) {
      porTipo.set(r.tipo, [...(porTipo.get(r.tipo) ?? []), r]);
    }
    return porTipo;
  }, [lista]);

  const ir = (resultado: ResultadoBusqueda) => {
    onCerrar();
    router.push(resultado.ruta);
  };

  const manejarTeclas = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndice((i) => Math.min(i + 1, lista.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndice((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && lista[indice]) {
      e.preventDefault();
      ir(lista[indice]);
    }
  };

  if (!abierta) return null;

  const buscando = consulta.trim().length >= 2;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-borde bg-superficie shadow-2xl">
        <div className="flex items-center gap-3 border-b border-borde px-4">
          <Search className="h-5 w-5 shrink-0 text-tinta-tenue" />
          <input
            ref={inputRef}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setIndice(0);
            }}
            onKeyDown={manejarTeclas}
            placeholder={es.buscador.placeholder}
            className="w-full bg-transparent py-3.5 text-sm text-tinta placeholder:text-tinta-tenue focus:outline-none"
          />
          <kbd className="hidden rounded border border-borde px-1.5 py-0.5 text-[10px] text-tinta-tenue sm:block">
            ESC
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {!buscando && (
            <p className="px-3 py-6 text-center text-sm text-tinta-tenue">
              {es.buscador.escribeParaBuscar}
            </p>
          )}
          {buscando && isFetching && (
            <div className="space-y-2 p-2">
              <Esqueleto className="h-9" />
              <Esqueleto className="h-9" />
              <Esqueleto className="h-9" />
            </div>
          )}
          {buscando && !isFetching && lista.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-tinta-tenue">
              {es.buscador.sinResultados(consulta)}
            </p>
          )}
          {[...grupos.entries()].map(([tipo, items]) => (
            <div key={tipo} className="mb-1">
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-tinta-tenue">
                {es.buscador.grupos[tipo]}
              </p>
              {items.map((resultado) => {
                const Icono = ICONO_TIPO[resultado.tipo];
                const posicion = lista.indexOf(resultado);
                return (
                  <button
                    key={`${resultado.tipo}-${resultado.id}`}
                    onClick={() => ir(resultado)}
                    onMouseEnter={() => setIndice(posicion)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                      posicion === indice
                        ? "bg-primario-suave text-primario"
                        : "text-tinta hover:bg-superficie-2"
                    }`}
                  >
                    <Icono className="h-4 w-4 shrink-0 opacity-70" />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {resultado.titulo}
                    </span>
                    {resultado.subtitulo && (
                      <span className="max-w-40 truncate text-xs text-tinta-tenue">
                        {resultado.subtitulo}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
