"use client";

import { useAvisar } from "@/components/avisos";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Trash2 } from "lucide-react";
import { mensajeError, es, formatearFechaCorta, formatearHora, type EntidadNota } from "@diprem/core";
import { crearNota, eliminarNota, listarNotas } from "@diprem/api";
import { usePerfil, useSupabase } from "@/lib/hooks";
import { AreaTexto, Avatar, Boton, EstadoVacio, TarjetasEsqueleto } from "@/components/ui";

/**
 * Hilo de notas internas sobre un lead, oportunidad o cuenta.
 * Visibilidad: RLS heredada (ejecutivo dueño + su gerente + admin).
 * Al comentar, el ejecutivo del registro recibe una notificación automática.
 */
export function NotasInternas({
  entidad,
  entidadId,
  compacto = false,
}: {
  entidad: EntidadNota;
  entidadId: string;
  /** true = sin título de sección (para usar dentro de un diálogo) */
  compacto?: boolean;
}) {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const avisar = useAvisar();
  const { data: perfil } = usePerfil();
  const [contenido, setContenido] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: notas, isLoading } = useQuery({
    queryKey: ["notas", entidad, entidadId],
    queryFn: () => listarNotas(supabase, entidad, entidadId),
  });

  const agregar = useMutation({
    mutationFn: async () => {
      const texto = contenido.trim();
      if (!texto || !perfil) throw new Error(es.comunes.errorGenerico);
      await crearNota(supabase, {
        entidad,
        entidad_id: entidadId,
        autor_id: perfil.id,
        contenido: texto,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notas", entidad, entidadId] });
      setContenido("");
      setError(null);
      avisar(es.confirmaciones.notaAgregada);
    },
    onError: (e: Error) => setError(mensajeError(e)),
  });

  const borrar = useMutation({
    mutationFn: (id: string) => eliminarNota(supabase, id),
    onSuccess: () => {
      avisar(es.confirmaciones.eliminado);
      void queryClient.invalidateQueries({ queryKey: ["notas", entidad, entidadId] });
    },
  });

  return (
    <section className="print:hidden">
      {!compacto && (
        <>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <MessageSquare className="h-5 w-5 text-primario" /> {es.notas.titulo}
          </h2>
          <p className="text-sm text-tinta-suave">{es.notas.descripcion}</p>
        </>
      )}

      {/* Agregar nota */}
      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          agregar.mutate();
        }}
      >
        <AreaTexto
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
          placeholder={es.notas.placeholder}
          rows={2}
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex justify-end">
          <Boton type="submit" disabled={agregar.isPending || !contenido.trim()}>
            {agregar.isPending ? es.notas.agregando : es.notas.agregar}
          </Boton>
        </div>
      </form>

      {/* Hilo */}
      <div className="mt-3 space-y-2">
        {isLoading && <TarjetasEsqueleto cantidad={2} />}
        {!isLoading && (notas?.length ?? 0) === 0 && (
          <EstadoVacio titulo={es.notas.sinNotas} />
        )}
        {notas?.map((nota) => (
          <div
            key={nota.id}
            className="flex items-start gap-3 rounded-xl border border-borde bg-superficie shadow-sm p-3"
          >
            <Avatar nombre={nota.autor?.nombre ?? "?"} tamano="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-semibold">{nota.autor?.nombre ?? "—"}</span>
                <span className="ml-2 text-xs text-tinta-tenue">
                  {formatearFechaCorta(nota.creado_en)} {formatearHora(nota.creado_en)}
                </span>
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-tinta-suave">
                {nota.contenido}
              </p>
            </div>
            {(perfil?.id === nota.autor_id || perfil?.rol === "admin") && (
              <button
                aria-label={es.notas.eliminar}
                title={es.notas.eliminar}
                onClick={() => {
                  if (confirm(es.comunes.confirmarEliminar)) borrar.mutate(nota.id);
                }}
                className="rounded-lg p-1 text-tinta-tenue transition-colors hover:bg-superficie-2 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
