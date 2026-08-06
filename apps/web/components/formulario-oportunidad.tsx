"use client";

import { useAvisar } from "@/components/avisos";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mensajeError,
  ETIQUETAS_MODALIDAD,
  MONEDAS,
  es,
  esquemaOportunidad,
  type Oportunidad,
} from "@diprem/core";
import {
  actualizarOportunidad,
  crearOportunidad,
  listarCuentas,
  listarEtapas,
  listarLineasServicio,
  listarPilares,
  listarServicios,
} from "@diprem/api";
import { useEquipo, usePerfil, useSupabase } from "@/lib/hooks";
import { Boton, Campo, Dialogo, Entrada, Selector } from "@/components/ui";

export function FormularioOportunidad({
  abierto,
  oportunidad,
  cuentaFija,
  onCerrar,
}: {
  abierto: boolean;
  oportunidad?: Oportunidad | null;
  /** Si viene, la cuenta queda fija (creación desde el detalle de cuenta). */
  cuentaFija?: { id: string; razon_social: string } | null;
  onCerrar: () => void;
}) {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const avisar = useAvisar();
  const { data: perfil } = usePerfil();
  const { data: equipo } = useEquipo(perfil?.equipo_id);
  const [error, setError] = useState<string | null>(null);
  const [pilarId, setPilarId] = useState<string>(
    oportunidad?.pilar_id?.toString() ?? "",
  );
  const [lineaId, setLineaId] = useState<string>(oportunidad?.linea_servicio_id ?? "");
  // Al crear: solo los 4 campos esenciales; al editar: todo visible
  const [masCampos, setMasCampos] = useState(Boolean(oportunidad));

  const { data: cuentas } = useQuery({
    queryKey: ["cuentas", ""],
    queryFn: () => listarCuentas(supabase),
    enabled: abierto && !cuentaFija,
  });
  const { data: pilares } = useQuery({
    queryKey: ["pilares"],
    queryFn: () => listarPilares(supabase),
    enabled: abierto,
  });
  const { data: lineas } = useQuery({
    queryKey: ["lineas_servicio"],
    queryFn: () => listarLineasServicio(supabase),
    enabled: abierto,
  });
  const { data: servicios } = useQuery({
    queryKey: ["servicios"],
    queryFn: () => listarServicios(supabase),
    enabled: abierto,
  });
  const { data: etapas } = useQuery({
    queryKey: ["etapas"],
    queryFn: () => listarEtapas(supabase),
    enabled: abierto,
  });

  const lineasDelPilar = lineas?.filter(
    (l) => !pilarId || l.pilar_id === Number(pilarId),
  );
  const serviciosDeLinea = servicios?.filter(
    (s) =>
      (!pilarId || s.pilar_id === Number(pilarId)) &&
      (!lineaId || s.linea_servicio_id === lineaId),
  );

  const mutacion = useMutation({
    mutationFn: async (form: FormData) => {
      const datos = esquemaOportunidad.parse({
        nombre: form.get("nombre"),
        cuenta_id: cuentaFija?.id ?? form.get("cuenta_id"),
        monto: form.get("monto") || 0,
        moneda: form.get("moneda"),
        modalidad_contrato: form.get("modalidad_contrato"),
        pilar_id: pilarId ? Number(pilarId) : null,
        linea_servicio_id: lineaId || null,
        servicio_id: (form.get("servicio_id") as string) || null,
        fecha_cierre_estimada: form.get("fecha_cierre_estimada"),
      });

      if (oportunidad) {
        await actualizarOportunidad(supabase, oportunidad.id, datos);
        return;
      }

      const primeraEtapa = etapas?.find(
        (e) => e.activa && !e.es_ganada && !e.es_perdida,
      );
      if (!perfil || !primeraEtapa) throw new Error(es.comunes.errorGenerico);
      await crearOportunidad(supabase, {
        ...datos,
        propietario_id: perfil.id,
        etapa_id: primeraEtapa.id,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["oportunidades"] });
      setError(null);
      avisar(es.confirmaciones.guardado);
      onCerrar();
    },
    onError: (e: Error) => setError(mensajeError(e)),
  });

  const monedaDefault =
    oportunidad?.moneda ?? equipo?.moneda_default ?? "USD";

  return (
    <Dialogo
      abierto={abierto}
      titulo={oportunidad ? es.crm.editarOportunidad : es.crm.nuevaOportunidad}
      onCerrar={onCerrar}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutacion.mutate(new FormData(e.currentTarget));
        }}
      >
        <Campo etiqueta={es.crm.nombreOportunidad}>
          <Entrada
            name="nombre"
            defaultValue={oportunidad?.nombre ?? ""}
            placeholder="Ej: Plan de seguridad — GANFENG Salta"
            required
            autoFocus
          />
        </Campo>

        <Campo etiqueta={es.crm.cuenta}>
          {cuentaFija ? (
            <Entrada value={cuentaFija.razon_social} disabled />
          ) : (
            <Selector
              name="cuenta_id"
              defaultValue={oportunidad?.cuenta_id ?? ""}
              required
              disabled={Boolean(oportunidad)}
            >
              <option value="">—</option>
              {cuentas?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razon_social}
                </option>
              ))}
            </Selector>
          )}
        </Campo>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo etiqueta={es.crm.monto}>
            <Entrada
              name="monto"
              type="number"
              min="0"
              step="0.01"
              defaultValue={oportunidad?.monto ?? ""}
            />
          </Campo>
          <Campo etiqueta={es.crm.moneda}>
            <Selector name="moneda" defaultValue={monedaDefault} key={monedaDefault}>
              {MONEDAS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta={es.crm.modalidad}>
            <Selector
              name="modalidad_contrato"
              defaultValue={oportunidad?.modalidad_contrato ?? "proyecto"}
            >
              {Object.entries(ETIQUETAS_MODALIDAD).map(([valor, etiqueta]) => (
                <option key={valor} value={valor}>
                  {etiqueta}
                </option>
              ))}
            </Selector>
          </Campo>
        </div>

        {/* Crear en 4 campos: lo demás es opcional y vive plegado */}
        <button
          type="button"
          className="text-sm text-primario hover:underline"
          onClick={() => setMasCampos((v) => !v)}
        >
          {masCampos ? es.crm.menosDetalles : es.crm.masDetalles}
        </button>

        {masCampos && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo etiqueta={`${es.crm.pilar} (${es.comunes.opcional})`}>
                <Selector
                  value={pilarId}
                  onChange={(e) => {
                    setPilarId(e.target.value);
                    setLineaId("");
                  }}
                >
                  <option value="">—</option>
                  {pilares?.map((p) => (
                    <option key={p.id} value={p.id}>
                      Pilar {p.numero}
                    </option>
                  ))}
                </Selector>
              </Campo>
              <Campo etiqueta={es.crm.lineaServicio}>
                <Selector
                  value={lineaId}
                  onChange={(e) => setLineaId(e.target.value)}
                  disabled={!pilarId}
                >
                  <option value="">—</option>
                  {lineasDelPilar?.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nombre}
                    </option>
                  ))}
                </Selector>
              </Campo>
              <Campo etiqueta={es.crm.servicio}>
                <Selector
                  name="servicio_id"
                  defaultValue={oportunidad?.servicio_id ?? ""}
                  disabled={!pilarId}
                >
                  <option value="">—</option>
                  {serviciosDeLinea?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </Selector>
              </Campo>
            </div>

            <Campo etiqueta={`${es.crm.fechaCierre} (${es.comunes.opcional})`}>
              <Entrada
                name="fecha_cierre_estimada"
                type="date"
                defaultValue={oportunidad?.fecha_cierre_estimada ?? ""}
              />
            </Campo>
          </>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

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
