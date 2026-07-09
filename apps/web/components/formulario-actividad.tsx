"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ETIQUETAS_TIPO_ACTIVIDAD,
  ICONOS_TIPO_ACTIVIDAD,
  aDatetimeLocal,
  es,
  esquemaActividad,
  type Actividad,
  type TipoActividad,
} from "@diprem/core";
import {
  actualizarActividad,
  crearActividad,
  listarCuentas,
  listarOportunidades,
} from "@diprem/api";
import { usePerfil, useSupabase } from "@/lib/hooks";
import {
  AreaTexto,
  Boton,
  Campo,
  Dialogo,
  Entrada,
  Selector,
} from "@/components/ui";

export function FormularioActividad({
  abierto,
  onCerrar,
  actividad,
  tipoInicial = "llamada",
  cuentaFija,
  oportunidadFija,
  registroRapido = false,
}: {
  abierto: boolean;
  onCerrar: () => void;
  actividad?: Actividad | null;
  tipoInicial?: TipoActividad;
  cuentaFija?: { id: string; razon_social: string } | null;
  oportunidadFija?: { id: string; nombre: string; cuenta_id: string } | null;
  /** true = flujo "registrar gestión ya realizada" (marca completada al guardar) */
  registroRapido?: boolean;
}) {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const { data: perfil } = usePerfil();
  const [error, setError] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoActividad>(actividad?.tipo ?? tipoInicial);
  const [cuentaId, setCuentaId] = useState<string>(
    actividad?.cuenta_id ?? oportunidadFija?.cuenta_id ?? cuentaFija?.id ?? "",
  );
  const [yaRealizada, setYaRealizada] = useState(registroRapido);

  const { data: cuentas } = useQuery({
    queryKey: ["cuentas", ""],
    queryFn: () => listarCuentas(supabase),
    enabled: abierto && !cuentaFija && !oportunidadFija,
  });
  const { data: oportunidades } = useQuery({
    queryKey: ["oportunidades", {}],
    queryFn: () => listarOportunidades(supabase),
    enabled: abierto && !oportunidadFija,
  });

  const oportunidadesDeCuenta = oportunidades?.filter(
    (o) => !cuentaId || o.cuenta_id === cuentaId,
  );

  const mutacion = useMutation({
    mutationFn: async (form: FormData) => {
      const datos = esquemaActividad.parse({
        tipo,
        asunto: form.get("asunto"),
        cuenta_id: cuentaFija?.id ?? (cuentaId || null),
        oportunidad_id:
          oportunidadFija?.id ?? ((form.get("oportunidad_id") as string) || null),
        fecha_programada: form.get("fecha_programada")
          ? new Date(form.get("fecha_programada") as string).toISOString()
          : null,
        fecha_vencimiento: form.get("fecha_vencimiento")
          ? new Date(form.get("fecha_vencimiento") as string).toISOString()
          : null,
        notas: form.get("notas"),
        proxima_accion: form.get("proxima_accion"),
      });

      if (actividad) {
        await actualizarActividad(supabase, actividad.id, datos);
        return;
      }
      if (!perfil) throw new Error(es.comunes.errorGenerico);
      await crearActividad(supabase, {
        ...datos,
        propietario_id: perfil.id,
        ...(yaRealizada
          ? {
              estado: "completada" as const,
              completada_en: new Date().toISOString(),
              fecha_programada: datos.fecha_programada ?? new Date().toISOString(),
              resultado: (form.get("resultado") as string) || null,
            }
          : {}),
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

  const titulo = actividad
    ? es.actividades.editar
    : registroRapido
      ? es.miDia.registrarGestion
      : es.actividades.nueva;

  return (
    <Dialogo abierto={abierto} titulo={titulo} onCerrar={onCerrar}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutacion.mutate(new FormData(e.currentTarget));
        }}
      >
        {/* Tipo en botones grandes: registro en pocos clics */}
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ETIQUETAS_TIPO_ACTIVIDAD) as TipoActividad[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={`rounded-lg border px-3 py-2 text-sm ${
                tipo === t
                  ? "border-[var(--color-diprem)] bg-[var(--color-diprem)] text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {ICONOS_TIPO_ACTIVIDAD[t]} {ETIQUETAS_TIPO_ACTIVIDAD[t]}
            </button>
          ))}
        </div>

        <Campo etiqueta={es.actividades.asunto}>
          <Entrada
            name="asunto"
            defaultValue={actividad?.asunto ?? ""}
            placeholder="Ej: Llamada de seguimiento propuesta SSO"
            required
            autoFocus
          />
        </Campo>

        <div className="grid grid-cols-2 gap-4">
          <Campo etiqueta={`${es.actividades.cuenta} (${es.comunes.opcional})`}>
            {cuentaFija || oportunidadFija ? (
              <Entrada
                value={cuentaFija?.razon_social ?? "(de la oportunidad)"}
                disabled
              />
            ) : (
              <Selector value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
                <option value="">—</option>
                {cuentas?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.razon_social}
                  </option>
                ))}
              </Selector>
            )}
          </Campo>
          <Campo etiqueta={`${es.actividades.oportunidad} (${es.comunes.opcional})`}>
            {oportunidadFija ? (
              <Entrada value={oportunidadFija.nombre} disabled />
            ) : (
              <Selector
                name="oportunidad_id"
                defaultValue={actividad?.oportunidad_id ?? ""}
              >
                <option value="">—</option>
                {oportunidadesDeCuenta?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </Selector>
            )}
          </Campo>
        </div>

        {!actividad && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={yaRealizada}
              onChange={(e) => setYaRealizada(e.target.checked)}
            />
            {es.miDia.yaRealizada}
          </label>
        )}

        {yaRealizada && !actividad ? (
          <Campo etiqueta={`${es.actividades.resultado} (${es.comunes.opcional})`}>
            <Entrada name="resultado" placeholder="Ej: Cliente pide ajustar plazo" />
          </Campo>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <Campo etiqueta={es.actividades.fechaProgramada}>
              <Entrada
                name="fecha_programada"
                type="datetime-local"
                defaultValue={
                  actividad?.fecha_programada
                    ? aDatetimeLocal(new Date(actividad.fecha_programada))
                    : aDatetimeLocal()
                }
              />
            </Campo>
            {tipo === "tarea" && (
              <Campo etiqueta={`${es.actividades.fechaVencimiento} (${es.comunes.opcional})`}>
                <Entrada
                  name="fecha_vencimiento"
                  type="datetime-local"
                  defaultValue={
                    actividad?.fecha_vencimiento
                      ? aDatetimeLocal(new Date(actividad.fecha_vencimiento))
                      : ""
                  }
                />
              </Campo>
            )}
          </div>
        )}

        <Campo etiqueta={`${es.miDia.registrarGestion} → ${es.actividades.proximaAccion} (${es.comunes.opcional})`}>
          <Entrada
            name="proxima_accion"
            defaultValue={actividad?.proxima_accion ?? ""}
            placeholder="Ej: Enviar propuesta actualizada el lunes"
          />
        </Campo>
        <Campo etiqueta={`${es.actividades.notas} (${es.comunes.opcional})`}>
          <AreaTexto name="notas" defaultValue={actividad?.notas ?? ""} />
        </Campo>

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
