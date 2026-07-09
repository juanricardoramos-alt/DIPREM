"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  enlaceCorreo,
  enlaceWhatsApp,
  es,
  formatearFechaCorta,
  formatearMonto,
  type EstadoProyectoMercado,
  type ProyectoMercado,
} from "@diprem/core";
import {
  asignarProyectosMercado,
  listarEjecutivosAsignables,
  listarProyectosMercado,
} from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { Boton, Campo, Dialogo, Entrada, Insignia, Selector } from "@/components/ui";
import { ImportadorMercado } from "@/components/mercado/importador";

const TONO_ESTADO: Record<EstadoProyectoMercado, "ambar" | "azul" | "verde"> = {
  sin_asignar: "ambar",
  asignado: "azul",
  convertido: "verde",
};

export function MercadoCliente() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();

  const [busqueda, setBusqueda] = useState("");
  const [filtroRubro, setFiltroRubro] = useState("");
  const [filtroRegion, setFiltroRegion] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<"" | EstadoProyectoMercado>("");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [importando, setImportando] = useState(false);
  const [asignando, setAsignando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: proyectos, isLoading, error: errorCarga } = useQuery({
    queryKey: ["mercado"],
    queryFn: () => listarProyectosMercado(supabase),
  });
  const { data: ejecutivos } = useQuery({
    queryKey: ["ejecutivos-asignables"],
    queryFn: () => listarEjecutivosAsignables(supabase),
    enabled: asignando,
  });

  // Filtros en el cliente: los dropdowns se arman con los valores reales
  const rubros = useMemo(
    () => [...new Set((proyectos ?? []).map((p) => p.rubro).filter(Boolean))].sort() as string[],
    [proyectos],
  );
  const regiones = useMemo(
    () => [...new Set((proyectos ?? []).map((p) => p.region).filter(Boolean))].sort() as string[],
    [proyectos],
  );

  const filtrados = useMemo(() => {
    const b = busqueda.trim().toLowerCase();
    return (proyectos ?? []).filter(
      (p) =>
        (!filtroRubro || p.rubro === filtroRubro) &&
        (!filtroRegion || p.region === filtroRegion) &&
        (!filtroEstado || p.estado === filtroEstado) &&
        (!b ||
          p.nombre.toLowerCase().includes(b) ||
          p.empresa.toLowerCase().includes(b) ||
          (p.contacto_nombre ?? "").toLowerCase().includes(b)),
    );
  }, [proyectos, busqueda, filtroRubro, filtroRegion, filtroEstado]);

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

  const asignar = useMutation({
    mutationFn: async (form: FormData) => {
      const ejecutivoId = form.get("ejecutivo_id") as string;
      if (!ejecutivoId) throw new Error("Selecciona un ejecutivo");
      return asignarProyectosMercado(supabase, [...seleccion], ejecutivoId);
    },
    onSuccess: (resultado) => {
      void queryClient.invalidateQueries({ queryKey: ["mercado"] });
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
      setMensaje(es.mercado.resultadoAsignacion(resultado.asignados, resultado.omitidos));
      setSeleccion(new Set());
      setAsignando(false);
      setError(null);
    },
    onError: (e: Error) => setError(e.message || es.comunes.errorGenerico),
  });

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{es.mercado.titulo}</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-slate-500">
            {es.mercado.descripcion}
          </p>
        </div>
        <Boton onClick={() => setImportando(true)}>📥 {es.mercado.importar}</Boton>
      </div>

      {mensaje && (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {mensaje}{" "}
          <button className="underline" onClick={() => setMensaje(null)}>
            ✕
          </button>
        </p>
      )}

      {/* Filtros */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Entrada
          placeholder={es.comunes.buscar}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-56 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={filtroRubro}
          onChange={(e) => setFiltroRubro(e.target.value)}
        >
          <option value="">{es.mercado.rubro}: {es.comunes.todos}</option>
          {rubros.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
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
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value as "" | EstadoProyectoMercado)}
        >
          <option value="">{es.mercado.estado}: {es.comunes.todos}</option>
          {(Object.keys(es.mercado.estados) as EstadoProyectoMercado[]).map((estado) => (
            <option key={estado} value={estado}>
              {es.mercado.estados[estado]}
            </option>
          ))}
        </select>

        {seleccion.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-slate-500">
              {es.mercado.seleccionados(seleccion.size)}
            </span>
            <Boton onClick={() => setAsignando(true)}>
              {es.mercado.asignarSeleccionados(seleccion.size)}
            </Boton>
          </div>
        )}
      </div>

      {/* Tabla de proyectos */}
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
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
              <th className="px-3 py-3">{es.mercado.proyecto}</th>
              <th className="px-3 py-3">{es.mercado.rubro}</th>
              <th className="px-3 py-3">{es.mercado.region}</th>
              <th className="px-3 py-3">{es.mercado.montoEstimado}</th>
              <th className="px-3 py-3">{es.mercado.contacto}</th>
              <th className="px-3 py-3">{es.mercado.fuente}</th>
              <th className="px-3 py-3">{es.mercado.estado}</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  {es.comunes.cargando}
                </td>
              </tr>
            )}
            {errorCarga && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-red-600">
                  {(errorCarga as Error).message}
                </td>
              </tr>
            )}
            {!isLoading && !errorCarga && filtrados.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  {es.mercado.sinProyectos}
                </td>
              </tr>
            )}
            {filtrados.map((proyecto) => (
              <FilaProyectoMercado
                key={proyecto.id}
                proyecto={proyecto}
                seleccionado={seleccion.has(proyecto.id)}
                onAlternar={() => alternar(proyecto.id)}
                onAsignar={() => {
                  setSeleccion(new Set([proyecto.id]));
                  setAsignando(true);
                }}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Importador */}
      <ImportadorMercado abierto={importando} onCerrar={() => setImportando(false)} />

      {/* Asignación */}
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
          <p className="text-sm text-slate-600">{es.mercado.asignarDescripcion}</p>
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

          {error && <p className="text-sm text-red-600">{error}</p>}

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

function FilaProyectoMercado({
  proyecto,
  seleccionado,
  onAlternar,
  onAsignar,
}: {
  proyecto: ProyectoMercado;
  seleccionado: boolean;
  onAlternar: () => void;
  onAsignar: () => void;
}) {
  const sinAsignar = proyecto.estado === "sin_asignar";
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50">
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
        <p className="font-medium">{proyecto.nombre}</p>
        <p className="text-xs text-slate-500">{proyecto.empresa}</p>
      </td>
      <td className="px-3 py-3">{proyecto.rubro ?? "—"}</td>
      <td className="px-3 py-3">{proyecto.region ?? "—"}</td>
      <td className="px-3 py-3">
        {proyecto.monto_estimado != null
          ? formatearMonto(proyecto.monto_estimado, proyecto.moneda)
          : "—"}
      </td>
      <td className="px-3 py-3">
        <p>{proyecto.contacto_nombre ?? "—"}</p>
        <p className="space-x-2 text-xs">
          {proyecto.contacto_telefono && (
            <a
              className="text-emerald-700 hover:underline"
              href={enlaceWhatsApp(proyecto.contacto_telefono)}
              target="_blank"
              rel="noreferrer"
            >
              💬 {proyecto.contacto_telefono}
            </a>
          )}
          {proyecto.contacto_email && (
            <a
              className="text-[var(--color-diprem)] hover:underline"
              href={enlaceCorreo(proyecto.contacto_email)}
            >
              ✉️ {proyecto.contacto_email}
            </a>
          )}
        </p>
      </td>
      <td className="px-3 py-3">{proyecto.fuente ?? "—"}</td>
      <td className="px-3 py-3">
        <Insignia tono={TONO_ESTADO[proyecto.estado]}>
          {es.mercado.estados[proyecto.estado]}
        </Insignia>
        {proyecto.estado !== "sin_asignar" && (
          <p className="mt-1 text-xs text-slate-500">
            {proyecto.asignado?.nombre ?? "—"}
            {proyecto.asignado_en ? ` · ${formatearFechaCorta(proyecto.asignado_en)}` : ""}
          </p>
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
