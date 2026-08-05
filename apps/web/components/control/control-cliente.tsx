"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Target, TrendingUp, Users, Wallet } from "lucide-react";
import {
  es,
  formatearFechaCorta,
  formatearMonto,
  periodoActual,
  porcentajeMeta,
  semaforoGlobal,
  type MetaAvance,
  type Moneda,
  type Semaforo,
} from "@diprem/core";
import {
  liberarCuenta,
  listarAvanceMetas,
  listarControlAvanceDecisor,
  listarControlCobertura,
  listarControlCriticas,
  listarControlEmbudo,
  listarControlHuerfanas,
  listarControlRespuesta,
  listarGestionProyectos,
  listarPipelineDetalle,
  type FilaCobertura,
  type FilaCritica,
} from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { BannerError, Boton, Esqueleto, Insignia } from "@/components/ui";
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

const HACE_30D = () => new Date(Date.now() - 30 * 86400_000).toISOString();

export function ControlCliente() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const periodo = periodoActual();

  const [umbral, setUmbral] = useState(14);
  const [detalleDe, setDetalleDe] = useState<FilaCobertura | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const { data: cobertura, isLoading, error: errorCarga, refetch } = useQuery({
    queryKey: ["control_cobertura"],
    queryFn: () => listarControlCobertura(supabase),
    retry: false,
  });
  const { data: criticas } = useQuery({
    queryKey: ["control_criticas"],
    queryFn: () => listarControlCriticas(supabase),
    retry: false,
  });
  const { data: avances } = useQuery({
    queryKey: ["control_avances"],
    queryFn: () => listarControlAvanceDecisor(supabase),
    retry: false,
  });
  const { data: embudo } = useQuery({
    queryKey: ["control_embudo"],
    queryFn: () => listarControlEmbudo(supabase, HACE_30D()),
    retry: false,
  });
  const { data: huerfanas } = useQuery({
    queryKey: ["control_huerfanas"],
    queryFn: () => listarControlHuerfanas(supabase),
    retry: false,
  });
  const { data: respuesta } = useQuery({
    queryKey: ["control_respuesta"],
    queryFn: () => listarControlRespuesta(supabase),
    retry: false,
  });
  const { data: metas } = useQuery({
    queryKey: ["avance_metas", periodo],
    queryFn: () => listarAvanceMetas(supabase, { periodo }),
    retry: false,
  });
  const { data: pipeline } = useQuery({
    queryKey: ["pipeline_detalle"],
    queryFn: () => listarPipelineDetalle(supabase),
    retry: false,
  });
  const { data: proyectos, isLoading: cargandoProyectos } = useQuery({
    queryKey: ["gestion_proyectos"],
    queryFn: () => listarGestionProyectos(supabase),
    retry: false,
  });

  const liberar = useMutation({
    mutationFn: (cuentaId: string) => liberarCuenta(supabase, cuentaId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["control_criticas"] });
      void queryClient.invalidateQueries({ queryKey: ["control_cobertura"] });
      setMensaje(es.control.liberada);
    },
    onError: (e: Error) => setMensaje(e.message),
  });

  // ---- Agregaciones por ejecutivo (30 días), en el cliente ----
  const corte30 = useMemo(() => Date.now() - 30 * 86400_000, []);
  const avances30 = useMemo(
    () => (avances ?? []).filter((a) => new Date(a.logrado_en).getTime() >= corte30),
    [avances, corte30],
  );
  const porEjecutivo = useMemo(() => {
    const m = new Map<
      string,
      { avances: number; subidas: number; bajadas: number; huerfanas: number }
    >();
    const de = (id: string) => {
      if (!m.has(id)) m.set(id, { avances: 0, subidas: 0, bajadas: 0, huerfanas: 0 });
      return m.get(id)!;
    };
    for (const a of avances30) de(a.propietario_id).avances++;
    for (const e of embudo ?? []) {
      if (e.avance) de(e.propietario_id).subidas++;
      else de(e.propietario_id).bajadas++;
    }
    for (const h of huerfanas ?? []) de(h.propietario_id).huerfanas++;
    return m;
  }, [avances30, embudo, huerfanas]);

  const respuestaPor = useMemo(() => {
    const m = new Map<string, { tasa: number | null; registradas: number }>();
    for (const r of respuesta ?? [])
      m.set(r.usuario_id, {
        tasa: r.tasa_pct != null ? Number(r.tasa_pct) : null,
        registradas: Number(r.con_respuesta) + Number(r.sin_respuesta),
      });
    return m;
  }, [respuesta]);

  const metasPorUsuario = useMemo(() => {
    const m = new Map<string, MetaAvance[]>();
    for (const meta of metas ?? [])
      m.set(meta.usuario_id, [...(m.get(meta.usuario_id) ?? []), meta]);
    return m;
  }, [metas]);

  // Peor cobertura ARRIBA: es lo que el dueño necesita ver primero
  const filasCobertura = useMemo(
    () =>
      [...(cobertura ?? [])]
        .filter((f) => f.cartera > 0 || (porEjecutivo.get(f.usuario_id)?.huerfanas ?? 0) > 0)
        .sort((a, b) => (a.cobertura_pct ?? 0) - (b.cobertura_pct ?? 0)),
    [cobertura, porEjecutivo],
  );

  // Acaparador: reclamadas sin gestión sobre el umbral, ordenadas por valor
  const acaparadas = useMemo(
    () =>
      (criticas ?? [])
        .filter((c) => c.dias_sin_gestion >= umbral)
        .sort(
          (a, b) =>
            (b.capex_max ?? -1) - (a.capex_max ?? -1) ||
            b.dias_sin_gestion - a.dias_sin_gestion,
        ),
    [criticas, umbral],
  );

  const abiertas = (pipeline ?? []).filter((f) => !f.cerrada_en);
  const coberturaProm = filasCobertura.length
    ? Math.round(
        filasCobertura.reduce((s, f) => s + (f.cobertura_pct ?? 0), 0) /
          filasCobertura.length,
      )
    : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{es.control.titulo}</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-tinta-suave">
          {es.control.descripcion}
        </p>
      </div>

      {errorCarga && (
        <BannerError
          mensaje={(errorCarga as Error).message}
          onReintentar={() => void refetch()}
        />
      )}
      {mensaje && (
        <p className="rounded-lg border border-borde bg-superficie-2 px-4 py-2 text-sm">
          {mensaje}{" "}
          <button className="underline" onClick={() => setMensaje(null)}>
            ✕
          </button>
        </p>
      )}

      {/* 🔴 ACAPARADOR — arriba y en rojo, imposible de ignorar */}
      <section className="rounded-xl border-2 border-red-300 bg-red-50/60 p-4 dark:border-red-900 dark:bg-red-950/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-red-800 dark:text-red-300">
            <AlertTriangle className="h-5 w-5" /> {es.control.acaparadorTitulo}
            {acaparadas.length > 0 && (
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-sm font-bold text-white">
                {acaparadas.length}
              </span>
            )}
          </h2>
          <label className="flex items-center gap-2 text-sm text-tinta-suave">
            {es.control.umbralDias}
            <select
              className="rounded-md border border-borde bg-superficie px-2 py-1 text-sm"
              value={umbral}
              onChange={(e) => setUmbral(Number(e.target.value))}
            >
              {[7, 14, 30].map((d) => (
                <option key={d} value={d}>
                  {d} días
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-0.5 text-xs text-red-700/80 dark:text-red-300/80">
          {es.control.acaparadorNota(umbral)}
        </p>
        {acaparadas.length === 0 ? (
          <p className="mt-3 text-sm text-tinta-suave">{es.control.acaparadorVacio}</p>
        ) : (
          <div className="mt-3 space-y-1.5">
            {acaparadas.slice(0, 10).map((c) => (
              <FilaAcaparada
                key={c.cuenta_id}
                critica={c}
                liberando={liberar.isPending}
                onLiberar={() => {
                  if (confirm(es.control.confirmarLiberar(c.razon_social)))
                    liberar.mutate(c.cuenta_id);
                }}
              />
            ))}
            {acaparadas.length > 10 && (
              <p className="text-xs text-tinta-tenue">
                +{acaparadas.length - 10}…
              </p>
            )}
          </div>
        )}
      </section>

      {/* 4 métricas de RESULTADO */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <TarjetaMetrica
          icono={<Users className="h-5 w-5" />}
          titulo={es.control.colCobertura}
          valor={isLoading ? null : coberturaProm != null ? `${coberturaProm}%` : "—"}
          nota={es.control.resultadoNota}
        />
        <TarjetaMetrica
          icono={<Target className="h-5 w-5" />}
          titulo={es.control.colDecisores}
          valor={isLoading ? null : String(avances30.length)}
          nota={es.control.avancesNota}
        />
        <TarjetaMetrica
          icono={<TrendingUp className="h-5 w-5" />}
          titulo={es.control.huerfanasTitulo}
          valor={isLoading ? null : String((huerfanas ?? []).length)}
          nota={es.control.huerfanasNota}
          alerta={(huerfanas ?? []).length > 0}
        />
        <TarjetaMetrica
          icono={<Wallet className="h-5 w-5" />}
          titulo={es.control.metricaPipeline}
          valor={isLoading ? null : sumaPorMoneda(abiertas)}
          nota={es.control.metricaPipelineNota}
          chica
        />
      </div>

      {/* Resultado por ejecutivo — peor cobertura arriba, sin ranking de actividades */}
      <section>
        <h2 className="text-lg font-semibold">{es.control.resultadoTitulo}</h2>
        <p className="text-sm text-tinta-suave">{es.control.resultadoNota}</p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-borde bg-superficie shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-superficie-2 text-left text-xs uppercase text-tinta-suave">
              <tr>
                <th className="px-4 py-3">{es.reportes.colEjecutivo}</th>
                <th className="px-4 py-3 text-right">{es.control.colCarteraCorta}</th>
                <th className="px-4 py-3">{es.control.colCobertura}</th>
                <th className="px-4 py-3 text-right">{es.control.colDecisores}</th>
                <th className="px-4 py-3 text-right">{es.control.colEmbudo}</th>
                <th className="px-4 py-3 text-right">{es.control.colHuerfanas}</th>
                <th className="px-4 py-3 text-right">{es.control.colTasaRespuesta}</th>
                <th className="px-4 py-3">{es.control.colCumplimiento}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={9} className="p-4">
                    <Esqueleto className="h-6 w-full" />
                  </td>
                </tr>
              )}
              {filasCobertura.map((fila) => {
                const extra = porEjecutivo.get(fila.usuario_id);
                const resp = respuestaPor.get(fila.usuario_id);
                const suyas = metasPorUsuario.get(fila.usuario_id) ?? [];
                const semaforo = semaforoGlobal(suyas);
                const pctProm = suyas.length
                  ? Math.round(
                      suyas.reduce((s, m) => s + porcentajeMeta(m), 0) / suyas.length,
                    )
                  : null;
                const pct = fila.cobertura_pct != null ? Number(fila.cobertura_pct) : null;
                return (
                  <tr key={fila.usuario_id} className="border-t border-borde">
                    <td className="px-4 py-3">
                      <p className="font-medium">{fila.nombre}</p>
                      <p className="text-xs text-tinta-suave">{fila.equipo ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{fila.cartera}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-superficie-2">
                          <div
                            className={`h-full rounded-full ${
                              (pct ?? 0) < 30
                                ? "bg-red-500"
                                : (pct ?? 0) < 60
                                  ? "bg-amber-400"
                                  : "bg-emerald-500"
                            }`}
                            style={{ width: `${pct ?? 0}%` }}
                          />
                        </div>
                        <span
                          className={`tabular-nums text-sm font-semibold ${
                            (pct ?? 0) < 30 ? "text-red-600 dark:text-red-400" : ""
                          }`}
                        >
                          {pct != null ? `${pct}%` : "—"}
                        </span>
                        <span className="text-xs text-tinta-tenue">
                          ({fila.gestionadas_30d}/{fila.cartera})
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {extra?.avances ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className="text-emerald-700 dark:text-emerald-300">
                        ↑{extra?.subidas ?? 0}
                      </span>{" "}
                      <span className="text-tinta-tenue">↓{extra?.bajadas ?? 0}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {extra?.huerfanas ? (
                        <span className="font-semibold text-red-600 dark:text-red-400">
                          {extra.huerfanas}
                        </span>
                      ) : (
                        0
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {resp?.tasa != null ? (
                        `${resp.tasa}%`
                      ) : (
                        <span className="text-xs text-tinta-tenue">
                          {es.control.sinDatoTasa}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {semaforo ? (
                        <span className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${PUNTO[semaforo]}`} />
                          {pctProm}%
                        </span>
                      ) : (
                        <span className="text-xs text-tinta-tenue">
                          {es.reportes.sinMetasFila}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Boton variante="fantasma" onClick={() => setDetalleDe(fila)}>
                        {es.control.verDetalle}
                      </Boton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Drill-down del ejecutivo */}
      {detalleDe && (
        <DetalleEjecutivo
          fila={detalleDe}
          criticas={(criticas ?? []).filter(
            (c) => c.propietario_id === detalleDe.usuario_id && c.dias_sin_gestion >= umbral,
          )}
          huerfanas={(huerfanas ?? []).filter(
            (h) => h.propietario_id === detalleDe.usuario_id,
          )}
          avances={avances30.filter((a) => a.propietario_id === detalleDe.usuario_id)}
          onCerrar={() => setDetalleDe(null)}
        />
      )}

      {/* Decisores conseguidos (30d): la métrica que importa */}
      <section>
        <h2 className="text-lg font-semibold">{es.control.avancesTitulo}</h2>
        <p className="text-sm text-tinta-suave">{es.control.avancesNota}</p>
        {avances30.length === 0 ? (
          <p className="mt-3 text-sm text-tinta-tenue">{es.control.sinAvances}</p>
        ) : (
          <div className="mt-3 space-y-1.5">
            {avances30.slice(0, 8).map((a) => (
              <div
                key={a.cuenta_id}
                className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-superficie p-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/cuentas/${a.cuenta_id}`}
                    className="truncate font-medium hover:underline"
                  >
                    {a.razon_social}
                  </Link>
                  <p className="truncate text-xs text-tinta-suave">
                    {a.autor ?? a.ejecutivo} · {formatearFechaCorta(a.logrado_en)}
                  </p>
                </div>
                <Insignia tono="verde">✓ decisor</Insignia>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Huérfanas (todas) */}
      {(huerfanas ?? []).length > 0 && (
        <section>
          <h2 className="text-lg font-semibold">{es.control.huerfanasTitulo}</h2>
          <p className="text-sm text-tinta-suave">{es.control.huerfanasNota}</p>
          <div className="mt-3 space-y-1.5">
            {(huerfanas ?? []).slice(0, 8).map((h) => (
              <div
                key={h.oportunidad_id}
                className="flex items-center justify-between gap-3 rounded-xl border border-red-200 dark:border-red-900 bg-superficie p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{h.oportunidad}</p>
                  <p className="truncate text-xs text-tinta-suave">
                    {h.razon_social} · {h.ejecutivo} · {h.etapa}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">
                    {formatearMonto(h.monto, h.moneda as Moneda)}
                  </p>
                  <Insignia tono="rojo">
                    {es.reportes.diasSinActividad(h.dias_sin_contacto)}
                  </Insignia>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Proyectos sin gestión + Historial (se mantienen) */}
      <ProyectosSinGestion proyectos={proyectos ?? []} cargando={cargandoProyectos} />
      <HistorialAsignaciones />
    </div>
  );
}

function FilaAcaparada({
  critica,
  liberando,
  onLiberar,
}: {
  critica: FilaCritica;
  liberando: boolean;
  onLiberar: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 dark:border-red-900 bg-superficie p-3">
      <div className="min-w-0">
        <Link
          href={`/cuentas/${critica.cuenta_id}`}
          className="font-medium hover:underline"
        >
          {critica.razon_social}
        </Link>
        <p className="text-xs text-tinta-suave">
          {critica.ejecutivo}
          {critica.n_proyectos > 0 &&
            ` · ${critica.n_proyectos} proyecto(s)${
              critica.capex_max != null
                ? ` · máx ${Number(critica.capex_max).toLocaleString("es-CL")} MUSD`
                : ""
            }`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Insignia tono="rojo">
          {es.reportes.diasSinActividad(critica.dias_sin_gestion)}
        </Insignia>
        <Boton variante="secundario" disabled={liberando} onClick={onLiberar}>
          {liberando ? es.control.liberando : es.control.liberarAlPool}
        </Boton>
      </div>
    </div>
  );
}

function DetalleEjecutivo({
  fila,
  criticas,
  huerfanas,
  avances,
  onCerrar,
}: {
  fila: FilaCobertura;
  criticas: FilaCritica[];
  huerfanas: { oportunidad_id: string; oportunidad: string; razon_social: string; dias_sin_contacto: number }[];
  avances: { cuenta_id: string; razon_social: string; logrado_en: string }[];
  onCerrar: () => void;
}) {
  return (
    <section className="rounded-xl border border-primario/40 bg-superficie p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{es.control.detalleDe(fila.nombre)}</h2>
        <Boton variante="fantasma" onClick={onCerrar}>
          ✕
        </Boton>
      </div>
      <p className="text-sm text-tinta-suave">
        {es.control.detalleCartera(
          fila.cartera,
          fila.cobertura_pct != null ? `${fila.cobertura_pct}%` : "—",
        )}
      </p>
      <div className="mt-3 grid gap-4 lg:grid-cols-3">
        <div>
          <h3 className="text-sm font-semibold text-red-700 dark:text-red-300">
            {es.control.acaparadorTitulo}
          </h3>
          {criticas.length === 0 ? (
            <p className="mt-1 text-xs text-tinta-tenue">{es.control.detalleSinCriticas}</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm">
              {criticas.slice(0, 6).map((c) => (
                <li key={c.cuenta_id} className="flex justify-between gap-2">
                  <Link href={`/cuentas/${c.cuenta_id}`} className="truncate hover:underline">
                    {c.razon_social}
                  </Link>
                  <span className="shrink-0 text-xs text-red-600 dark:text-red-400">
                    {c.dias_sin_gestion} d
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold">{es.control.huerfanasTitulo}</h3>
          {huerfanas.length === 0 ? (
            <p className="mt-1 text-xs text-tinta-tenue">{es.control.detalleSinHuerfanas}</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm">
              {huerfanas.slice(0, 6).map((h) => (
                <li key={h.oportunidad_id} className="flex justify-between gap-2">
                  <span className="truncate">{h.oportunidad}</span>
                  <span className="shrink-0 text-xs text-tinta-tenue">
                    {h.dias_sin_contacto} d
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            {es.control.avancesTitulo}
          </h3>
          {avances.length === 0 ? (
            <p className="mt-1 text-xs text-tinta-tenue">{es.control.sinAvances}</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm">
              {avances.slice(0, 6).map((a) => (
                <li key={a.cuenta_id} className="flex justify-between gap-2">
                  <Link href={`/cuentas/${a.cuenta_id}`} className="truncate hover:underline">
                    {a.razon_social}
                  </Link>
                  <span className="shrink-0 text-xs text-tinta-tenue">
                    {formatearFechaCorta(a.logrado_en)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
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
