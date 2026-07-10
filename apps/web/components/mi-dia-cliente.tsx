"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ETIQUETAS_PRIORIDAD,
  ETIQUETAS_TIPO_ACTIVIDAD,
  ICONOS_TIPO_ACTIVIDAD,
  calcularRacha,
  es,
  esFinDeDia,
  fechaLimiteVencida,
  formatearFechaCorta,
  formatearFechaLarga,
  formatearHora,
  formatearMonto,
  infoAsignacionLead,
  inicioSemana,
  limitesDiaLocal,
  metaSemanalDerivada,
  ordenarLeadsPorPrioridad,
  ordenarPorUrgencia,
  periodoActual,
  proyectosPrioritarios,
  sugerenciasManana,
  type Actividad,
  type TipoActividad,
} from "@diprem/core";
import {
  agendaDelDia,
  listarAvanceMetas,
  listarFechasGestion,
  listarLeadsActivos,
  listarLeadsNuevos,
  oportunidadesAbiertas,
} from "@diprem/api";
import { usePerfil, useSupabase } from "@/lib/hooks";
import { Boton, Insignia, TarjetasEsqueleto } from "@/components/ui";
import { FormularioActividad } from "@/components/formulario-actividad";
import { DialogoCompletar } from "@/components/dialogo-completar";
import { EnlacesContacto } from "@/components/enlaces-contacto";
import { Recordatorios } from "@/components/recordatorios";

const ACCIONES_RAPIDAS: { tipo: TipoActividad; rapido: boolean }[] = [
  { tipo: "llamada", rapido: true },
  { tipo: "whatsapp", rapido: true },
  { tipo: "reunion", rapido: false },
  { tipo: "visita_terreno", rapido: false },
  { tipo: "tarea", rapido: false },
];

