"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mensajeError,
  ETIQUETAS_ETAPA_PROYECTO,
  ETIQUETAS_PRIORIDAD,
  ORDEN_SEGMENTOS,
  contactosDelProyecto,
  enVentanaCaliente,
  es,
  formatearFechaCorta,
  segmentoDelProyecto,
  type EstadoProyectoMercado,
  type EtapaProyecto,
  type PrioridadProyecto,
  type ProyectoMercado,
  type SegmentoRadar,
} from "@diprem/core";
import {
  actualizarEtapaProyecto,
  asignarProyectosMercado,
  listarControlCriticas,
  listarEjecutivosAsignables,
  listarProyectosMercado,
  type FilaCritica,
} from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import {
  AreaTexto,
  BannerError,
  Boton,
  Campo,
  Dialogo,
  Entrada,
  EstadoVacio,
  FilasEsqueleto,
  Insignia,
  Selector,
  EncabezadoPagina,
} from "@/components/ui";
import { ImportadorMercado } from "@/components/mercado/importador";

const ETAPAS: EtapaProyecto[] = [
  "exploracion",
  "perfil",
  "prefactibilidad",
  "factibilidad",
  "ingenieria_basica",
  "ingenieria_detalle",
  "en_licitacion",
  "construccion",
  "comisionamiento",
  "operacion",
  "paralizado",
  "cerrado",
];

const TONO_CONTACTOS: Record<string, "verde" | "azul" | "ambar" | "rojo"> = {
  decisor: "verde",
  gestor: "azul",
  puerta: "ambar",
  ninguno: "rojo",
};

