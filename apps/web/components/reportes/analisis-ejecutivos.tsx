"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ETIQUETAS_TIPO_ACTIVIDAD,
  ICONOS_TIPO_ACTIVIDAD,
  analizarEjecutivos,
  es,
  type AnalisisEjecutivo,
  type TipoActividad,
} from "@diprem/core";
import { listarDistribucionGestion, listarGestionContactos } from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { Insignia } from "@/components/ui";

/**
 * Panel del gerente/dueño: cobertura de gestión de la cartera por ejecutivo.
 * Gestión reciente (7 días) vs abandonada, top 5 contactos sin gestión,
 * mezcla de tipos de gestión (90 días) y frecuencia promedio de contacto.
 */
export function AnalisisEjecutivos() {
  const supabase = useSupabase();

  const { data: contactos, error } = useQuery({
    queryKey: ["gestion_contactos"],
    queryFn: () => listarGestionContactos(supabase),
    retry: false,
  });
  const { data: distribucion } = useQuery({
    queryKey: ["distribucion_gestion"],
    queryFn: () => listarDistribucionGestion(supabase),
    retry: false,
  });

  if (error) {
    return (
      <section>
        <h2 className="text-lg font-semibold">{es.reportes.analisisEjecutivos}</h2>
        <p className="mt-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 text-sm text-amber-800 dark:text-amber-300">
          ⚠️ {(error as Error).message}
        </p>
      </section>
    );
  }

  const analisis = analizarEjecutivos(contactos ?? [], distribucion ?? []);

  return (
    <section>
      <h2 className="text-lg font-semibold">{es.reportes.analisisEjecutivos}</h2>
      <p className="text-sm text-tinta-suave">{es.reportes.analisisEjecutivosNota}</p>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        {analisis.length === 0 && (
          <p className="rounded-lg border border-dashed border-borde p-6 text-center text-sm text-tinta-tenue lg:col-span-2">
            {es.reportes.sinContactosActivos}
          </p>
        )}
        {analisis.map((ejecutivo) => (
          <TarjetaEjecutivo key={ejecutivo.propietario_id} analisis={ejecutivo} />
        ))}
      </div>
    </section>
  );
}

function TarjetaEjecutivo({ analisis }: { analisis: AnalisisEjecutivo }) {
  const pctReciente = analisis.totalContactos
    ? Math.round((analisis.conGestionReciente / analisis.totalContactos) * 100)
    : 0;

  return (
    <div className="rounded-xl border border-borde bg-superficie shadow-sm p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{analisis.ejecutivo}</p>
        <p className="text-xs text-tinta-suave">
          {analisis.totalContactos} {es.reportes.contactosActivos}
        </p>
      </div>

      {/* Cobertura: con gestión reciente vs sin gestión */}
      <div className="mt-3">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-emerald-700 dark:text-emerald-300">
            {es.reportes.conGestionReciente}: {analisis.conGestionReciente}
          </span>
          <span className="text-red-600 dark:text-red-400">
            {es.reportes.sinGestionReciente}: {analisis.sinGestionReciente}
          </span>
        </div>
        <div className="mt-1 flex h-3 w-full overflow-hidden rounded bg-red-100 dark:bg-red-950/60">
          <div className="h-full bg-emerald-500" style={{ width: `${pctReciente}%` }} />
        </div>
      </div>

      {/* Frecuencia promedio */}
      <p className="mt-2 text-xs text-tinta-suave">
        {analisis.frecuenciaPromedioDias != null
          ? `📆 ${es.reportes.frecuenciaPromedio(analisis.frecuenciaPromedioDias)}`
          : es.reportes.sinFrecuencia}
      </p>

      {/* Mezcla de tipos de gestión (90 días) */}
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
        {es.reportes.mezclaGestion}
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {analisis.totalGestiones90d === 0 && (
          <span className="text-xs text-tinta-tenue">—</span>
        )}
        {(Object.entries(analisis.distribucion) as [TipoActividad, number][])
          .sort((a, b) => b[1] - a[1])
          .map(([tipo, total]) => (
            <span
              key={tipo}
              className="inline-block rounded-full bg-superficie-2 px-2 py-0.5 text-xs text-tinta-suave"
            >
              {ICONOS_TIPO_ACTIVIDAD[tipo]} {ETIQUETAS_TIPO_ACTIVIDAD[tipo]}: {total}
            </span>
          ))}
      </div>

      {/* Top 5 contactos con más días sin gestión */}
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
        {es.reportes.masAbandonados}
      </p>
      <ul className="mt-1 space-y-1">
        {analisis.masAbandonados.length === 0 && (
          <li className="text-xs text-tinta-tenue">—</li>
        )}
        {analisis.masAbandonados.map((contacto) => (
          <li
            key={`${contacto.entidad}-${contacto.entidad_id}`}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <Link
              href={
                contacto.entidad === "lead"
                  ? `/leads/${contacto.entidad_id}`
                  : `/empresas/${contacto.entidad_id}`
              }
              className="min-w-0 truncate hover:text-primario hover:underline"
            >
              {contacto.nombre}
              <span className="text-xs text-tinta-tenue">
                {" "}
                · {contacto.entidad === "lead" ? "Lead" : es.crm.cuenta}
              </span>
            </Link>
            <Insignia tono={contacto.dias >= 7 ? "rojo" : contacto.dias >= 3 ? "ambar" : "verde"}>
              {es.gestion.diasSinGestion(contacto.dias)}
            </Insignia>
          </li>
        ))}
      </ul>
    </div>
  );
}