export function MiDiaCliente({ nombre }: { nombre: string }) {
  const supabase = useSupabase();
  const { data: perfil } = usePerfil();
  const [formulario, setFormulario] = useState<{
    tipo: TipoActividad;
    rapido: boolean;
    oportunidad?: { id: string; nombre: string; cuenta_id: string };
    lead?: { id: string; nombre: string };
  } | null>(null);
  const [completando, setCompletando] = useState<Actividad | null>(null);

  const { inicio, fin } = limitesDiaLocal();
  const { data: agenda, isLoading: cargandoAgenda } = useQuery({
    queryKey: ["agenda", inicio],
    queryFn: () => agendaDelDia(supabase, inicio, fin),
    refetchInterval: 60_000,
  });
  const { data: abiertas, isLoading: cargandoSeguimientos } = useQuery({
    queryKey: ["seguimientos"],
    queryFn: () => oportunidadesAbiertas(supabase),
  });
  const { data: leadsNuevos } = useQuery({
    queryKey: ["leads", "nuevos", perfil?.id],
    queryFn: () => listarLeadsNuevos(supabase, perfil?.id),
    enabled: !!perfil,
  });
  const { data: leadsActivos } = useQuery({
    queryKey: ["leads", "activos", perfil?.id],
    queryFn: () => listarLeadsActivos(supabase, perfil?.id),
    enabled: !!perfil,
  });
  // 60 días de fechas de gestión: alcanzan para la racha y la semana
  const desdeRacha = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const { data: fechasGestion } = useQuery({
    queryKey: ["fechas-gestion", perfil?.id],
    queryFn: () => listarFechasGestion(supabase, perfil!.id, desdeRacha),
    enabled: !!perfil,
    refetchInterval: 60_000,
  });
  const periodo = periodoActual();
  const { data: metas } = useQuery({
    queryKey: ["avance_metas", periodo, perfil?.id],
    queryFn: () => listarAvanceMetas(supabase, { periodo, usuario_id: perfil?.id }),
    enabled: !!perfil,
    retry: false,
  });

  const seguimientos = ordenarPorUrgencia(abiertas ?? []);
  const conAlerta = seguimientos.filter((s) => s.alerta !== "ok");
  const completadasHoy =
    agenda?.agenda.filter((a) => a.estado === "completada").length ?? 0;
  const pendientesHoy =
    (agenda?.agenda.filter((a) => a.estado === "pendiente").length ?? 0) +
    (agenda?.vencidas.length ?? 0);

  // Racha, semana vs meta y prioritarios
  const racha = calcularRacha(fechasGestion ?? []);
  const desdeSemana = inicioSemana().getTime();
  const gestionesSemana = (fechasGestion ?? []).filter(
    (f) => new Date(f).getTime() >= desdeSemana,
  ).length;
  const metaActividades = (metas ?? []).find((m) => m.tipo === "actividades");
  const metaSemanal = metaActividades
    ? metaSemanalDerivada(Number(metaActividades.objetivo))
    : null;
  const prioritarios = proyectosPrioritarios(leadsActivos ?? []);
  const idsPrioritarios = new Set(prioritarios.map((p) => p.lead.id));
  const leadsNuevosRestantes = ordenarLeadsPorPrioridad(leadsNuevos ?? []).filter(
    (l) => !idsPrioritarios.has(l.id),
  );
  const sugerencias = sugerenciasManana(
    seguimientos,
    prioritarios,
    agenda?.vencidas ?? [],
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {es.fase0.bienvenida}, {nombre.split(" ")[0]} 👋
          </h1>
          <p className="mt-0.5 capitalize text-tinta-suave">{formatearFechaLarga()}</p>
        </div>
        {/* Resumen del día */}
        <div className="flex gap-4 rounded-xl border border-borde bg-superficie px-4 py-2 text-sm">
          <span>
            <b className="text-emerald-600 dark:text-emerald-400">{completadasHoy}</b>{" "}
            {es.miDia.completadasHoy}
          </span>
          <span>
            <b className="text-primario">{pendientesHoy}</b>{" "}
            {es.miDia.pendientesHoy}
          </span>
          <span>
            <b className={conAlerta.length ? "text-red-600 dark:text-red-400" : "text-tinta-suave"}>
              {conAlerta.length}
            </b>{" "}
            {es.miDia.alertasSeguimiento}
          </span>
        </div>
      </div>

      {/* Racha de gestión + semana vs meta */}
      <div className="mt-4 flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-borde bg-superficie px-4 py-2.5 text-sm">
          <span className="text-xl">🔥</span>
          {racha > 0 ? (
            <span>
              <b className="text-amber-600 dark:text-amber-400">{racha}</b>{" "}
              {es.miDia.racha(racha).replace(/^\d+ /, "")}
            </span>
          ) : (
            <span className="text-tinta-suave">{es.miDia.sinRacha}</span>
          )}
        </div>
        <div
          className="min-w-56 flex-1 rounded-xl border border-borde bg-superficie px-4 py-2.5 text-sm sm:max-w-xs"
          title={metaSemanal ? es.miDia.metaSemanalNota : undefined}
        >
          <div className="flex items-baseline justify-between">
            <span className="text-tinta-suave">{es.miDia.gestionesSemana}</span>
            <b>
              {metaSemanal
                ? es.miDia.gestionesSemanaDe(gestionesSemana, metaSemanal)
                : es.miDia.gestionesSemanaSinMeta(gestionesSemana)}
            </b>
          </div>
          {metaSemanal && (
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-superficie-2">
              <div
                className={`h-full rounded-full ${
                  gestionesSemana >= metaSemanal ? "bg-emerald-500" : "bg-primario"
                }`}
                style={{
                  width: `${Math.min(100, (gestionesSemana / metaSemanal) * 100)}%`,
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Recordatorios pendientes (botón "Recordar" del Panel de Control) */}
      <Recordatorios />

      {/* Resumen de fin de día (desde las 17:00) */}
      {esFinDeDia() && (
        <section className="mt-5 rounded-xl border border-primario/30 bg-primario-suave/50 p-4">
          <h2 className="text-lg font-semibold">🌇 {es.miDia.resumenFinDia}</h2>
          <p className="text-sm text-tinta-suave">{es.miDia.resumenFinDiaNota}</p>
          <p className="mt-2 text-sm">
            ✅ {es.miDia.hicisteHoy(completadasHoy)} ·{" "}
            {es.miDia.quedaronPendientes(pendientesHoy)}
          </p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
            {es.miDia.paraManana}
          </p>
          {sugerencias.length === 0 ? (
            <p className="mt-1 text-sm text-tinta-suave">{es.miDia.sinSugerencias}</p>
          ) : (
            <ol className="mt-1 list-inside list-decimal space-y-1 text-sm">
              {sugerencias.map((sugerencia) => (
                <li key={sugerencia.texto}>
                  {sugerencia.ruta ? (
                    <Link href={sugerencia.ruta} className="hover:text-primario hover:underline">
                      {sugerencia.texto}
                    </Link>
                  ) : (
                    sugerencia.texto
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {/* Proyectos prioritarios de hoy */}
      {prioritarios.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">🎯 {es.miDia.prioritarios}</h2>
          <p className="text-sm text-tinta-suave">{es.miDia.prioritariosNota}</p>
          <div className="mt-3 grid gap-2 lg:grid-cols-3">
            {prioritarios.map(({ lead, limiteVencido }) => {
              const asignacion = infoAsignacionLead(lead);
              return (
                <div
                  key={lead.id}
                  className={`rounded-xl border-2 p-4 ${
                    limiteVencido || asignacion?.prioridad === "alta"
                      ? "border-red-300 dark:border-red-900 bg-superficie"
                      : "border-primario/40 bg-superficie"
                  }`}
                >
                  <p className="flex flex-wrap items-center gap-1.5">
                    <Link
                      href={`/leads/${lead.id}`}
                      className="font-semibold hover:text-primario hover:underline"
                    >
                      {asignacion?.proyecto_nombre ?? lead.nombre}
                    </Link>
                    {asignacion?.prioridad && (
                      <Insignia
                        tono={
                          asignacion.prioridad === "alta"
                            ? "rojo"
                            : asignacion.prioridad === "media"
                              ? "ambar"
                              : "gris"
                        }
                      >
                        {ETIQUETAS_PRIORIDAD[asignacion.prioridad]}
                      </Insignia>
                    )}
                  </p>
                  <p className="truncate text-sm text-tinta-suave">
                    {lead.nombre}
                    {lead.empresa ? ` · ${lead.empresa}` : ""}
                  </p>
                  {asignacion?.fecha_limite_contacto && (
                    <p className="mt-1">
                      <Insignia tono={limiteVencido ? "rojo" : "azul"}>
                        ⏰ {es.control.fechaLimiteCorta}:{" "}
                        {formatearFechaCorta(asignacion.fecha_limite_contacto)}
                        {limiteVencido && ` · ${es.control.vencido}`}
                      </Insignia>
                    </p>
                  )}
                  <div className="mt-2">
                    <Boton
                      variante="secundario"
                      onClick={() =>
                        setFormulario({
                          tipo: "llamada",
                          rapido: true,
                          lead: { id: lead.id, nombre: lead.nombre },
                        })
                      }
                    >
                      {es.miDia.registrarGestion}
                    </Boton>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Registro rápido */}
      <div className="mt-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
          {es.miDia.registroRapido}
        </p>
        <div className="flex flex-wrap gap-2">
          {ACCIONES_RAPIDAS.map(({ tipo, rapido }) => (
            <Boton
              key={tipo}
              variante="secundario"
              onClick={() => setFormulario({ tipo, rapido })}
              className="py-2.5"
            >
              {ICONOS_TIPO_ACTIVIDAD[tipo]}{" "}
              {rapido
                ? `Registrar ${ETIQUETAS_TIPO_ACTIVIDAD[tipo].toLowerCase()}`
                : tipo === "tarea"
                  ? "Nueva tarea"
                  : `Agendar ${ETIQUETAS_TIPO_ACTIVIDAD[tipo].toLowerCase()}`}
            </Boton>
          ))}
        </div>
      </div>

      {/* Leads nuevos asignados (los prioritarios ya se muestran arriba) */}
      {leadsNuevosRestantes.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">
            🆕 {es.miDia.leadsNuevos} ({leadsNuevosRestantes.length})
          </h2>
          <p className="text-sm text-tinta-suave">{es.miDia.leadsNuevosNota}</p>
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {leadsNuevosRestantes.map((lead) => {
              const asignacion = infoAsignacionLead(lead);
              const limiteVencido = fechaLimiteVencida(asignacion?.fecha_limite_contacto);
              const prioridadAlta = asignacion?.prioridad === "alta";
              return (
                <div
                  key={lead.id}
                  className={`rounded-lg border p-4 ${
                    prioridadAlta || limiteVencido
                      ? "border-red-300 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20"
                      : "border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5">
                        <Link
                          href={`/leads/${lead.id}`}
                          className="font-medium hover:text-primario hover:underline"
                        >
                          {lead.nombre}
                        </Link>
                        {asignacion?.prioridad && (
                          <Insignia
                            tono={
                              asignacion.prioridad === "alta"
                                ? "rojo"
                                : asignacion.prioridad === "media"
                                  ? "ambar"
                                  : "gris"
                            }
                          >
                            {es.mercado.prioridad}: {ETIQUETAS_PRIORIDAD[asignacion.prioridad]}
                          </Insignia>
                        )}
                        {asignacion?.fecha_limite_contacto && (
                          <Insignia tono={limiteVencido ? "rojo" : "azul"}>
                            ⏰ {es.control.fechaLimiteCorta}:{" "}
                            {formatearFechaCorta(asignacion.fecha_limite_contacto)}
                            {limiteVencido && ` · ${es.control.vencido}`}
                          </Insignia>
                        )}
                      </p>
                      {lead.empresa && (
                        <p className="truncate text-sm text-tinta-suave">{lead.empresa}</p>
                      )}
                      {asignacion?.nota_asignacion && (
                        <p className="mt-1 rounded-lg bg-superficie px-2.5 py-1.5 text-sm italic text-tinta-suave">
                          💬 {asignacion.nota_asignacion}
                        </p>
                      )}
                      <div className="mt-1.5">
                        <EnlacesContacto
                          telefono={lead.telefono}
                          email={lead.email}
                          compacto
                        />
                      </div>
                    </div>
                    <Boton
                      variante="secundario"
                      onClick={() =>
                        setFormulario({
                          tipo: "llamada",
                          rapido: true,
                          lead: { id: lead.id, nombre: lead.nombre },
                        })
                      }
                    >
                      {es.miDia.registrarGestion}
                    </Boton>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {/* Agenda de hoy */}
        <section>
          <h2 className="text-lg font-semibold">{es.miDia.agendaHoy}</h2>
          <div className="mt-3 space-y-2">
            {cargandoAgenda && <TarjetasEsqueleto />}
            {!cargandoAgenda && (agenda?.agenda.length ?? 0) === 0 && (
              <p className="rounded-lg border border-dashed border-borde p-6 text-center text-sm text-tinta-tenue">
                {es.miDia.sinAgenda}
              </p>
            )}
            {agenda?.agenda.map((actividad) => (
              <TarjetaActividad
                key={actividad.id}
                actividad={actividad}
                onCompletar={() => setCompletando(actividad)}
              />
            ))}
          </div>

          {(agenda?.vencidas.length ?? 0) > 0 && (
            <>
              <h3 className="mt-6 flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400">
                ⚠️ {es.miDia.vencidas} ({agenda?.vencidas.length})
              </h3>
              <div className="mt-2 space-y-2">
                {agenda?.vencidas.map((actividad) => (
                  <TarjetaActividad
                    key={actividad.id}
                    actividad={actividad}
                    vencida
                    onCompletar={() => setCompletando(actividad)}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        {/* Seguimientos pendientes */}
        <section>
          <h2 className="text-lg font-semibold">{es.miDia.seguimientos}</h2>
          <div className="mt-3 space-y-2">
            {cargandoSeguimientos && <TarjetasEsqueleto />}
            {!cargandoSeguimientos && seguimientos.length === 0 && (
              <p className="rounded-lg border border-dashed border-borde p-6 text-center text-sm text-tinta-tenue">
                {es.miDia.sinSeguimientos}
              </p>
            )}
            {seguimientos.slice(0, 12).map((seguimiento) => (
              <div
                key={seguimiento.id}
                className={`flex items-center justify-between gap-3 rounded-lg border bg-superficie p-4 ${
                  seguimiento.alerta === "critico"
                    ? "border-red-300 dark:border-red-900"
                    : seguimiento.alerta === "atencion"
                      ? "border-amber-300 dark:border-amber-800"
                      : "border-borde"
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{seguimiento.nombre}</p>
                  <p className="truncate text-sm text-tinta-suave">
                    {seguimiento.cuenta?.razon_social} ·{" "}
                    {formatearMonto(seguimiento.monto, seguimiento.moneda)}
                  </p>
                  <div className="mt-1">
                    <Insignia
                      tono={
                        seguimiento.alerta === "critico"
                          ? "rojo"
                          : seguimiento.alerta === "atencion"
                            ? "ambar"
                            : "verde"
                      }
                    >
                      {es.miDia.diasSinContacto(seguimiento.dias_sin_contacto)}
                    </Insignia>
                  </div>
                </div>
                <Boton
                  variante="secundario"
                  onClick={() =>
                    setFormulario({
                      tipo: "llamada",
                      rapido: true,
                      oportunidad: {
                        id: seguimiento.id,
                        nombre: seguimiento.nombre,
                        cuenta_id: seguimiento.cuenta_id,
                      },
                    })
                  }
                >
                  {es.miDia.registrarGestion}
                </Boton>
              </div>
            ))}
          </div>
          <p className="mt-3 text-right">
            <Link
              href="/oportunidades"
              className="text-sm text-primario hover:underline"
            >
              Ver embudo completo →
            </Link>
          </p>
        </section>
      </div>

      {formulario && (
        <FormularioActividad
          abierto
          tipoInicial={formulario.tipo}
          registroRapido={formulario.rapido}
          oportunidadFija={formulario.oportunidad ?? null}
          leadFijo={formulario.lead ?? null}
          onCerrar={() => setFormulario(null)}
        />
      )}
      <DialogoCompletar actividad={completando} onCerrar={() => setCompletando(null)} />
    </div>
  );
}

function TarjetaActividad({
  actividad,
  vencida = false,
  onCompletar,
}: {
  actividad: Actividad;
  vencida?: boolean;
  onCompletar: () => void;
}) {
  const hecha = actividad.estado === "completada";
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border bg-superficie p-3 ${
        vencida ? "border-red-200 dark:border-red-900" : "border-borde"
      } ${hecha ? "opacity-60" : ""}`}
    >
      <span className="text-xl">{ICONOS_TIPO_ACTIVIDAD[actividad.tipo]}</span>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-medium ${hecha ? "line-through" : ""}`}>
          {actividad.asunto}
        </p>
        <p className="truncate text-xs text-tinta-suave">
          {actividad.fecha_programada && formatearHora(actividad.fecha_programada)}
          {actividad.cuenta?.razon_social && ` · ${actividad.cuenta.razon_social}`}
          {actividad.oportunidad?.nombre && ` · ${actividad.oportunidad.nombre}`}
          {actividad.propietario?.nombre && ` · ${actividad.propietario.nombre}`}
        </p>
        {actividad.proxima_accion && hecha && (
          <p className="truncate text-xs text-amber-700 dark:text-amber-300">
            → {actividad.proxima_accion}
          </p>
        )}
      </div>
      {!hecha && (
        <Boton variante="secundario" onClick={onCompletar}>
          ✓ {es.miDia.completar}
        </Boton>
      )}
      {hecha && <span className="text-xs text-emerald-600 dark:text-emerald-400">{es.miDia.completada}</span>}
    </div>
  );
}
