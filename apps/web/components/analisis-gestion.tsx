"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { mensajeError,
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
import { Boton, EstadoVacio, Insignia } from "@/components/ui";
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
  contacto,
  creadoEn,
  titulo,
}: {
  lead?: { id: string; nombre: string } | null;
  cuenta?: { id: string; razon_social: string } | null;
  /** ficha de contacto: historial con la persona + registro ligado a ella */
  contacto?: { id: string; nombre: string } | null;
  /** fecha de creación de la entidad (referencia si aún no hay gestiones) */
  creadoEn: string;
  /** título alternativo de la sección (default: "Análisis de gestión") */
  titulo?: string;
}) {
  const supabase = useSupabase();
  const [registrando, setRegistrando] = useState(false);
  const entidad = lead ? "lead" : contacto ? "contacto" : "cuenta";
  const entidadId = lead?.id ?? contacto?.id ?? cuenta?.id ?? "";

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
        <h2 className="text-lg font-semibold">{titulo ?? es.gestion.titulo}</h2>
        <Boton
          variante="secundario"
          className="print:hidden"
          onClick={() => setRegistrando(true)}
        >
          + {es.miDia.registrarGestion}
        </Boton>
      </div>

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{mensajeError(error)}</p>}
      {isLoading && <p className="mt-3 text-sm text-tinta-tenue">{es.comunes.cargando}</p>}

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
                  className="inline-block rounded-full bg-superficie-2 px-2 py-0.5 text-xs text-tinta-suave"
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
                ? "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200"
                : "border-dashed border-borde text-tinta-tenue"
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
          <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-tinta-tenue">
            {es.gestion.lineaTiempo}
          </h3>
          {historial.length === 0 ? (
            <div className="mt-2"><EstadoVacio titulo={es.gestion.sinGestiones} /></div>
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
          contactoFijo={contacto ?? null}
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
          className="absolute left-[15px] top-7 h-full w-px bg-borde"
        />
      )}
      <span className="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-borde bg-superficie text-sm">
        {ICONOS_TIPO_ACTIVIDAD[actividad.tipo]}
      </span>
      <div className="min-w-0 flex-1 rounded-lg border border-borde bg-superficie shadow-sm p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">{actividad.asunto}</p>
          <p className="text-xs text-tinta-tenue">{fechaLarga(fecha)}</p>
        </div>
        <p className="text-xs text-tinta-suave">
          {ETIQUETAS_TIPO_ACTIVIDAD[actividad.tipo]}
          {actividad.propietario?.nombre && ` · ${actividad.propietario.nombre}`}
          {actividad.contacto?.nombre && ` · con ${actividad.contacto.nombre}`}
        </p>
        {actividad.resultado && (
          <p className="mt-1 text-sm text-tinta-suave">{actividad.resultado}</p>
        )}
        {actividad.proxima_accion && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">→ {actividad.proxima_accion}</p>
        )}
      </div>
    </li>
  );
}
