"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Store, TrendingUp, Trophy, Wallet } from "lucide-react";
import {
  DIAS_PROYECTO_SIN_GESTION,
  DIAS_RIESGO_OPORTUNIDAD,
  es,
  formatearMonto,
  mejorEjecutivo,
  oportunidadesEnRiesgo,
  periodoActual,
  porcentajeMeta,
  resumenProyectos,
  semaforoGlobal,
  type MetaAvance,
  type Moneda,
  type Semaforo,
} from "@diprem/core";
import {
  listarAvanceMetas,
  listarGestionProyectos,
  listarPipelineDetalle,
  listarRanking,
} from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { BannerError, Esqueleto, Insignia } from "@/components/ui";
import { ProyectosSinGestion } from "@/components/control/proyectos-sin-gestion";
import { HistorialAsignaciones } from "@/components/control/historial-asignaciones";

const PUNTO: Record<Semaforo, string> = {
  verde: "bg-emerald-500",
  ambar: "bg-amber-400",
  rojo: "bg-red-500",
};

function sumaPorMoneda(filas: { monto: number; moneda: Moneda }[]): string {
  const sumas = new Map<Moneda, number>();
  for (const f of filas) sumas.set(f.moneda, (sumas.get(f.moneda) ?? 0) + Number(f.monto));
  if (!sumas.size) return "—";
  return [...sumas.entries()].map(([m, t]) => formatearMonto(t, m)).join(" · ");
}

