"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ETIQUETAS_TIPO_ACTIVIDAD,
  ICONOS_TIPO_ACTIVIDAD,
  es,
  formatearFechaLarga,
  formatearHora,
  formatearMonto,
  limitesDiaLocal,
  ordenarPorUrgencia,
  type Actividad,
  type TipoActividad,
} from "@diprem/core";
import { agendaDelDia, oportunidadesAbiertas } from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { Boton, Insignia } from "@/components/ui";
import { FormularioActividad } from "@/components/formulario-actividad";
import { DialogoCompletar } from "@/components/dialogo-completar";

const ACCIONES_RAPIDAS: { tipo: TipoActividad; rapido: boolean }[] = [
  { tipo: "llamada", rapido: true },
  { tipo: "whatsapp", rapido: true },
  { tipo: "reunion", rapido: false },
  { tipo: "visita_terreno", rapido: false },
  { tipo: "tarea", rapido: false },
];

export function MiDiaCliente({ nombre }: { nombre: string }) {
  const supabase = useSupabase();
  const [formulario, setFormulario] = useState<{
    tipo: TipoActividad;
    rapido: boolean;
    oportunidad?: { id: string; nombre: string; cuenta_id: string };
  } | null>(null);
  const [completando, setCompletando] = useState<Actividad | null>(null);

  const { inicio, fin } = limitesDiaLocal();
  const { data: agenda } = useQuery({
    queryKey: ["agenda", inicio],
    queryFn: () => agendaDelDia(supabase, inicio, fin),
    refetchInterval: 60_000,
  });
  const { data: abiertas } = useQuery({
    queryKey: ["seguimientos"],
    queryFn: () => oportunidadesAbiertas(supabase),
  });

  const seguimientos = ordenarPorUrgencia(abiertas ?? []);
  const conAlerta = seguimientos.filter((s) => s.alerta !== "ok");
  const completadasHoy =
    agenda?.agenda.filter((a) => a.estado === "completada").length ?? 0;
  const pendientesHoy =
    (agenda?.agenda.filter((a) => a.estado === "pendiente").length ?? 0) +
    (agenda?.vencidas.length ?? 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {es.fase0.bienvenida}, {nombre.split(" ")[0]} 👋
          </h1>
          <p className="mt-0.5 capitalize text-slate-500">{formatearFechaLarga()}</p>
        </div>
        {/* Resumen del día */}
        <div className="flex gap-4 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">
          <span>
            <b className="text-emerald-600">{completadasHoy}</b>{" "}
            {es.miDia.completadasHoy}
          </span>
          <span>
            <b className="text-[var(--color-diprem)]">{pendientesHoy}</b>{" "}
            {es.miDia.pendientesHoy}
          </span>
          <span>
            <b className={conAlerta.length ? "text-red-600" : "text-slate-500"}>
              {conAlerta.length}
            </b>{" "}
            {es.miDia.alertasSeguimiento}
          </span>
        </div>
      </div>

      {/* Registro rápido */}
      <div className="mt-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
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

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {/* Agenda de hoy */}
        <section>
          <h2 className="text-lg font-semibold">{es.miDia.agendaHoy}</h2>
          <div className="mt-3 space-y-2">
            {(agenda?.agenda.length ?? 0) === 0 && (
              <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
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
              <h3 className="mt-6 flex items-center gap-2 text-sm font-semibold text-red-600">
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
            {seguimientos.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
                {es.miDia.sinSeguimientos}
              </p>
            )}
            {seguimientos.slice(0, 12).map((seguimiento) => (
              <div
                key={seguimiento.id}
                className={`flex items-center justify-between gap-3 rounded-lg border bg-white p-4 ${
                  seguimiento.alerta === "critico"
                    ? "border-red-300"
                    : seguimiento.alerta === "atencion"
                      ? "border-amber-300"
                      : "border-slate-200"
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{seguimiento.nombre}</p>
                  <p className="truncate text-sm text-slate-500">
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
              className="text-sm text-[var(--color-diprem)] hover:underline"
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
      className={`flex items-center gap-3 rounded-lg border bg-white p-3 ${
        vencida ? "border-red-200" : "border-slate-200"
      } ${hecha ? "opacity-60" : ""}`}
    >
      <span className="text-xl">{ICONOS_TIPO_ACTIVIDAD[actividad.tipo]}</span>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-medium ${hecha ? "line-through" : ""}`}>
          {actividad.asunto}
        </p>
        <p className="truncate text-xs text-slate-500">
          {actividad.fecha_programada && formatearHora(actividad.fecha_programada)}
          {actividad.cuenta?.razon_social && ` · ${actividad.cuenta.razon_social}`}
          {actividad.oportunidad?.nombre && ` · ${actividad.oportunidad.nombre}`}
          {actividad.propietario?.nombre && ` · ${actividad.propietario.nombre}`}
        </p>
        {actividad.proxima_accion && hecha && (
          <p className="truncate text-xs text-amber-700">
            → {actividad.proxima_accion}
          </p>
        )}
      </div>
      {!hecha && (
        <Boton variante="secundario" onClick={onCompletar}>
          ✓ {es.miDia.completar}
        </Boton>
      )}
      {hecha && <span className="text-xs text-emerald-600">{es.miDia.completada}</span>}
    </div>
  );
}
