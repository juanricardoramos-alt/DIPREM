"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { es, type Actividad } from "@diprem/core";
import { completarActividad } from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { AreaTexto, Boton, Campo, Dialogo, Entrada } from "@/components/ui";

export function DialogoCompletar({
  actividad,
  onCerrar,
}: {
  actividad: Actividad | null;
  onCerrar: () => void;
}) {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mutacion = useMutation({
    mutationFn: async (form: FormData) => {
      if (!actividad) return;
      await completarActividad(supabase, actividad.id, {
        resultado: (form.get("resultado") as string) || null,
        proxima_accion: (form.get("proxima_accion") as string) || null,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["actividades"] });
      void queryClient.invalidateQueries({ queryKey: ["agenda"] });
      void queryClient.invalidateQueries({ queryKey: ["seguimientos"] });
      void queryClient.invalidateQueries({ queryKey: ["oportunidades"] });
      setError(null);
      onCerrar();
    },
    onError: (e: Error) => setError(e.message || es.comunes.errorGenerico),
  });

  return (
    <Dialogo
      abierto={actividad !== null}
      titulo={`${es.actividades.completarTitulo} — ${actividad?.asunto ?? ""}`}
      onCerrar={onCerrar}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutacion.mutate(new FormData(e.currentTarget));
        }}
      >
        <Campo etiqueta={`${es.actividades.resultado} (${es.comunes.opcional})`}>
          <AreaTexto name="resultado" autoFocus placeholder="¿Qué pasó? ¿Qué se acordó?" />
        </Campo>
        <Campo etiqueta={`${es.actividades.proximaAccion} (${es.comunes.opcional})`}>
          <Entrada
            name="proxima_accion"
            placeholder="Ej: Agendar visita a faena la próxima semana"
          />
        </Campo>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Boton type="button" variante="secundario" onClick={onCerrar}>
            {es.comunes.cancelar}
          </Boton>
          <Boton type="submit" disabled={mutacion.isPending}>
            {mutacion.isPending ? es.comunes.guardando : es.miDia.completar}
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}
