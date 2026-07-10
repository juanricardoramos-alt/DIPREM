"use client";

import { useQuery } from "@tanstack/react-query";
import {
  DIAS_ESTANCADA,
  ETIQUETAS_TIPO_META,
  estancadas,
  es,
  formatearMonto,
  periodoActual,
  porcentajeMeta,
  semaforoMeta,
  type MetaAvance,
  type Moneda,
  type PipelineFila,
  type RankingFila,
  type Semaforo,
} from "@diprem/core";
import { listarAvanceMetas, listarPipelineDetalle, listarRanking } from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { Insignia } from "@/components/ui";
import { AnalisisEjecutivos } from "@/components/reportes/analisis-ejecutivos";

function sumaPorMoneda(filas: { monto: number; moneda: Moneda }[]): string {
  const sumas = new Map<Moneda, number>();
  for (const f of filas) sumas.set(f.moneda, (sumas.get(f.moneda) ?? 0) + Number(f.monto));
  if (!sumas.size) return "—";
  return [...sumas.entries()].map(([m, t]) => formatearMonto(t, m)).join(" · ");
}

/** Semáforo global de un ejecutivo = el peor de sus metas del mes. */
function semaforoUsuario(metas: MetaAvance[]): Semaforo | null {
  if (!metas.length) return null;
  const orden: Semaforo[] = ["rojo", "ambar", "verde"];
  return orden.find((s) => metas.some((m) => semaforoMeta(m) === s)) ?? "verde";
}

const PUNTO: Record<Semaforo, string> = {
  verde: "bg-emerald-500",
  ambar: "bg-amber-400",
  rojo: "bg-red-500",
};

