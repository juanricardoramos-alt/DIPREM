"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import {
  ETIQUETAS_VERTICAL,
  es,
  formatearMonto,
  type Moneda,
  type PipelineFila,
  type VerticalCuenta,
} from "@diprem/core";
import { listarPipelineDetalle } from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { BannerError, Boton, Esqueleto, EstadoVacio, Selector } from "@/components/ui";

function sumaPorMoneda(filas: { monto: number; moneda: Moneda }[]): string {
  const sumas = new Map<Moneda, number>();
  for (const f of filas) sumas.set(f.moneda, (sumas.get(f.moneda) ?? 0) + Number(f.monto));
  if (!sumas.size) return "—";
  return [...sumas.entries()].map(([m, t]) => formatearMonto(t, m)).join(" · ");
}

interface Grupo {
  clave: string;
  etiqueta: string;
  orden: number;
  filas: PipelineFila[];
}

function agrupar(
  filas: PipelineFila[],
  clave: (f: PipelineFila) => { clave: string; etiqueta: string; orden: number },
): Grupo[] {
  const grupos = new Map<string, Grupo>();
  for (const fila of filas) {
    const k = clave(fila);
    const grupo = grupos.get(k.clave) ?? { ...k, filas: [] };
    grupo.filas.push(fila);
    grupos.set(k.clave, grupo);
  }
  return [...grupos.values()].sort(
    (a, b) => a.orden - b.orden || b.filas.length - a.filas.length,
  );
}

/**
 * Pipeline abierto: valor por etapa, por ejecutivo y por rubro, con barras
 * (el largo codifica cantidad; los montos se listan por moneda, no se mezclan).
 */
export function ReportePipeline() {
  const supabase = useSupabase();
  const [filtroEjecutivo, setFiltroEjecutivo] = useState("");
  const [filtroRubro, setFiltroRubro] = useState("");
  const [filtroPais, setFiltroPais] = useState("");

  const { data: pipeline, isLoading, error, refetch } = useQuery({
    queryKey: ["pipeline_detalle"],
    queryFn: () => listarPipelineDetalle(supabase),
    retry: false,
  });

  const abiertas = useMemo(
    () => (pipeline ?? []).filter((f) => !f.cerrada_en),
    [pipeline],
  );
  const ejecutivos = useMemo(
    () => [...new Set(abiertas.map((f) => f.ejecutivo))].sort(),
    [abiertas],
  );
  const paises = useMemo(
    () => [...new Set(abiertas.map((f) => f.pais).filter(Boolean))].sort() as string[],
    [abiertas],
  );
  const rubros = useMemo(
    () => [...new Set(abiertas.map((f) => f.vertical))].sort(),
    [abiertas],
  );

  const filtradas = abiertas.filter(
    (f) =>
      (!filtroEjecutivo || f.ejecutivo === filtroEjecutivo) &&
      (!filtroRubro || f.vertical === filtroRubro) &&
      (!filtroPais || f.pais === filtroPais),
  );

  if (error) {
    return <BannerError mensaje={(error as Error).message} onReintentar={() => void refetch()} />;
  }

  return (
    <section>
      <p className="hidden border-b border-borde pb-2 text-sm font-semibold text-tinta-suave print:block">
        {es.app.nombre} — {es.reportes.pipelineTitulo}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{es.reportes.pipelineTitulo}</h2>
          <p className="text-sm text-tinta-suave">{es.reportes.pipelineNota}</p>
        </div>
        <Boton variante="secundario" className="print:hidden" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> {es.reportes.exportarPdfReporte}
        </Boton>
      </div>

      {/* Filtros */}
      <div className="mt-3 flex flex-wrap gap-2 print:hidden">
        <Selector
          value={filtroEjecutivo}
          onChange={(e) => setFiltroEjecutivo(e.target.value)}
          className="w-full sm:w-48 rounded-lg border border-borde bg-superficie shadow-sm px-3 py-2 text-sm"
        >
          <option value="">{es.reportes.filtroEjecutivo}: {es.comunes.todos}</option>
          {ejecutivos.map((e2) => (
            <option key={e2} value={e2}>{e2}</option>
          ))}
        </Selector>
        <Selector
          value={filtroRubro}
          onChange={(e) => setFiltroRubro(e.target.value)}
          className="w-full sm:w-44 rounded-lg border border-borde bg-superficie shadow-sm px-3 py-2 text-sm"
        >
          <option value="">{es.reportes.filtroRubro}: {es.comunes.todos}</option>
          {rubros.map((r) => (
            <option key={r} value={r}>
              {ETIQUETAS_VERTICAL[r as VerticalCuenta] ?? r}
            </option>
          ))}
        </Selector>
        <Selector
          value={filtroPais}
          onChange={(e) => setFiltroPais(e.target.value)}
          className="w-full sm:w-44 rounded-lg border border-borde bg-superficie shadow-sm px-3 py-2 text-sm"
        >
          <option value="">{es.reportes.filtroPais}: {es.reportes.todosMasc}</option>
          {paises.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </Selector>
      </div>

      {isLoading && (
        <div className="mt-4 space-y-2">
          <Esqueleto className="h-24" />
          <Esqueleto className="h-24" />
        </div>
      )}
      {!isLoading && filtradas.length === 0 && (
        <div className="mt-4">
          <EstadoVacio titulo={es.reportes.sinPipeline} />
        </div>
      )}

      {filtradas.length > 0 && (
        <div className="mt-4 grid gap-6 lg:grid-cols-3 print:grid-cols-1">
          <BloqueBarras
            titulo={es.reportes.porEtapa}
            grupos={agrupar(filtradas, (f) => ({
              clave: f.etapa_id,
              etiqueta: f.etapa,
              orden: f.etapa_orden,
            }))}
          />
          <BloqueBarras
            titulo={es.reportes.porEjecutivo}
            grupos={agrupar(filtradas, (f) => ({
              clave: f.propietario_id,
              etiqueta: f.ejecutivo,
              orden: 0,
            }))}
          />
          <BloqueBarras
            titulo={es.reportes.porRubro}
            grupos={agrupar(filtradas, (f) => ({
              clave: f.vertical,
              etiqueta: ETIQUETAS_VERTICAL[f.vertical as VerticalCuenta] ?? f.vertical,
              orden: 0,
            }))}
          />
        </div>
      )}
    </section>
  );
}

/** Barras horizontales: el largo codifica la cantidad; el monto va como texto. */
function BloqueBarras({ titulo, grupos }: { titulo: string; grupos: Grupo[] }) {
  const max = Math.max(1, ...grupos.map((g) => g.filas.length));
  return (
    <div className="rounded-xl border border-borde bg-superficie shadow-sm p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-tinta-tenue">
        {titulo}
      </h3>
      <div className="mt-3 space-y-3">
        {grupos.map((grupo) => (
          <div key={grupo.clave}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate font-medium">{grupo.etiqueta}</span>
              <span className="shrink-0 text-xs text-tinta-suave">
                {es.reportes.oportunidadesN(grupo.filas.length)}
              </span>
            </div>
            <div className="mt-1 h-3 w-full overflow-hidden rounded bg-superficie-2">
              <div
                className="h-full rounded bg-primario"
                style={{ width: `${(grupo.filas.length / max) * 100}%` }}
              />
            </div>
            <p className="mt-0.5 text-xs text-tinta-tenue">{sumaPorMoneda(grupo.filas)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