export function MercadoCliente() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();

  const [segmento, setSegmento] = useState<SegmentoRadar>("pipeline");
  const [busqueda, setBusqueda] = useState("");
  const [filtroRegion, setFiltroRegion] = useState("");
  const [filtroEjecutivo, setFiltroEjecutivo] = useState(""); // "" todos · "sin" sin asignar · id
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [importando, setImportando] = useState(false);
  const [asignando, setAsignando] = useState(false);
  const [detalleScore, setDetalleScore] = useState<ProyectoMercado | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: proyectos, isLoading, error: errorCarga, refetch } = useQuery({
    queryKey: ["mercado"],
    queryFn: () => listarProyectosMercado(supabase),
  });
  // Última gestión por cuenta (v_control_criticas: admin/gerente)
  const { data: criticas } = useQuery({
    queryKey: ["control_criticas"],
    queryFn: () => listarControlCriticas(supabase),
    retry: false,
  });
  const gestionPorCuenta = useMemo(() => {
    const m = new Map<string, FilaCritica>();
    for (const c of criticas ?? []) m.set(c.cuenta_id, c);
    return m;
  }, [criticas]);

  // Llegada desde el buscador global: /mercado?buscar=<proyecto>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const buscar = params.get("buscar");
    if (buscar) {
      setBusqueda(buscar);
      setSegmento("pipeline");
      window.history.replaceState(null, "", "/mercado");
    }
  }, []);

  const { data: ejecutivos } = useQuery({
    queryKey: ["ejecutivos-asignables"],
    queryFn: () => listarEjecutivosAsignables(supabase),
  });

  // Conteos por segmento (con búsqueda/filtros aplicados a todos por igual)
  const base = useMemo(() => {
    const b = busqueda.trim().toLowerCase();
    return (proyectos ?? []).filter(
      (p) =>
        (!filtroRegion || p.region === filtroRegion) &&
        (!filtroEjecutivo ||
          (filtroEjecutivo === "sin"
            ? p.estado === "sin_asignar"
            : p.asignado_a === filtroEjecutivo)) &&
        (!b || p.nombre.toLowerCase().includes(b) || p.empresa.toLowerCase().includes(b)),
    );
  }, [proyectos, busqueda, filtroRegion, filtroEjecutivo]);

  const porSegmento = useMemo(() => {
    const m = new Map<SegmentoRadar, ProyectoMercado[]>();
    for (const s of ORDEN_SEGMENTOS) m.set(s, []);
    for (const p of base) m.get(segmentoDelProyecto(p))!.push(p);
    // dentro del segmento: score desc, luego CAPEX; por clasificar: prioridad alta primero
    for (const [s, lista] of m) {
      lista.sort((a, b) => {
        if (s === "por_clasificar" && a.prioridad !== b.prioridad)
          return a.prioridad === "alta" ? -1 : 1;
        return (b.score ?? 0) - (a.score ?? 0) || (b.capex_musd ?? 0) - (a.capex_musd ?? 0);
      });
    }
    return m;
  }, [base]);

  const filtrados = porSegmento.get(segmento) ?? [];
  const regiones = useMemo(
    () => [...new Set((proyectos ?? []).map((p) => p.region).filter(Boolean))].sort() as string[],
    [proyectos],
  );

  const asignables = filtrados.filter((p) => p.estado === "sin_asignar");
  const todosSeleccionados =
    asignables.length > 0 && asignables.every((p) => seleccion.has(p.id));

  const alternar = (id: string) => {
    setSeleccion((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  };

  const cambiarEtapa = useMutation({
    mutationFn: ({ id, etapa }: { id: string; etapa: string | null }) =>
      actualizarEtapaProyecto(supabase, id, etapa),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mercado"] });
      setMensaje(es.mercado.etapaActualizada);
      setError(null);
    },
    onError: (e: Error) => setError(mensajeError(e)),
  });

  const asignar = useMutation({
    mutationFn: async (form: FormData) => {
      const ejecutivoId = form.get("ejecutivo_id") as string;
      if (!ejecutivoId) throw new Error("Selecciona un ejecutivo");
      return asignarProyectosMercado(supabase, [...seleccion], ejecutivoId, {
        prioridad: (form.get("prioridad") as PrioridadProyecto) || "media",
        fecha_limite: (form.get("fecha_limite") as string) || null,
        nota: (form.get("nota") as string) || null,
        dias_alerta: Number(form.get("dias_alerta")) || 5,
      });
    },
    onSuccess: (resultado) => {
      void queryClient.invalidateQueries({ queryKey: ["mercado"] });
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
      setMensaje(es.mercado.resultadoAsignacion(resultado.asignados, resultado.omitidos));
      setSeleccion(new Set());
      setAsignando(false);
      setError(null);
    },
    onError: (e: Error) => setError(mensajeError(e)),
  });

  return (
    <div>
      <EncabezadoPagina
        titulo={es.mercado.titulo}
        descripcion={es.mercado.descripcion}
        acciones={<Boton onClick={() => setImportando(true)}>📥 {es.mercado.importar}</Boton>}
      />

      {mensaje && (
        <p className="mt-4 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2 text-sm text-emerald-800 dark:text-emerald-300">
          {mensaje}{" "}
          <button className="underline" onClick={() => setMensaje(null)}>
            ✕
          </button>
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-2 text-sm text-red-700 dark:text-red-300">
          {error}{" "}
          <button className="underline" onClick={() => setError(null)}>
            ✕
          </button>
        </p>
      )}

      {/* Segmentos del Radar */}
      <div className="mt-5 flex flex-wrap gap-1.5" role="tablist">
        {ORDEN_SEGMENTOS.map((s) => {
          const n = porSegmento.get(s)?.length ?? 0;
          const activo = segmento === s;
          return (
            <button
              key={s}
              role="tab"
              aria-selected={activo}
              title={es.mercado.segmentosNota[s]}
              onClick={() => {
                setSegmento(s);
                setSeleccion(new Set());
              }}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                activo
                  ? "border-primario bg-primario text-white"
                  : "border-borde bg-superficie hover:bg-superficie-2"
              }`}
            >
              {es.mercado.segmentos[s]}{" "}
              <span className={activo ? "opacity-80" : "text-tinta-tenue"}>{n}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-tinta-tenue">{es.mercado.segmentosNota[segmento]}</p>

      {/* Filtros */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Entrada
          placeholder={es.comunes.buscar}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="sm:w-56 rounded-md border border-borde px-3 py-2 text-sm"
        />
        <select
          className="w-full rounded-md border border-borde bg-superficie px-3 py-2 text-sm sm:w-auto"
          value={filtroRegion}
          onChange={(e) => setFiltroRegion(e.target.value)}
        >
          <option value="">{es.mercado.region}: {es.comunes.todos}</option>
          {regiones.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          className="w-full rounded-md border border-borde bg-superficie px-3 py-2 text-sm sm:w-auto"
          value={filtroEjecutivo}
          onChange={(e) => setFiltroEjecutivo(e.target.value)}
        >
          <option value="">{es.mercado.filtroEjecutivo}: {es.comunes.todos}</option>
          <option value="sin">⚠️ {es.mercado.sinAsignarFiltro}</option>
          {ejecutivos?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </select>

        {seleccion.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-tinta-suave">
              {es.mercado.seleccionados(seleccion.size)}
            </span>
            <Boton onClick={() => setAsignando(true)}>
              {es.mercado.asignarSeleccionados(seleccion.size)}
            </Boton>
          </div>
        )}
      </div>

      {/* Móvil: tarjetas apiladas (la tabla del radar no cabe legible) */}
      <div className="mt-4 space-y-2 md:hidden">
        {isLoading && (
          <div className="rounded-xl border border-borde bg-superficie p-4 text-sm text-tinta-tenue">
            {es.comunes.cargando}
          </div>
        )}
        {!isLoading && !errorCarga && filtrados.length === 0 && (
          <EstadoVacio titulo={es.mercado.sinProyectos} />
        )}
        {filtrados.map((p) => {
          const contactos = contactosDelProyecto(p);
          const gestion = p.cuenta_id ? gestionPorCuenta.get(p.cuenta_id) : undefined;
          return (
            <div key={p.id} className="rounded-xl border border-borde bg-superficie p-3.5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 font-semibold leading-snug">
                  {enVentanaCaliente(p.etapa) && "🔥 "}
                  {p.prioridad === "alta" && !p.etapa && "⚠️ "}
                  {p.nombre}
                </p>
                <button
                  onClick={() => setDetalleScore(p)}
                  title={es.mercado.porQuePuntuo}
                  className={`shrink-0 rounded-md px-2 py-1 text-sm font-bold tabular-nums ${
                    (p.score ?? 0) >= 75
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : (p.score ?? 0) >= 50
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        : "bg-superficie-2 text-tinta-suave"
                  }`}
                >
                  {p.score ?? "—"}
                </button>
              </div>
              <p className="mt-0.5 text-xs text-tinta-suave">
                {p.empresa}
                {p.region ? ` · ${p.region}` : ""}
              </p>
              <p className="mt-1.5 text-xs text-tinta-suave">
                {p.capex_musd != null && (
                  <>💰 {Number(p.capex_musd).toLocaleString("es-CL")} MUSD · </>
                )}
                🏗 {p.inicio_construccion ? formatearFechaCorta(p.inicio_construccion) : "—"} · ▶{" "}
                {p.puesta_en_marcha ? formatearFechaCorta(p.puesta_en_marcha) : "—"}
                {gestion?.ultima_gestion
                  ? ` · ⏱ ${es.mercado.diasCorto(gestion.dias_sin_gestion)}`
                  : gestion
                    ? ` · ⏱ ${es.mercado.sinGestionNunca}`
                    : ""}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Insignia tono={TONO_CONTACTOS[contactos]}>
                  {es.mercado.contactosEstado[contactos]}
                </Insignia>
                {p.estado === "sin_asignar" ? (
                  <Insignia tono="ambar">{es.mercado.estados.sin_asignar}</Insignia>
                ) : (
                  <Insignia tono={p.estado === "convertido" ? "verde" : "azul"}>
                    {p.asignado?.nombre ?? es.mercado.estados[p.estado]}
                  </Insignia>
                )}
                <span className="ml-auto flex items-center gap-1.5">
                  <select
                    className="rounded-md border border-borde bg-superficie px-1.5 py-1 text-xs"
                    value={p.etapa ?? ""}
                    onChange={(e) =>
                      cambiarEtapa.mutate({ id: p.id, etapa: e.target.value || null })
                    }
                  >
                    <option value="">{es.mercado.etapaSinClasificar}</option>
                    {ETAPAS.map((etapa) => (
                      <option key={etapa} value={etapa}>
                        {ETIQUETAS_ETAPA_PROYECTO[etapa]}
                      </option>
                    ))}
                  </select>
                  {p.estado === "sin_asignar" && (
                    <Boton
                      variante="secundario"
                      onClick={() => {
                        setSeleccion(new Set([p.id]));
                        setAsignando(true);
                      }}
                    >
                      {es.mercado.asignar}
                    </Boton>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Escritorio: tabla del segmento */}
      <div className="mt-4 hidden overflow-x-auto rounded-xl border border-borde bg-superficie shadow-sm md:block">
        <table className="w-full text-sm">
          <thead className="bg-superficie-2 text-left text-xs uppercase text-tinta-suave">
            <tr>
              <th className="px-3 py-3">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todos"
                  checked={todosSeleccionados}
                  onChange={() =>
                    setSeleccion(
                      todosSeleccionados
                        ? new Set()
                        : new Set(asignables.map((p) => p.id)),
                    )
                  }
                />
              </th>
              <th className="px-3 py-3">{es.mercado.score}</th>
              <th className="px-3 py-3">{es.mercado.proyecto}</th>
              <th className="px-3 py-3">{es.mercado.etapaEditable}</th>
              <th className="px-3 py-3 text-right">{es.mercado.capexCorto}</th>
              <th className="px-3 py-3">
                {es.mercado.construccionCorta} / {es.mercado.pemCorta}
              </th>
              <th className="px-3 py-3">{es.mercado.contactosCuenta}</th>
              <th className="px-3 py-3">{es.mercado.ultimaGestion}</th>
              <th className="px-3 py-3">{es.mercado.estado}</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && <FilasEsqueleto columnas={10} />}
            {errorCarga && (
              <tr>
                <td colSpan={10} className="p-4">
                  <BannerError
                    mensaje={mensajeError(errorCarga)}
                    onReintentar={() => void refetch()}
                  />
                </td>
              </tr>
            )}
            {!isLoading && !errorCarga && filtrados.length === 0 && (
              <tr>
                <td colSpan={10} className="p-4">
                  <EstadoVacio titulo={es.mercado.sinProyectos} />
                </td>
              </tr>
            )}
            {filtrados.map((proyecto) => (
              <FilaRadar
                key={proyecto.id}
                proyecto={proyecto}
                gestion={proyecto.cuenta_id ? gestionPorCuenta.get(proyecto.cuenta_id) : undefined}
                seleccionado={seleccion.has(proyecto.id)}
                onAlternar={() => alternar(proyecto.id)}
                onAsignar={() => {
                  setSeleccion(new Set([proyecto.id]));
                  setAsignando(true);
                }}
                onVerScore={() => setDetalleScore(proyecto)}
                onCambiarEtapa={(etapa) =>
                  cambiarEtapa.mutate({ id: proyecto.id, etapa })
                }
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Importador */}
      <ImportadorMercado abierto={importando} onCerrar={() => setImportando(false)} />

      {/* Desglose del score */}
      <Dialogo
        abierto={detalleScore !== null}
        titulo={`${es.mercado.porQuePuntuo}: ${detalleScore?.score ?? "—"}/100`}
        onCerrar={() => setDetalleScore(null)}
      >
        {detalleScore?.score_detalle && (
          <DesgloseScore proyecto={detalleScore} />
        )}
      </Dialogo>

      {/* Asignación (flujo existente 0007) */}
      <Dialogo
        abierto={asignando}
        titulo={es.mercado.asignarTitulo}
        onCerrar={() => setAsignando(false)}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            asignar.mutate(new FormData(e.currentTarget));
          }}
        >
          <p className="text-sm text-tinta-suave">{es.mercado.asignarDescripcion}</p>
          <p className="text-sm font-medium">{es.mercado.seleccionados(seleccion.size)}</p>
          <Campo etiqueta={es.mercado.ejecutivo}>
            <Selector name="ejecutivo_id" defaultValue="" required autoFocus>
              <option value="" disabled>
                —
              </option>
              {ejecutivos?.map((ejecutivo) => (
                <option key={ejecutivo.id} value={ejecutivo.id}>
                  {ejecutivo.nombre}
                  {ejecutivo.rol === "gerente" ? ` (${es.roles.gerente})` : ""}
                </option>
              ))}
            </Selector>
          </Campo>

          <div className="grid gap-4 sm:grid-cols-3">
            <Campo etiqueta={es.mercado.prioridad}>
              <Selector name="prioridad" defaultValue="media">
                {(Object.keys(ETIQUETAS_PRIORIDAD) as PrioridadProyecto[]).map((p) => (
                  <option key={p} value={p}>
                    {ETIQUETAS_PRIORIDAD[p]}
                  </option>
                ))}
              </Selector>
            </Campo>
            <Campo etiqueta={`${es.mercado.fechaLimite} (${es.comunes.opcional})`}>
              <Entrada name="fecha_limite" type="date" />
            </Campo>
            <Campo etiqueta={es.mercado.diasAlerta}>
              <Entrada name="dias_alerta" type="number" min="1" max="60" defaultValue={5} />
            </Campo>
          </div>

          <Campo etiqueta={`${es.mercado.notaPrivada} (${es.comunes.opcional})`}>
            <AreaTexto name="nota" placeholder={es.mercado.notaPlaceholder} />
          </Campo>
          <p className="-mt-2 text-xs text-tinta-tenue">{es.mercado.notaPrivadaAyuda}</p>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Boton type="button" variante="secundario" onClick={() => setAsignando(false)}>
              {es.comunes.cancelar}
            </Boton>
            <Boton type="submit" disabled={asignar.isPending}>
              {asignar.isPending ? es.mercado.asignando : es.mercado.asignar}
            </Boton>
          </div>
        </form>
      </Dialogo>
    </div>
  );
}

function FilaRadar({
  proyecto,
  gestion,
  seleccionado,
  onAlternar,
  onAsignar,
  onVerScore,
  onCambiarEtapa,
}: {
  proyecto: ProyectoMercado;
  gestion?: FilaCritica;
  seleccionado: boolean;
  onAlternar: () => void;
  onAsignar: () => void;
  onVerScore: () => void;
  onCambiarEtapa: (etapa: string | null) => void;
}) {
  const sinAsignar = proyecto.estado === "sin_asignar";
  const contactos = contactosDelProyecto(proyecto);
  const caliente = enVentanaCaliente(proyecto.etapa);
  const score = proyecto.score ?? null;
  return (
    <tr className="border-t border-borde hover:bg-superficie-2">
      <td className="px-3 py-3">
        <input
          type="checkbox"
          aria-label={`Seleccionar ${proyecto.nombre}`}
          checked={seleccionado}
          disabled={!sinAsignar}
          onChange={onAlternar}
        />
      </td>
      <td className="px-3 py-3">
        <button
          onClick={onVerScore}
          title={es.mercado.porQuePuntuo}
          className={`rounded-md px-2 py-1 text-sm font-bold tabular-nums ${
            score != null && score >= 75
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : score != null && score >= 50
                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                : "bg-superficie-2 text-tinta-suave"
          }`}
        >
          {score ?? "—"}
        </button>
      </td>
      <td className="px-3 py-3">
        <p className="font-medium">
          {caliente && <span title="Ventana caliente">🔥 </span>}
          {proyecto.prioridad === "alta" && !proyecto.etapa && (
            <span title={ETIQUETAS_PRIORIDAD.alta}>⚠️ </span>
          )}
          {proyecto.nombre}
        </p>
        <p className="text-xs text-tinta-suave">
          {proyecto.empresa}
          {proyecto.region ? ` · ${proyecto.region}` : ""}
        </p>
      </td>
      <td className="px-3 py-3">
        <select
          className="rounded-md border border-borde bg-superficie px-2 py-1 text-xs"
          value={proyecto.etapa ?? ""}
          onChange={(e) => onCambiarEtapa(e.target.value || null)}
        >
          <option value="">{es.mercado.etapaSinClasificar}</option>
          {ETAPAS.map((etapa) => (
            <option key={etapa} value={etapa}>
              {ETIQUETAS_ETAPA_PROYECTO[etapa]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-3 text-right tabular-nums">
        {proyecto.capex_musd != null ? Number(proyecto.capex_musd).toLocaleString("es-CL") : "—"}
      </td>
      <td className="px-3 py-3 text-xs">
        <p>
          🏗 {proyecto.inicio_construccion
            ? formatearFechaCorta(proyecto.inicio_construccion)
            : "—"}
        </p>
        <p className="text-tinta-suave">
          ▶ {proyecto.puesta_en_marcha
            ? formatearFechaCorta(proyecto.puesta_en_marcha)
            : "—"}
        </p>
      </td>
      <td className="px-3 py-3">
        <Insignia tono={TONO_CONTACTOS[contactos]}>
          {es.mercado.contactosEstado[contactos]}
        </Insignia>
        {(contactos === "puerta" || contactos === "gestor") && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            🚪 {es.mercado.pedirDerivacion}
          </p>
        )}
      </td>
      <td className="px-3 py-3 text-xs">
        {gestion?.ultima_gestion ? (
          <span
            className={
              gestion.dias_sin_gestion >= 30 ? "font-semibold text-red-600 dark:text-red-400" : ""
            }
          >
            {es.mercado.diasCorto(gestion.dias_sin_gestion)}
          </span>
        ) : gestion ? (
          <span className="text-tinta-tenue">{es.mercado.sinGestionNunca}</span>
        ) : (
          <span className="text-tinta-tenue">—</span>
        )}
      </td>
      <td className="px-3 py-3">
        {sinAsignar ? (
          <Insignia tono="ambar">{es.mercado.estados.sin_asignar}</Insignia>
        ) : (
          <>
            <Insignia tono={proyecto.estado === "convertido" ? "verde" : "azul"}>
              {es.mercado.estados[proyecto.estado]}
            </Insignia>
            <p className="mt-1 text-xs text-tinta-suave">
              {proyecto.asignado?.nombre ?? "—"}
            </p>
          </>
        )}
      </td>
      <td className="px-3 py-3 text-right">
        {sinAsignar && (
          <Boton variante="secundario" onClick={onAsignar}>
            {es.mercado.asignar}
          </Boton>
        )}
      </td>
    </tr>
  );
}

function DesgloseScore({ proyecto }: { proyecto: ProyectoMercado }) {
  const d = proyecto.score_detalle!;
  const ETIQUETA: Record<string, string> = {
    etapa: es.mercado.factorEtapa,
    capex: es.mercado.factorCapex,
    sector: es.mercado.factorSector,
    contactabilidad: es.mercado.factorContactabilidad,
    cliente_historico: es.mercado.factorHistorial,
  };
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">
        {proyecto.nombre} <span className="text-tinta-suave">· {proyecto.empresa}</span>
      </p>
      <div className="space-y-2">
        {(Object.keys(ETIQUETA) as (keyof typeof d.factores)[]).map((k) => {
          const f = d.factores[k];
          if (!f) return null;
          return (
            <div key={k}>
              <div className="flex items-baseline justify-between text-sm">
                <span>{ETIQUETA[k]}</span>
                <span className="font-semibold tabular-nums">
                  {f.puntos}/{f.max}
                </span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-superficie-2">
                <div
                  className="h-full rounded-full bg-primario"
                  style={{ width: `${(100 * f.puntos) / f.max}%` }}
                />
              </div>
              <p className="mt-0.5 text-xs text-tinta-tenue">{f.detalle}</p>
            </div>
          );
        })}
      </div>
      <div className="rounded-lg border border-borde bg-superficie-2 p-3 text-sm">
        <p>
          <span className="font-medium">{es.mercado.pilarPrimario}:</span>{" "}
          {d.pilar_primario ?? "—"}
        </p>
        {d.pilares_secundarios?.length > 0 && (
          <p className="mt-1 text-xs text-tinta-suave">
            {es.mercado.pilaresSecundarios}: {d.pilares_secundarios.join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}