export function DashboardEquipo() {
  const supabase = useSupabase();
  const periodo = periodoActual();

  const { data: ranking, error: errorVistas } = useQuery({
    queryKey: ["ranking"],
    queryFn: () => listarRanking(supabase),
    retry: false,
  });
  const { data: pipeline } = useQuery({
    queryKey: ["pipeline_detalle"],
    queryFn: () => listarPipelineDetalle(supabase),
    retry: false,
  });
  const { data: metas } = useQuery({
    queryKey: ["avance_metas", periodo],
    queryFn: () => listarAvanceMetas(supabase, { periodo }),
    retry: false,
  });

  if (errorVistas) {
    return (
      <p className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 text-sm text-amber-800 dark:text-amber-300">
        ⚠️ {errorVistas.message}
      </p>
    );
  }

  const abiertas = (pipeline ?? []).filter((f) => !f.cerrada_en);
  const actividadesHoy = (ranking ?? []).reduce((s, r) => s + Number(r.actividades_hoy), 0);
  const adjudicadasMes = (ranking ?? []).reduce((s, r) => s + Number(r.adjudicadas_mes), 0);
  const listaEstancadas = estancadas(pipeline ?? []);
  const metasPorUsuario = new Map<string, MetaAvance[]>();
  for (const m of metas ?? []) {
    metasPorUsuario.set(m.usuario_id, [...(metasPorUsuario.get(m.usuario_id) ?? []), m]);
  }

  // Embudo agregado por etapa (solo etapas presentes en el pipeline visible)
  const etapas = new Map<
    string,
    { nombre: string; orden: number; filas: PipelineFila[] }
  >();
  for (const f of pipeline ?? []) {
    const e = etapas.get(f.etapa_id) ?? { nombre: f.etapa, orden: f.etapa_orden, filas: [] };
    e.filas.push(f);
    etapas.set(f.etapa_id, e);
  }
  const embudo = [...etapas.values()].sort((a, b) => a.orden - b.orden);
  const maxCantidad = Math.max(1, ...embudo.map((e) => e.filas.length));

  return (
    <div className="space-y-8">
      {/* Resumen general */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tarjeta titulo={es.reportes.abiertas} valor={String(abiertas.length)} />
        <Tarjeta titulo={es.reportes.pipelineTotal} valor={sumaPorMoneda(abiertas)} chica />
        <Tarjeta titulo={es.reportes.actividadesHoyEquipo} valor={String(actividadesHoy)} />
        <Tarjeta titulo={es.reportes.adjudicadasMes} valor={String(adjudicadasMes)} />
      </div>

      {/* Ranking con semáforo */}
      <section>
        <h2 className="text-lg font-semibold">{es.reportes.ranking}</h2>
        <p className="text-sm text-tinta-suave">{es.reportes.rankingNota}</p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-borde bg-superficie">
          <table className="w-full text-sm">
            <thead className="bg-superficie-2 text-left text-xs uppercase text-tinta-suave">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">{es.reportes.colEjecutivo}</th>
                <th className="px-4 py-3">{es.reportes.colEquipo}</th>
                <th className="px-4 py-3 text-right">{es.reportes.colActividades}</th>
                <th className="px-4 py-3 text-right">{es.reportes.colHoy}</th>
                <th className="px-4 py-3 text-right">{es.reportes.colNuevas}</th>
                <th className="px-4 py-3 text-right">{es.reportes.colAdjudicadas}</th>
                <th className="px-4 py-3 text-right">{es.reportes.colAbiertas}</th>
                <th className="px-4 py-3">{es.reportes.colMetas}</th>
              </tr>
            </thead>
            <tbody>
              {(ranking ?? []).map((fila: RankingFila, i) => {
                const suyas = metasPorUsuario.get(fila.usuario_id) ?? [];
                const semaforo = semaforoUsuario(suyas);
                const pctProm = suyas.length
                  ? Math.round(
                      suyas.reduce((s, m) => s + porcentajeMeta(m), 0) / suyas.length,
                    )
                  : null;
                return (
                  <tr key={fila.usuario_id} className="border-t border-borde">
                    <td className="px-4 py-3 text-tinta-tenue">{i + 1}</td>
                    <td className="px-4 py-3 font-medium">{fila.nombre}</td>
                    <td className="px-4 py-3 text-tinta-suave">
                      {fila.equipo ?? "—"}
                      {fila.pais ? ` · ${fila.pais}` : ""}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {fila.actividades_mes}
                    </td>
                    <td className="px-4 py-3 text-right">{fila.actividades_hoy}</td>
                    <td className="px-4 py-3 text-right">{fila.nuevas_mes}</td>
                    <td className="px-4 py-3 text-right">{fila.adjudicadas_mes}</td>
                    <td className="px-4 py-3 text-right">{fila.oportunidades_abiertas}</td>
                    <td className="px-4 py-3">
                      {semaforo ? (
                        <span className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${PUNTO[semaforo]}`} />
                          {es.reportes.semaforo[semaforo]} · {pctProm}%
                        </span>
                      ) : (
                        <span className="text-xs text-tinta-tenue">
                          {es.reportes.sinMetasFila}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Estancadas */}
        <section>
          <h2 className="text-lg font-semibold">⚠️ {es.reportes.estancadas}</h2>
          <p className="text-sm text-tinta-suave">
            {es.reportes.estancadasNota(DIAS_ESTANCADA)}
          </p>
          <div className="mt-3 space-y-2">
            {listaEstancadas.length === 0 && (
              <p className="rounded-lg border border-dashed border-borde p-6 text-center text-sm text-tinta-tenue">
                {es.reportes.sinEstancadas}
              </p>
            )}
            {listaEstancadas.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-red-200 dark:border-red-900 bg-superficie p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{f.nombre}</p>
                  <p className="truncate text-xs text-tinta-suave">
                    {f.cuenta} · {f.ejecutivo} · {f.etapa}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">
                    {formatearMonto(f.monto, f.moneda)}
                  </p>
                  <Insignia tono="rojo">
                    {es.reportes.diasSinActividad(f.dias_sin_actividad)}
                  </Insignia>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Embudo agregado */}
        <section>
          <h2 className="text-lg font-semibold">{es.reportes.embudoAgregado}</h2>
          <div className="mt-3 space-y-3 rounded-xl border border-borde bg-superficie p-4">
            {embudo.map((etapa) => (
              <div key={etapa.nombre}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{etapa.nombre}</span>
                  <span className="text-tinta-suave">
                    {etapa.filas.length} · {sumaPorMoneda(etapa.filas)}
                  </span>
                </div>
                <div className="mt-1 h-3 w-full overflow-hidden rounded bg-superficie-2">
                  <div
                    className="h-full rounded bg-primario"
                    style={{ width: `${(etapa.filas.length / maxCantidad) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {embudo.length === 0 && (
              <p className="text-center text-sm text-tinta-tenue">
                {es.crm.sinOportunidades}
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Análisis de gestión por ejecutivo */}
      <AnalisisEjecutivos />
    </div>
  );
}

function Tarjeta({
  titulo,
  valor,
  chica = false,
}: {
  titulo: string;
  valor: string;
  chica?: boolean;
}) {
  return (
    <div className="rounded-xl border border-borde bg-superficie p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-tinta-tenue">
        {titulo}
      </p>
      <p className={`mt-1 font-bold ${chica ? "text-base" : "text-2xl"}`}>{valor}</p>
    </div>
  );
}
