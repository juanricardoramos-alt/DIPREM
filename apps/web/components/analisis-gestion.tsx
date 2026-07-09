"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ETIQUETAS_INTENSIDAD,
  ETIQUETAS_TIPO_ACTIVIDAD,
  ICONOS_TIPO_ACTIVIDAD,
  es,
  formatearHora,
  intensidadGestion,
  lineaDeTiempo,
  proximaAccion,
  resumenPorTipo,
  semaforoGestion,
  type Actividad,
  type IntensidadGestion,
  type TipoActividad,
} from "@diprem/core";
import { actividadesDeEntidad } from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { Boton, Insignia } from "@/components/ui";
import { FormularioActividad } from "@/components/formulario-actividad";

const TONO_SEMAFORO = { ok: "verde", atencion: "ambar", critico: "rojo" } as const;
const TONO_INTENSIDAD: Record<IntensidadGestion, "rojo" | "ambar" | "azul" | "verde"> = {
  sin_gestion: "rojo",
  poca: "ambar",
  regular: "azul",
  intensa: "verde",
};

function fechaLarga(iso: string): string {
  return `${new Date(iso).toLocaleDateString("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })} ${formatearHora(iso)}`;
}

/**
 * Sección "Análisis de gestión" del detalle de un lead o una cuenta:
 * semáforo de días sin gestión, intensidad, resumen por tipo, próxima acción
 * y línea de tiempo de todas las interacciones (más reciente primero).
 */
export function AnalisisGestion({
  lead,
  cuenta,
  creadoEn,
}: {
  lead?: { id: string; nombre: string } | null;
  cuenta?: { id: string; razon_social: string } | null;
  /** fecha de creación de la entidad (referencia si aún no hay gestiones) */
  creadoEn: string;
}) {
  const supabase = useSupabase();
  const [registrando, setRegistrando] = useState(false);
  const entidad = lead ? "lead" : "cuenta";
  const entidadId = lead?.id ?? cuenta?.id ?? "";

  const { data: actividades, isLoading, error } = useQuery({
    queryKey: ["gestion", entidad, entidadId],
    queryFn: () => actividadesDeEntidad(supabase, entidad, entidadId),
    enabled: entidadId !== "",
  });

  const historial = lineaDeTiempo(actividades ?? []);
  const ultimaGestion = historial[0]?.completada_en ?? null;
  const dias = Math.max(
    0,
    Math.floor(
      (Date.now() - new Date(ultimaGestion ?? creadoEn).getTime()) / 86_400_000,
    ),
  );
  const semaforo = semaforoGestion(dias);
  const resumen = resumenPorTipo(actividades ?? []);
  const siguiente = proximaAccion(actividades ?? []);
  const intensidad = intensidadGestion(historial.length, creadoEn);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{es.gestion.titulo}</h2>
        <Boton variante="secundario" onClick={() => setRegistrando(true)}>
          + {es.miDia.registrarGestion}
        </Boton>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{(error as Error).message}</p>}
      {isLoading && <p className="mt-3 text-sm text-slate-400">{es.comunes.cargando}</p>}

      {!isLoading && !error && (
        <>
          {/* Indicadores */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Insignia tono={TONO_SEMAFORO[semaforo]}>
              {es.gestion.diasSinGestion(dias)}
            </Insignia>
            <Insignia tono={TONO_INTENSIDAD[intensidad]}>
              {es.gestion.intensidad}: {ETIQUETAS_INTENSIDAD[intensidad]}
            </Insignia>
            {(Object.entries(resumen) as [TipoActividad, number][]).map(
              ([tipo, total]) => (
                <span
                  key={tipo}
                  className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                  title={es.gestion.resumenTipos}
                >
                  {ICONOS_TIPO_ACTIVIDAD[tipo]} {ETIQUETAS_TIPO_ACTIVIDAD[tipo]}: {total}
                </span>
              ),
            )}
          </div>

          {/* Próxima acción destacada */}
          <div
            className={`mt-3 rounded-lg border p-3 text-sm ${
              siguiente
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-dashed border-slate-300 text-slate-400"
            }`}
          >
            <span className="font-semibold">→ {es.gestion.proximaAccion}: </span>
            {siguiente ? (
              <>
                {siguiente.tipo && `${ICONOS_TIPO_ACTIVIDAD[siguiente.tipo]} `}
                {siguiente.texto}
                {siguiente.fecha && ` · ${fechaLarga(siguiente.fecha)}`}
              </>
            ) : (
              es.gestion.sinProximaAccion
            )}
          </div>

          {/* Línea de tiempo */}
          <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-slate-400">
            {es.gestion.lineaTiempo}
          </h3>
          {historial.length === 0 ? (
            <p className="mt-2 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
              {es.gestion.sinGestiones}
            </p>
          ) : (
            <ol className="mt-2 space-y-0">
              {historial.map((actividad, i) => (
                <ItemLineaTiempo
                  key={actividad.id}
                  actividad={actividad}
                  ultimo={i === historial.length - 1}
                />
              ))}
            </ol>
          )}
        </>
      )}

      {registrando && (
        <FormularioActividad
          abierto
          registroRapido
          leadFijo={lead ?? null}
          cuentaFija={cuenta ?? null}
          onCerrar={() => setRegistrando(false)}
        />
      )}
    </section>
  );
}

function ItemLineaTiempo({
  actividad,
  ultimo,
}: {
  actividad: Actividad;
  ultimo: boolean;
}) {
  const fecha = actividad.completada_en ?? actividad.creado_en;
  return (
    <li className="relative flex gap-3 pb-4 pl-1">
      {/* Riel vertical de la línea de tiempo */}
      {!ultimo && (
        <span
          aria-hidden
          className="absolute left-[15px] top-7 h-full w-px bg-slate-200"
        />
      )}
      <span className="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-sm">
        {ICONOS_TIPO_ACTIVIDAD[actividad.tipo]}
      </span>
      <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">{actividad.asunto}</p>
          <p className="text-xs text-slate-400">{fechaLarga(fecha)}</p>
        </div>
        <p className="text-xs text-slate-500">
          {ETIQUETAS_TIPO_ACTIVIDAD[actividad.tipo]}
          {actividad.propietario?.nombre && ` · ${actividad.propietario.nombre}`}
          {actividad.contacto?.nombre && ` · con ${actividad.contacto.nombre}`}
        </p>
        {actividad.resultado && (
          <p className="mt-1 text-sm text-slate-600">{actividad.resultado}</p>
        )}
        {actividad.proxima_accion && (
          <p className="mt-1 text-xs text-amber-700">→ {actividad.proxima_accion}</p>
        )}
      </div>
    </li>
  );
}
