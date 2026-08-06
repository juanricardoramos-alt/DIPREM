"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { mensajeError,
  ETIQUETAS_TIPO_ACTIVIDAD,
  diasSinActividad,
  es,
  generarCSV,
  periodoActual,
} from "@diprem/core";
import {
  listarComerciales,
  listarGestionReporte,
  listarPipelineDetalle,
} from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { Boton, Campo, Entrada, Selector } from "@/components/ui";

function descargar(nombre: string, contenido: string) {
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

/** Límites UTC [desde, hasta) de un periodo 'YYYY-MM' local. */
function limitesPeriodo(periodo: string): { desde: string; hasta: string } {
  const [anio, mes] = periodo.split("-").map(Number);
  const desde = new Date(anio ?? 2026, (mes ?? 1) - 1, 1);
  const hasta = new Date(anio ?? 2026, mes ?? 1, 1);
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

export function Exportes() {
  const supabase = useSupabase();
  const [periodo, setPeriodo] = useState(periodoActual());
  const [ejecutivoId, setEjecutivoId] = useState("");
  const [pais, setPais] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const { data: comerciales } = useQuery({
    queryKey: ["comerciales"],
    queryFn: () => listarComerciales(supabase),
    retry: false,
  });
  const paises = [...new Set((comerciales ?? []).map((c) => c.pais).filter(Boolean))] as string[];

  async function exportarGestion() {
    setOcupado("gestion");
    setAviso(null);
    try {
      const { desde, hasta } = limitesPeriodo(periodo);
      const filas = await listarGestionReporte(supabase, {
        desde,
        hasta,
        ...(ejecutivoId ? { propietario_id: ejecutivoId } : {}),
      });
      const filtradas = pais
        ? filas.filter((f) => {
            const dueno = comerciales?.find((c) => c.nombre === f.propietario?.nombre);
            return dueno?.pais === pais;
          })
        : filas;
      if (!filtradas.length) {
        setAviso(es.reportes.sinDatosExporte);
        return;
      }
      const csv = generarCSV(filtradas, [
        { titulo: "Fecha", valor: (f) => f.completada_en?.slice(0, 10) ?? "" },
        { titulo: "Ejecutivo", valor: (f) => f.propietario?.nombre ?? "" },
        { titulo: "Tipo", valor: (f) => ETIQUETAS_TIPO_ACTIVIDAD[f.tipo] },
        { titulo: "Asunto", valor: (f) => f.asunto },
        { titulo: "Cuenta", valor: (f) => f.cuenta?.razon_social ?? "" },
        { titulo: "Oportunidad", valor: (f) => f.oportunidad?.nombre ?? "" },
        { titulo: "Resultado", valor: (f) => f.resultado ?? "" },
        { titulo: "Próxima acción", valor: (f) => f.proxima_accion ?? "" },
      ]);
      descargar(`gestion-${periodo}.csv`, csv);
    } catch (e) {
      setAviso(mensajeError(e));
    } finally {
      setOcupado(null);
    }
  }

  async function exportarPipeline() {
    setOcupado("pipeline");
    setAviso(null);
    try {
      const filas = await listarPipelineDetalle(supabase);
      const filtradas = filas.filter(
        (f) =>
          (!ejecutivoId || f.propietario_id === ejecutivoId) &&
          (!pais || f.pais === pais),
      );
      if (!filtradas.length) {
        setAviso(es.reportes.sinDatosExporte);
        return;
      }
      const csv = generarCSV(filtradas, [
        { titulo: "Etapa", valor: (f) => f.etapa },
        { titulo: "Oportunidad", valor: (f) => f.nombre },
        { titulo: "Cuenta", valor: (f) => f.cuenta },
        { titulo: "País", valor: (f) => f.pais ?? "" },
        { titulo: "Equipo", valor: (f) => f.equipo ?? "" },
        { titulo: "Ejecutivo", valor: (f) => f.ejecutivo },
        { titulo: "Monto", valor: (f) => Number(f.monto) },
        { titulo: "Moneda", valor: (f) => f.moneda },
        { titulo: "Probabilidad %", valor: (f) => f.probabilidad ?? "" },
        { titulo: "Creada", valor: (f) => f.creado_en.slice(0, 10) },
        {
          titulo: "Días sin actividad",
          valor: (f) => (f.cerrada_en ? "" : diasSinActividad(f)),
        },
        {
          titulo: "Estado",
          valor: (f) =>
            f.es_ganada ? "Adjudicada" : f.es_perdida ? "Perdida" : "Abierta",
        },
      ]);
      descargar(`pipeline-${periodo}.csv`, csv);
    } catch (e) {
      setAviso(mensajeError(e));
    } finally {
      setOcupado(null);
    }
  }

  return (
    <section className="print:hidden">
      <h2 className="text-lg font-semibold">{es.reportes.exportar}</h2>
      <div className="mt-3 rounded-xl border border-borde bg-superficie shadow-sm p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Campo etiqueta={es.reportes.filtroPeriodo}>
            <Entrada
              type="month"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
            />
          </Campo>
          <Campo etiqueta={es.reportes.filtroEjecutivo}>
            <Selector value={ejecutivoId} onChange={(e) => setEjecutivoId(e.target.value)}>
              <option value="">{es.comunes.todos}</option>
              {comerciales?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta={es.reportes.filtroPais}>
            <Selector value={pais} onChange={(e) => setPais(e.target.value)}>
              <option value="">{es.comunes.todos}</option>
              {paises.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Selector>
          </Campo>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Boton variante="secundario" onClick={exportarGestion} disabled={ocupado !== null}>
            {ocupado === "gestion" ? es.reportes.generando : es.reportes.reporteGestion}
          </Boton>
          <Boton variante="secundario" onClick={exportarPipeline} disabled={ocupado !== null}>
            {ocupado === "pipeline" ? es.reportes.generando : es.reportes.reportePipeline}
          </Boton>
          <Boton variante="secundario" onClick={() => window.print()}>
            {es.reportes.imprimir}
          </Boton>
        </div>
        {aviso && <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">{aviso}</p>}
      </div>
    </section>
  );
}
