"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import {
  ETIQUETAS_TIPO_ACTIVIDAD,
  ICONOS_TIPO_ACTIVIDAD,
  es,
  etiquetaSemana,
  extraerCambiosEtapa,
  resumenSemanal,
  semanaAnterior,
  type TipoActividad,
} from "@diprem/core";
import {
  listarCambiosOportunidades,
  listarGestionReporte,
  listarPipelineDetalle,
} from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { Boton, EstadoVacio, FilasEsqueleto, Selector } from "@/components/ui";

/**
 * Reporte semanal por ejecutivo: gestiones (por tipo), proyectos trabajados,
 * oportunidades que avanzaron de etapa (auditoría) y adjudicaciones.
 * Navegable semana a semana y exportable en PDF (imprimir).
 */
export function ReporteSemanal() {
  const supabase = useSupabase();
  const [offset, setOffset] = useState(0); // 0 = semana pasada
  const [filtroEjecutivo, setFiltroEjecutivo] = useState("");

  const rango = semanaAnterior(offset);
  const desde = rango.inicio.toISOString();
  const hasta = rango.fin.toISOString();

  const { data: gestiones, isLoading } = useQuery({
    queryKey: ["reporte-semanal-gestiones", desde],
    queryFn: () => listarGestionReporte(supabase, { desde, hasta }),
  });
  const { data: registros } = useQuery({
    queryKey: ["reporte-semanal-cambios", desde],
    queryFn: () => listarCambiosOportunidades(supabase, desde, hasta),
  });
  const { data: pipeline } = useQuery({
    queryKey: ["pipeline_detalle"],
    queryFn: () => listarPipelineDetalle(supabase),
    retry: false,
  });

  const adjudicadasSemana = (pipeline ?? []).filter(
    (f) =>
      f.es_ganada &&
      f.cerrada_en &&
      f.cerrada_en >= desde &&
      f.cerrada_en < hasta,
  );
  const resumen = resumenSemanal(
    gestiones ?? [],
    extraerCambiosEtapa(registros ?? []),
    adjudicadasSemana,
  );
  const visibles = resumen.filter(
    (r) => !filtroEjecutivo || r.propietario_id === filtroEjecutivo,
  );

  return (
    <section>
      {/* Encabezado visible solo al imprimir */}
      <p className="hidden border-b border-borde pb-2 text-sm font-semibold text-tinta-suave print:block">
        {es.app.nombre} — {es.reportes.semanalTitulo} · {etiquetaSemana(rango)}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{es.reportes.semanalTitulo}</h2>
          <p className="text-sm text-tinta-suave">{es.reportes.semanalNota}</p>
        </div>
        <Boton variante="secundario" className="print:hidden" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> {es.reportes.exportarPdfReporte}
        </Boton>
      </div>

      {/* Selector de semana + filtro ejecutivo */}
      <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
        <Boton variante="secundario" onClick={() => setOffset((o) => o + 1)}>
          <ChevronLeft className="h-4 w-4" /> {es.reportes.semanaAnteriorBtn}
        </Boton>
        <span className="rounded-lg border border-borde bg-superficie shadow-sm px-3 py-1.5 text-sm font-medium">
          {etiquetaSemana(rango)}
        </span>
        <Boton
          variante="secundario"
          disabled={offset === 0}
          onClick={() => setOffset((o) => Math.max(0, o - 1))}
        >
          {es.reportes.semanaSiguienteBtn} <ChevronRight className="h-4 w-4" />
        </Boton>
        <Selector
          value={filtroEjecutivo}
          onChange={(e) => setFiltroEjecutivo(e.target.value)}
          className="w-full sm:w-52 rounded-lg border border-borde bg-superficie shadow-sm px-3 py-2 text-sm"
        >
          <option value="">
            {es.reportes.filtroEjecutivo}: {es.comunes.todos}
          </option>
          {resumen.map((r) => (
            <option key={r.propietario_id} value={r.propietario_id}>
              {r.ejecutivo}
            </option>
          ))}
        </Selector>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-borde bg-superficie shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-superficie-2 text-left text-xs uppercase text-tinta-suave">
            <tr>
              <th className="px-4 py-3">{es.reportes.colEjecutivo}</th>
              <th className="px-4 py-3 text-right">{es.reportes.colGestiones}</th>
              <th className="px-4 py-3">{es.reportes.colPorTipo}</th>
              <th className="px-4 py-3 text-right">{es.reportes.colProyectosTrabajados}</th>
              <th className="px-4 py-3 text-right" title={es.reportes.avanzadasNota}>
                {es.reportes.colAvanzadas}
              </th>
              <th className="px-4 py-3 text-right">{es.reportes.colAdjudicadas}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <FilasEsqueleto columnas={6} />}
            {!isLoading && visibles.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4">
                  <EstadoVacio titulo={es.reportes.sinDatosSemana} />
                </td>
              </tr>
            )}
            {visibles.map((fila) => (
              <tr key={fila.propietario_id} className="border-t border-borde">
                <td className="px-4 py-3 font-medium">{fila.ejecutivo}</td>
                <td className="px-4 py-3 text-right text-base font-bold">
                  {fila.totalGestiones}
                </td>
                <td className="px-4 py-3">
                  <span className="flex flex-wrap gap-1.5">
                    {(Object.entries(fila.porTipo) as [TipoActividad, number][])
                      .sort((a, b) => b[1] - a[1])
                      .map(([tipo, total]) => (
                        <span
                          key={tipo}
                          className="inline-block rounded-full bg-superficie-2 px-2 py-0.5 text-xs text-tinta-suave"
                        >
                          {ICONOS_TIPO_ACTIVIDAD[tipo]} {ETIQUETAS_TIPO_ACTIVIDAD[tipo]}: {total}
                        </span>
                      ))}
                    {fila.totalGestiones === 0 && (
                      <span className="text-xs text-tinta-tenue">—</span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">{fila.proyectosTrabajados}</td>
                <td className="px-4 py-3 text-right">{fila.oportunidadesAvanzadas}</td>
                <td className="px-4 py-3 text-right">
                  {fila.adjudicadas > 0 ? (
                    <b className="text-emerald-600 dark:text-emerald-400">
                      {fila.adjudicadas} 🎉
                    </b>
                  ) : (
                    0
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-tinta-tenue">{es.reportes.avanzadasNota}</p>
    </section>
  );
}
