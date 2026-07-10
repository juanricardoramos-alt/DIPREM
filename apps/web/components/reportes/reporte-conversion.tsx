"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import {
  embudoConversion,
  es,
  tasaPaso,
  type EmbudoConversion,
  type FilaConversion,
} from "@diprem/core";
import { listarConversionProyectos } from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { BannerError, Boton, Esqueleto, EstadoVacio, Entrada, Selector } from "@/components/ui";

const PASOS: { clave: keyof EmbudoConversion; etiqueta: () => string }[] = [
  { clave: "asignados", etiqueta: () => es.reportes.etapaAsignados },
  { clave: "contactados", etiqueta: () => es.reportes.etapaContactados },
  { clave: "convertidos", etiqueta: () => es.reportes.etapaConvertidos },
  { clave: "conPropuesta", etiqueta: () => es.reportes.etapaConPropuesta },
  { clave: "adjudicados", etiqueta: () => es.reportes.etapaAdjudicados },
];

/**
 * Conversión de proyectos del mercado: embudo asignado → contactado →
 * convertido → propuesta → adjudicado, filtrable por período, ejecutivo,
 * rubro y región, con desglose por ejecutivo.
 */
export function ReporteConversion() {
  const supabase = useSupabase();
  const [filtroEjecutivo, setFiltroEjecutivo] = useState("");
  const [filtroRubro, setFiltroRubro] = useState("");
  const [filtroRegion, setFiltroRegion] = useState("");
  const [desde, setDesde] = useState("");

  const { data: filas, isLoading, error, refetch } = useQuery({
    queryKey: ["conversion_proyectos"],
    queryFn: () => listarConversionProyectos(supabase),
    retry: false,
  });

  const ejecutivos = useMemo(
    () => [...new Set((filas ?? []).map((f) => f.ejecutivo).filter(Boolean))].sort() as string[],
    [filas],
  );
  const rubros = useMemo(
    () => [...new Set((filas ?? []).map((f) => f.rubro).filter(Boolean))].sort() as string[],
    [filas],
  );
  const regiones = useMemo(
    () => [...new Set((filas ?? []).map((f) => f.region).filter(Boolean))].sort() as string[],
    [filas],
  );

  const filtradas = (filas ?? []).filter(
    (f) =>
      (!filtroEjecutivo || f.ejecutivo === filtroEjecutivo) &&
      (!filtroRubro || f.rubro === filtroRubro) &&
      (!filtroRegion || f.region === filtroRegion) &&
      (!desde || f.asignado_en >= new Date(`${desde}T00:00:00`).toISOString()),
  );
  const embudo = embudoConversion(filtradas);

  // Desglose por ejecutivo
  const porEjecutivo = useMemo(() => {
    const grupos = new Map<string, FilaConversion[]>();
    for (const fila of filtradas) {
      const clave = fila.ejecutivo ?? "—";
      grupos.set(clave, [...(grupos.get(clave) ?? []), fila]);
    }
    return [...grupos.entries()]
      .map(([ejecutivo, filasGrupo]) => ({ ejecutivo, embudo: embudoConversion(filasGrupo) }))
      .sort((a, b) => b.embudo.asignados - a.embudo.asignados);
  }, [filtradas]);

  if (error) {
    return <BannerError mensaje={(error as Error).message} onReintentar={() => void refetch()} />;
  }

  return (
    <section>
      <p className="hidden border-b border-borde pb-2 text-sm font-semibold text-tinta-suave print:block">
        {es.app.nombre} — {es.reportes.conversionTitulo}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{es.reportes.conversionTitulo}</h2>
          <p className="text-sm text-tinta-suave">{es.reportes.conversionDescripcion}</p>
        </div>
        <Boton variante="secundario" className="print:hidden" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> {es.reportes.exportarPdfReporte}
        </Boton>
      </div>

      {/* Filtros: período, ejecutivo, rubro y región */}
      <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
        <label className="flex items-center gap-1.5 text-sm text-tinta-suave">
          {es.reportes.filtroDesde}
          <Entrada
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="w-40 rounded-lg border border-borde bg-superficie px-3 py-2 text-sm"
          />
        </label>
        <Selector
          value={filtroEjecutivo}
          onChange={(e) => setFiltroEjecutivo(e.target.value)}
          className="w-48 rounded-lg border border-borde bg-superficie px-3 py-2 text-sm"
        >
          <option value="">{es.reportes.filtroEjecutivo}: {es.comunes.todos}</option>
          {ejecutivos.map((e2) => (
            <option key={e2} value={e2}>{e2}</option>
          ))}
        </Selector>
        <Selector
          value={filtroRubro}
          onChange={(e) => setFiltroRubro(e.target.value)}
          className="w-44 rounded-lg border border-borde bg-superficie px-3 py-2 text-sm"
        >
          <option value="">{es.reportes.filtroRubro}: {es.comunes.todos}</option>
          {rubros.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </Selector>
        <Selector
          value={filtroRegion}
          onChange={(e) => setFiltroRegion(e.target.value)}
          className="w-44 rounded-lg border border-borde bg-superficie px-3 py-2 text-sm"
        >
          <option value="">{es.reportes.filtroRegion}: {es.reportes.todasFem}</option>
          {regiones.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </Selector>
      </div>

      {isLoading && <Esqueleto className="mt-4 h-56" />}
      {!isLoading && embudo.asignados === 0 && (
        <div className="mt-4">
          <EstadoVacio titulo={es.reportes.sinConversion} />
        </div>
      )}

      {embudo.asignados > 0 && (
        <>
          {/* Embudo visual */}
          <div className="mt-4 rounded-xl border border-borde bg-superficie p-4">
            <div className="space-y-3">
              {PASOS.map((paso, i) => {
                const valor = embudo[paso.clave];
                const anterior = i > 0 ? embudo[PASOS[i - 1]!.clave] : null;
                const tasa = anterior !== null ? tasaPaso(valor, anterior) : null;
                const ancho = (valor / embudo.asignados) * 100;
                return (
                  <div key={paso.clave}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{paso.etiqueta()}</span>
                      <span className="text-tinta-suave">
                        <b className="text-tinta">{valor}</b>
                        {tasa !== null && (
                          <span className="ml-2 text-xs">
                            {es.reportes.delPasoAnterior(tasa)}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1 h-4 w-full overflow-hidden rounded bg-superficie-2">
                      <div
                        className="h-full rounded bg-primario"
                        style={{ width: `${Math.max(ancho, valor > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Desglose por ejecutivo */}
          <div className="mt-4 overflow-x-auto rounded-xl border border-borde bg-superficie">
            <table className="w-full text-sm">
              <thead className="bg-superficie-2 text-left text-xs uppercase text-tinta-suave">
                <tr>
                  <th className="px-4 py-3">{es.reportes.colEjecutivo}</th>
                  <th className="px-4 py-3 text-right">{es.reportes.etapaAsignados}</th>
                  <th className="px-4 py-3 text-right">{es.reportes.etapaContactados}</th>
                  <th className="px-4 py-3 text-right">{es.reportes.etapaConvertidos}</th>
                  <th className="px-4 py-3 text-right">{es.reportes.etapaConPropuesta}</th>
                  <th className="px-4 py-3 text-right">{es.reportes.etapaAdjudicados}</th>
                </tr>
              </thead>
              <tbody>
                {porEjecutivo.map(({ ejecutivo, embudo: e2 }) => (
                  <tr key={ejecutivo} className="border-t border-borde">
                    <td className="px-4 py-3 font-medium">{ejecutivo}</td>
                    <td className="px-4 py-3 text-right">{e2.asignados}</td>
                    <td className="px-4 py-3 text-right">{e2.contactados}</td>
                    <td className="px-4 py-3 text-right">{e2.convertidos}</td>
                    <td className="px-4 py-3 text-right">{e2.conPropuesta}</td>
                    <td className="px-4 py-3 text-right">
                      {e2.adjudicados > 0 ? (
                        <b className="text-emerald-600 dark:text-emerald-400">
                          {e2.adjudicados}
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
        </>
      )}
    </section>
  );
}
