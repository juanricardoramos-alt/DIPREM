"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import {
  DIAS_PROYECTO_SIN_GESTION,
  es,
  proyectosSinGestion,
  type FilaGestionProyecto,
} from "@diprem/core";
import { recordarProyecto } from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { Boton, EstadoVacio, Insignia, TarjetasEsqueleto } from "@/components/ui";

/**
 * Proyectos asignados sin ninguna gestión en los últimos 7 días.
 * El botón "Recordar" crea una alerta in-app para el ejecutivo responsable.
 */
export function ProyectosSinGestion({
  proyectos,
  cargando,
}: {
  proyectos: FilaGestionProyecto[];
  cargando: boolean;
}) {
  const supabase = useSupabase();
  const [recordados, setRecordados] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const sinGestion = proyectosSinGestion(proyectos);

  const recordar = useMutation({
    mutationFn: (proyectoId: string) => recordarProyecto(supabase, proyectoId),
    onSuccess: (_datos, proyectoId) => {
      setRecordados((prev) => new Set(prev).add(proyectoId));
      setError(null);
    },
    onError: (e: Error) => setError(e.message || es.comunes.errorGenerico),
  });

  return (
    <section>
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <BellRing className="h-5 w-5 text-amber-500" /> {es.control.sinGestionTitulo}
      </h2>
      <p className="text-sm text-tinta-suave">
        {es.control.sinGestionNota(DIAS_PROYECTO_SIN_GESTION)}
      </p>

      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-3 space-y-2">
        {cargando && <TarjetasEsqueleto />}
        {!cargando && sinGestion.length === 0 && (
          <EstadoVacio titulo={es.control.todosGestionados} />
        )}
        {sinGestion.map((proyecto) => (
          <div
            key={proyecto.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-superficie p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {proyecto.lead_id ? (
                  <Link
                    href={`/leads/${proyecto.lead_id}`}
                    className="hover:text-primario hover:underline"
                  >
                    {proyecto.proyecto}
                  </Link>
                ) : (
                  proyecto.proyecto
                )}
              </p>
              <p className="truncate text-xs text-tinta-suave">
                {proyecto.empresa} · {proyecto.ejecutivo ?? "—"}
              </p>
            </div>
            <Insignia tono={proyecto.dias >= 14 ? "rojo" : "ambar"}>
              {es.gestion.diasSinGestion(proyecto.dias)}
            </Insignia>
            {recordados.has(proyecto.id) ? (
              <span className="text-sm text-emerald-600 dark:text-emerald-400">
                {es.control.recordatorioEnviado}
              </span>
            ) : (
              <Boton
                variante="secundario"
                disabled={recordar.isPending}
                onClick={() => recordar.mutate(proyecto.id)}
              >
                🔔 {recordar.isPending ? es.control.recordando : es.control.recordar}
              </Boton>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
