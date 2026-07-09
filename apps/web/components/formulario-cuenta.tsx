"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ETIQUETAS_ESTADO_CUENTA,
  ETIQUETAS_VERTICAL,
  es,
  esquemaCuenta,
  type Cuenta,
} from "@diprem/core";
import { actualizarCuenta, crearCuenta } from "@diprem/api";
import { useSupabase, usePerfil } from "@/lib/hooks";
import { Boton, Campo, Dialogo, Entrada, Selector } from "@/components/ui";

export function FormularioCuenta({
  abierto,
  cuenta,
  onCerrar,
  onCreada,
}: {
  abierto: boolean;
  cuenta?: Cuenta | null;
  onCerrar: () => void;
  onCreada?: (cuenta: Cuenta) => void;
}) {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const { data: perfil } = usePerfil();
  const [error, setError] = useState<string | null>(null);

  const mutacion = useMutation({
    mutationFn: async (form: FormData) => {
      const datos = esquemaCuenta.parse({
        razon_social: form.get("razon_social"),
        tax_id: form.get("tax_id"),
        vertical: form.get("vertical"),
        pais: form.get("pais"),
        ciudad: form.get("ciudad"),
        sitio_web: form.get("sitio_web"),
        estado: form.get("estado"),
      });
      if (cuenta) {
        await actualizarCuenta(supabase, cuenta.id, datos);
        return null;
      }
      if (!perfil) throw new Error(es.comunes.errorGenerico);
      return crearCuenta(supabase, {
        ...datos,
        propietario_id: perfil.id,
        equipo_id: perfil.equipo_id,
      });
    },
    onSuccess: (creada) => {
      void queryClient.invalidateQueries({ queryKey: ["cuentas"] });
      void queryClient.invalidateQueries({ queryKey: ["cuenta"] });
      setError(null);
      onCerrar();
      if (creada && onCreada) onCreada(creada);
    },
    onError: (e: Error) => setError(e.message || es.comunes.errorGenerico),
  });

  return (
    <Dialogo
      abierto={abierto}
      titulo={cuenta ? es.crm.editarCuenta : es.crm.nuevaCuenta}
      onCerrar={onCerrar}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutacion.mutate(new FormData(e.currentTarget));
        }}
      >
        <Campo etiqueta={es.crm.razonSocial}>
          <Entrada
            name="razon_social"
            defaultValue={cuenta?.razon_social ?? ""}
            required
            autoFocus
          />
        </Campo>
        <div className="grid grid-cols-2 gap-4">
          <Campo etiqueta={es.crm.vertical}>
            <Selector name="vertical" defaultValue={cuenta?.vertical ?? "mineria"}>
              {Object.entries(ETIQUETAS_VERTICAL).map(([valor, etiqueta]) => (
                <option key={valor} value={valor}>
                  {etiqueta}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta={es.crm.estado}>
            <Selector name="estado" defaultValue={cuenta?.estado ?? "prospecto"}>
              {Object.entries(ETIQUETAS_ESTADO_CUENTA).map(([valor, etiqueta]) => (
                <option key={valor} value={valor}>
                  {etiqueta}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta={`${es.crm.taxId} (${es.comunes.opcional})`}>
            <Entrada name="tax_id" defaultValue={cuenta?.tax_id ?? ""} />
          </Campo>
          <Campo etiqueta={`${es.crm.pais} (${es.comunes.opcional})`}>
            <Entrada name="pais" defaultValue={cuenta?.pais ?? ""} />
          </Campo>
          <Campo etiqueta={`${es.crm.ciudad} (${es.comunes.opcional})`}>
            <Entrada name="ciudad" defaultValue={cuenta?.ciudad ?? ""} />
          </Campo>
          <Campo etiqueta={`${es.crm.sitioWeb} (${es.comunes.opcional})`}>
            <Entrada name="sitio_web" defaultValue={cuenta?.sitio_web ?? ""} />
          </Campo>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Boton type="button" variante="secundario" onClick={onCerrar}>
            {es.comunes.cancelar}
          </Boton>
          <Boton type="submit" disabled={mutacion.isPending}>
            {mutacion.isPending ? es.comunes.guardando : es.comunes.guardar}
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}
