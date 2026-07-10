"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { es, type EtapaEmbudo } from "@diprem/core";
import { guardarEtapa, intercambiarOrdenEtapas, listarEtapas } from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import {
  Boton,
  Campo,
  Dialogo,
  Entrada,
  Insignia,
} from "@/components/ui";

export function EditorEtapas() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState<{ etapa: EtapaEmbudo | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: etapas } = useQuery({
    queryKey: ["etapas"],
    queryFn: () => listarEtapas(supabase),
  });

  const invalidar = () =>
    void queryClient.invalidateQueries({ queryKey: ["etapas"] });

  const guardar = useMutation({
    mutationFn: async (form: FormData) => {
      const nombre = (form.get("nombre") as string)?.trim();
      if (!nombre) throw new Error("El nombre es obligatorio");
      const probabilidad = Number(form.get("probabilidad_default"));
      if (Number.isNaN(probabilidad) || probabilidad < 0 || probabilidad > 100) {
        throw new Error("La probabilidad debe estar entre 0 y 100");
      }
      const orden =
        editando?.etapa?.orden ??
        Math.max(0, ...(etapas?.map((e) => e.orden) ?? [])) + 1;
      await guardarEtapa(supabase, {
        id: editando?.etapa?.id,
        nombre,
        orden,
        probabilidad_default: probabilidad,
        es_ganada: form.get("es_ganada") === "on",
        es_perdida: form.get("es_perdida") === "on",
        activa: form.get("activa") === "on",
      });
    },
    onSuccess: () => {
      invalidar();
      setEditando(null);
      setError(null);
    },
    onError: (e: Error) => setError(e.message || es.comunes.errorGenerico),
  });

  const intercambiar = useMutation({
    mutationFn: ({ a, b }: { a: EtapaEmbudo; b: EtapaEmbudo }) =>
      intercambiarOrdenEtapas(supabase, a, b),
    onSuccess: invalidar,
  });

  const ordenadas = etapas ?? [];

  return (
    <section>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{es.admin.etapasEmbudo}</h2>
          <p className="mt-1 max-w-2xl text-sm text-tinta-suave">
            {es.admin.etapasDescripcion}
          </p>
        </div>
        <Boton onClick={() => setEditando({ etapa: null })}>
          + {es.admin.nuevaEtapa}
        </Boton>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-borde bg-superficie">
        <table className="w-full text-sm">
          <thead className="bg-superficie-2 text-left text-xs uppercase text-tinta-suave">
            <tr>
              <th className="px-4 py-3">{es.admin.orden}</th>
              <th className="px-4 py-3">{es.admin.nombreEtapa}</th>
              <th className="px-4 py-3">{es.admin.probabilidadDefault}</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">{es.admin.activa}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((etapa, i) => (
              <tr key={etapa.id} className="border-t border-borde">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <span className="w-6 text-tinta-suave">{etapa.orden}</span>
                    <button
                      aria-label={es.admin.subir}
                      disabled={i === 0}
                      onClick={() => {
                        const anterior = ordenadas[i - 1];
                        if (anterior)
                          intercambiar.mutate({ a: etapa, b: anterior });
                      }}
                      className="rounded px-1 text-tinta-tenue hover:bg-superficie-2 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      aria-label={es.admin.bajar}
                      disabled={i === ordenadas.length - 1}
                      onClick={() => {
                        const siguiente = ordenadas[i + 1];
                        if (siguiente)
                          intercambiar.mutate({ a: etapa, b: siguiente });
                      }}
                      className="rounded px-1 text-tinta-tenue hover:bg-superficie-2 disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 font-medium">{etapa.nombre}</td>
                <td className="px-4 py-3">{etapa.probabilidad_default}%</td>
                <td className="px-4 py-3">
                  {etapa.es_ganada && <Insignia tono="verde">Adjudicado</Insignia>}
                  {etapa.es_perdida && <Insignia tono="rojo">Perdido</Insignia>}
                  {!etapa.es_ganada && !etapa.es_perdida && (
                    <Insignia tono="azul">En proceso</Insignia>
                  )}
                </td>
                <td className="px-4 py-3">{etapa.activa ? "Sí" : "No"}</td>
                <td className="px-4 py-3 text-right">
                  <Boton variante="fantasma" onClick={() => setEditando({ etapa })}>
                    {es.comunes.editar}
                  </Boton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialogo
        abierto={editando !== null}
        titulo={editando?.etapa ? `${es.comunes.editar}: ${editando.etapa.nombre}` : es.admin.nuevaEtapa}
        onCerrar={() => setEditando(null)}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            guardar.mutate(new FormData(e.currentTarget));
          }}
        >
          <Campo etiqueta={es.admin.nombreEtapa}>
            <Entrada
              name="nombre"
              defaultValue={editando?.etapa?.nombre ?? ""}
              required
              autoFocus
            />
          </Campo>
          <Campo etiqueta={es.admin.probabilidadDefault}>
            <Entrada
              name="probabilidad_default"
              type="number"
              min="0"
              max="100"
              defaultValue={editando?.etapa?.probabilidad_default ?? 10}
              required
            />
          </Campo>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="es_ganada"
                defaultChecked={editando?.etapa?.es_ganada ?? false}
              />
              {es.admin.esGanada}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="es_perdida"
                defaultChecked={editando?.etapa?.es_perdida ?? false}
              />
              {es.admin.esPerdida}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="activa"
                defaultChecked={editando?.etapa?.activa ?? true}
              />
              {es.admin.activa}
            </label>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Boton type="button" variante="secundario" onClick={() => setEditando(null)}>
              {es.comunes.cancelar}
            </Boton>
            <Boton type="submit" disabled={guardar.isPending}>
              {guardar.isPending ? es.comunes.guardando : es.comunes.guardar}
            </Boton>
          </div>
        </form>
      </Dialogo>
    </section>
  );
}