export function ControlCliente() {
  const supabase = useSupabase();
  const periodo = periodoActual();

  const { data: proyectos, isLoading: cargandoProyectos, error: errorProyectos, refetch } =
    useQuery({
      queryKey: ["gestion_proyectos"],
      queryFn: () => listarGestionProyectos(supabase),
      retry: false,
    });
  const { data: ranking, isLoading: cargandoRanking } = useQuery({
    queryKey: ["ranking"],
    queryFn: () => listarRanking(supabase),
    retry: false,
  });
  const { data: pipeline, isLoading: cargandoPipeline } = useQuery({
    queryKey: ["pipeline_detalle"],
    queryFn: () => listarPipelineDetalle(supabase),
    retry: false,
  });
  const { data: metas } = useQuery({
    queryKey: ["avance_metas", periodo],
    queryFn: () => listarAvanceMetas(supabase, { periodo }),
    retry: false,
  });

  const cargando = cargandoProyectos || cargandoRanking || cargandoPipeline;

  // Métricas en tiempo real
  const resumen = resumenProyectos(proyectos ?? []);
  const mejor = mejorEjecutivo(ranking ?? []);
  const abiertas = (pipeline ?? []).filter((f) => !f.cerrada_en);
  const enRiesgo = oportunidadesEnRiesgo(pipeline ?? []);

  const metasPorUsuario = new Map<string, MetaAvance[]>();
  for (const m of metas ?? []) {
    metasPorUsuario.set(m.usuario_id, [...(metasPorUsuario.get(m.usuario_id) ?? []), m]);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{es.control.titulo}</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-tinta-suave">
          {es.control.descripcion}
        </p>
      </div>

      {errorProyectos && (
        <BannerError
          mensaje={(errorProyectos as Error).message}
          onReintentar={() => void refetch()}
        />
      )}

      {/* 4 métricas en tiempo real */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <TarjetaMetrica
          icono={<Store className="h-5 w-5" />}
          titulo={es.control.metricaProyectos}
          valor={cargando ? null : String(resumen.asignados)}
          nota={es.control.metricaProyectosNota(resumen.trabajadosSemana)}
        />
        <TarjetaMetrica
          icono={<Trophy className="h-5 w-5" />}
          titulo={es.control.metricaMejor}
          valor={cargando ? null : mejor ? mejor.nombre : "—"}
          nota={
            mejor
              ? es.control.metricaMejorNota(Number(mejor.actividades_mes))
              : es.control.sinGestionesMes
          }
          chica
        />
        <TarjetaMetrica
          icono={<AlertTriangle className="h-5 w-5" />}
          titulo={es.control.metricaRiesgo}
          valor={cargando ? null : String(enRiesgo.length)}
          nota={es.control.metricaRiesgoNota(DIAS_RIESGO_OPORTUNIDAD)}
          alerta={enRiesgo.length > 0}
        />
        <TarjetaMetrica
          icono={<Wallet className="h-5 w-5" />}
          titulo={es.control.metricaPipeline}
          valor={cargando ? null : sumaPorMoneda(abiertas)}
          nota={es.control.metricaPipelineNota}
          chica
        />
      </div>

      {/* Semáforo de ejecutivos */}
      <section>
        <h2 className="text-lg font-semibold">{es.control.semaforoTitulo}</h2>
        <p className="text-sm text-tinta-suave">{es.control.semaforoNota}</p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-borde bg-superficie shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-superficie-2 text-left text-xs uppercase text-tinta-suave">
              <tr>
                <th className="px-4 py-3">{es.reportes.colEjecutivo}</th>
                <th className="px-4 py-3">{es.reportes.colEquipo}</th>
                <th className="px-4 py-3 text-right">{es.control.colGestion7d}</th>
                <th className="px-4 py-3 text-right">{es.reportes.colHoy}</th>
                <th className="px-4 py-3 text-right">{es.reportes.colAbiertas}</th>
                <th className="px-4 py-3">{es.control.colCumplimiento}</th>
              </tr>
            </thead>
            <tbody>
              {(ranking ?? []).map((fila) => {
                const suyas = metasPorUsuario.get(fila.usuario_id) ?? [];
                const semaforo = semaforoGlobal(suyas);
                const pctProm = suyas.length
                  ? Math.round(
                      suyas.reduce((s, m) => s + porcentajeMeta(m), 0) / suyas.length,
                    )
                  : null;
                return (
                  <tr key={fila.usuario_id} className="border-t border-borde">
                    <td className="px-4 py-3 font-medium">{fila.nombre}</td>
                    <td className="px-4 py-3 text-tinta-suave">
                      {fila.equipo ?? "—"}
                      {fila.pais ? ` · ${fila.pais}` : ""}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {fila.actividades_7d != null ? Number(fila.actividades_7d) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">{fila.actividades_hoy}</td>
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

      {/* Oportunidades en riesgo */}
      {enRiesgo.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <TrendingUp className="h-5 w-5 text-red-500" /> {es.control.metricaRiesgo}
          </h2>
          <div className="mt-3 space-y-2">
            {enRiesgo.slice(0, 8).map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-red-200 dark:border-red-900 bg-superficie p-3"
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
      )}

      {/* Proyectos sin gestión + botón Recordar */}
      <ProyectosSinGestion proyectos={proyectos ?? []} cargando={cargandoProyectos} />

      {/* Historial de asignaciones */}
      <HistorialAsignaciones />
    </div>
  );
}

function TarjetaMetrica({
  icono,
  titulo,
  valor,
  nota,
  chica = false,
  alerta = false,
}: {
  icono: React.ReactNode;
  titulo: string;
  valor: string | null;
  nota: string;
  chica?: boolean;
  alerta?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-superficie shadow-sm p-4 ${
        alerta ? "border-red-300 dark:border-red-900" : "border-borde"
      }`}
    >
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-tinta-tenue">
        <span className={alerta ? "text-red-500" : "text-primario"}>{icono}</span>
        {titulo}
      </p>
      {valor === null ? (
        <Esqueleto className="mt-2 h-7 w-24" />
      ) : (
        <p
          className={`mt-1 truncate font-bold ${chica ? "text-lg" : "text-2xl"} ${
            alerta ? "text-red-600 dark:text-red-400" : "text-tinta"
          }`}
          title={valor}
        >
          {valor}
        </p>
      )}
      <p className="mt-0.5 text-xs text-tinta-tenue">{nota}</p>
    </div>
  );
}
