"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ETIQUETAS_ESTADO_ACTIVIDAD,
  ETIQUETAS_TIPO_ACTIVIDAD,
  ICONOS_TIPO_ACTIVIDAD,
  es,
  formatearFechaCorta,
  formatearHora,
  type Actividad,
  type EstadoActividad,
  type TipoActividad,
} from "@diprem/core";
import { cancelarActividad, listarActividades } from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { Boton, Insignia, Selector } from "@/components/ui";
import { FormularioActividad } from "@/components/formulario-actividad";
import { DialogoCompletar } from "@/components/dialogo-completar";

const TONO_ESTADO = {
  pendiente: "azul",
  completada: "verde",
  cancelada: "gris",
} as const;

export default function PaginaActividades() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const [estado, setEstado] = useState<EstadoActividad | "">("");
  const [tipo, setTipo] = useState<TipoActividad | "">("");
  const [formulario, setFormulario] = useState<{ actividad: Actividad | null } | null>(
    null,
  );
  const [completando, setCompletando] = useState<Actividad | null>(null);

  const { data: actividades, isLoading } = useQuery({
    queryKey: ["actividades", estado],
    queryFn: () => listarActividades(supabase, estado ? { estado } : undefined),
  });

  const cancelar = useMutation({
    mutationFn: (id: string) => cancelarActividad(supabase, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["actividades"] });
      void queryClient.invalidateQueries({ queryKey: ["agenda"] });
    },
  });

  const visibles = actividades?.filter((a) => !tipo || a.tipo === tipo);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{es.nav.actividades}</h1>
        <div className="flex items-center gap-2">
          <Selector
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoActividad | "")}
            className="w-44 rounded-md border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="">{es.actividades.filtroTodas}</option>
            {Object.entries(ETIQUETAS_TIPO_ACTIVIDAD).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </Selector>
          <Selector
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoActividad | "")}
            className="w-40 rounded-md border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="">{es.actividades.filtroTodas}</option>
            {Object.entries(ETIQUETAS_ESTADO_ACTIVIDAD).map(([valor, etiqueta]) => (
              <option key={valor} value={valor}>
                {etiqueta}
              </option>
            ))}
          </Selector>
          <Boton onClick={() => setFormulario({ actividad: null })}>
            + {es.actividades.nueva}
          </Boton>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">{es.actividades.tipo}</th>
              <th className="px-4 py-3">{es.actividades.asunto}</th>
              <th className="px-4 py-3">{es.actividades.cuenta}</th>
              <th className="px-4 py-3">{es.actividades.fechaProgramada}</th>
              <th className="px-4 py-3">{es.actividades.estado}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  {es.comunes.cargando}
                </td>
              </tr>
            )}
            {!isLoading && (visibles?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  {es.actividades.sinActividades}
                </td>
              </tr>
            )}
            {visibles?.map((actividad) => (
              <tr
                key={actividad.id}
                className="border-t border-slate-100 hover:bg-slate-50"
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  {ICONOS_TIPO_ACTIVIDAD[actividad.tipo]}{" "}
                  {ETIQUETAS_TIPO_ACTIVIDAD[actividad.tipo]}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium">{actividad.asunto}</p>
                  {actividad.proxima_accion && (
                    <p className="text-xs text-amber-700">
                      → {actividad.proxima_accion}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  {actividad.cuenta?.razon_social ?? "—"}
                  {actividad.oportunidad?.nombre && (
                    <p className="text-xs text-slate-400">
                      {actividad.oportunidad.nombre}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {actividad.fecha_programada
                    ? `${formatearFechaCorta(actividad.fecha_programada)} ${formatearHora(actividad.fecha_programada)}`
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <Insignia tono={TONO_ESTADO[actividad.estado]}>
                    {ETIQUETAS_ESTADO_ACTIVIDAD[actividad.estado]}
                  </Insignia>
                </td>
                <td className="px-4 py-3 text-right">
                  {actividad.estado === "pendiente" && (
                    <div className="flex justify-end gap-1">
                      <Boton
                        variante="secundario"
                        onClick={() => setCompletando(actividad)}
                      >
                        ✓ {es.miDia.completar}
                      </Boton>
                      <Boton
                        variante="fantasma"
                        onClick={() => setFormulario({ actividad })}
                      >
                        {es.comunes.editar}
                      </Boton>
                      <Boton
                        variante="fantasma"
                        onClick={() => cancelar.mutate(actividad.id)}
                      >
                        ✕
                      </Boton>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {formulario && (
        <FormularioActividad
          abierto
          actividad={formulario.actividad}
          onCerrar={() => setFormulario(null)}
        />
      )}
      <DialogoCompletar actividad={completando} onCerrar={() => setCompletando(null)} />
    </div>
  );
}
