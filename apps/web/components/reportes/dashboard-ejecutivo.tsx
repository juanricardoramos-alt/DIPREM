"use client";

import { useQuery } from "@tanstack/react-query";
import {
  es,
  etiquetaPeriodo,
  periodoActual,
  type RankingFila,
} from "@diprem/core";
import { listarAvanceMetas, listarRanking } from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { BarraMeta } from "@/components/reportes/barra-meta";

export function DashboardEjecutivo({ usuarioId }: { usuarioId: string }) {
  const supabase = useSupabase();
  const periodo = periodoActual();

  const { data: metas, error: errorVistas } = useQuery({
    queryKey: ["avance_metas", periodo, usuarioId],
    queryFn: () => listarAvanceMetas(supabase, { periodo, usuario_id: usuarioId }),
    retry: false,
  });
  const { data: ranking } = useQuery({
    queryKey: ["ranking"],
    queryFn: () => listarRanking(supabase),
    retry: false,
  });

  if (errorVistas) {
    return (
      <p className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 text-sm text-amber-800 dark:text-amber-300">
        ⚠️ {errorVistas.message}
      </p>
    );
  }

  const mio: RankingFila | undefined = ranking?.find((r) => r.usuario_id === usuarioId);
  const otros = (ranking ?? []).filter((r) => r.usuario_id !== usuarioId);
  const promedio = (
    campo: keyof Pick<RankingFila, "actividades_mes" | "adjudicadas_mes" | "nuevas_mes">,
  ) =>
    otros.length
      ? Math.round(otros.reduce((s, r) => s + Number(r[campo]), 0) / otros.length)
      : null;

  const cerradas = Number(mio?.adjudicadas_mes ?? 0) + Number(mio?.perdidas_mes ?? 0);
  const conversion = cerradas
    ? `${Math.round((Number(mio?.adjudicadas_mes ?? 0) / cerradas) * 100)}%`
    : "—";

  return (
    <div className="space-y-8">
      {/* Avance vs meta */}
      <section>
        <h2 className="text-lg font-semibold">
          {es.reportes.avanceMetas}{" "}
          <span className="font-normal capitalize text-tinta-tenue">
            · {etiquetaPeriodo(periodo)}
          </span>
        </h2>
        <div className="mt-3 space-y-4 rounded-xl border border-borde bg-superficie p-5">
          {(metas?.length ?? 0) === 0 && (
            <p className="text-center text-sm text-tinta-tenue">{es.reportes.sinMetas}</p>
          )}
          {metas?.map((meta) => <BarraMeta key={meta.id} meta={meta} />)}
        </div>
      </section>

      {/* KPIs personales */}
      <section>
        <h2 className="text-lg font-semibold">{es.reportes.kpis}</h2>
        <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi titulo={es.reportes.kpiActividades} valor={String(mio?.actividades_mes ?? 0)} />
          <Kpi titulo={es.reportes.kpiAdjudicadas} valor={String(mio?.adjudicadas_mes ?? 0)} />
          <Kpi titulo={es.reportes.kpiNuevas} valor={String(mio?.nuevas_mes ?? 0)} />
          <Kpi
            titulo={es.reportes.kpiConversion}
            valor={conversion}
            nota={es.reportes.conversionNota}
          />
        </div>
      </section>

      {/* Comparativa sana */}
      {otros.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold">{es.reportes.comparativa}</h2>
          <p className="text-sm text-tinta-suave">{es.reportes.comparativaNota}</p>
          <div className="mt-3 space-y-4 rounded-xl border border-borde bg-superficie p-5">
            <Comparativa
              etiqueta={es.reportes.kpiActividades}
              mio={Number(mio?.actividades_mes ?? 0)}
              equipo={promedio("actividades_mes") ?? 0}
            />
            <Comparativa
              etiqueta={es.reportes.kpiAdjudicadas}
              mio={Number(mio?.adjudicadas_mes ?? 0)}
              equipo={promedio("adjudicadas_mes") ?? 0}
            />
            <Comparativa
              etiqueta={es.reportes.kpiNuevas}
              mio={Number(mio?.nuevas_mes ?? 0)}
              equipo={promedio("nuevas_mes") ?? 0}
            />
          </div>
        </section>
      )}
    </div>
  );
}

function Kpi({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-xl border border-borde bg-superficie p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-tinta-tenue">
        {titulo}
      </p>
      <p className="mt-1 text-2xl font-bold">{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-tinta-tenue">{nota}</p>}
    </div>
  );
}

function Comparativa({
  etiqueta,
  mio,
  equipo,
}: {
  etiqueta: string;
  mio: number;
  equipo: number;
}) {
  const max = Math.max(mio, equipo, 1);
  return (
    <div>
      <p className="text-sm font-medium">{etiqueta}</p>
      <div className="mt-1.5 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-28 shrink-0 text-xs text-tinta-suave">
            {es.reportes.tuValor}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded bg-superficie-2">
            <div
              className="h-full rounded bg-primario"
              style={{ width: `${(mio / max) * 100}%` }}
            />
          </div>
          <span className="w-8 text-right text-sm font-semibold">{mio}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-28 shrink-0 text-xs text-tinta-suave">
            {es.reportes.promedioEquipo}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded bg-superficie-2">
            <div
              className="h-full rounded bg-borde"
              style={{ width: `${(equipo / max) * 100}%` }}
            />
          </div>
          <span className="w-8 text-right text-sm text-tinta-suave">{equipo}</span>
        </div>
      </div>
    </div>
  );
}
