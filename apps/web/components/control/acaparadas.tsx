"use client";

/**
 * Lista de empresas reclamadas sin gestión, agrupada POR EJECUTIVO:
 * la pregunta del dueño es "quién acapara", no "qué empresa está botada".
 * - Grupos colapsables ordenados por cantidad (el peor primero); adentro,
 *   las empresas por CAPEX máximo descendente.
 * - Jerarquía: top 3 visibles + "ver N más"; la sección completa con altura
 *   máxima y scroll interno.
 * - Semáforo de días: 21+ rojo, 14-20 ámbar, bajo 14 gris.
 * - Acción masiva por grupo (checkboxes) además del botón individual.
 * Un solo componente responsive: escritorio y móvil comparten estilo.
 */

import { useState } from "react";
import Link from "next/link";
import { es, formatearMUSD } from "@diprem/core";
import type { FilaCritica } from "@diprem/api";
import { Boton, Insignia } from "@/components/ui";

const TOP_VISIBLES = 3;

interface Grupo {
  propietario_id: string;
  ejecutivo: string;
  filas: FilaCritica[];
}

function agrupar(acaparadas: FilaCritica[]): Grupo[] {
  const porEjecutivo = new Map<string, Grupo>();
  for (const fila of acaparadas) {
    const grupo = porEjecutivo.get(fila.propietario_id) ?? {
      propietario_id: fila.propietario_id,
      ejecutivo: fila.ejecutivo,
      filas: [],
    };
    grupo.filas.push(fila);
    porEjecutivo.set(fila.propietario_id, grupo);
  }
  for (const grupo of porEjecutivo.values()) {
    grupo.filas.sort(
      (a, b) =>
        (b.capex_max ?? -1) - (a.capex_max ?? -1) ||
        b.dias_sin_gestion - a.dias_sin_gestion,
    );
  }
  return [...porEjecutivo.values()].sort(
    (a, b) =>
      b.filas.length - a.filas.length ||
      (b.filas[0]?.capex_max ?? -1) - (a.filas[0]?.capex_max ?? -1),
  );
}

function tonoDias(dias: number): "rojo" | "ambar" | "gris" {
  if (dias >= 21) return "rojo";
  if (dias >= 14) return "ambar";
  return "gris";
}

export function ListaAcaparadas({
  acaparadas,
  liberando,
  onLiberar,
}: {
  acaparadas: FilaCritica[];
  liberando: boolean;
  /** 1 id = botón individual; varios = "Liberar seleccionadas" del grupo */
  onLiberar: (cuentaIds: string[]) => void;
}) {
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const grupos = agrupar(acaparadas);

  const alternar = (cuentaId: string) => {
    setSeleccion((previa) => {
      const nueva = new Set(previa);
      if (nueva.has(cuentaId)) nueva.delete(cuentaId);
      else nueva.add(cuentaId);
      return nueva;
    });
  };

  return (
    <div className="mt-3 max-h-[26rem] space-y-2 overflow-y-auto pr-1">
      {grupos.map((grupo) => (
        <GrupoAcaparadas
          key={grupo.propietario_id}
          grupo={grupo}
          seleccion={seleccion}
          liberando={liberando}
          onAlternar={alternar}
          onLiberarUna={(fila) => {
            if (window.confirm(es.control.confirmarLiberar(fila.razon_social))) {
              onLiberar([fila.cuenta_id]);
            }
          }}
          onLiberarSeleccionadas={(ids) => {
            if (window.confirm(es.control.confirmarLiberarVarias(ids.length, grupo.ejecutivo))) {
              onLiberar(ids);
              setSeleccion((previa) => {
                const nueva = new Set(previa);
                for (const id of ids) nueva.delete(id);
                return nueva;
              });
            }
          }}
        />
      ))}
    </div>
  );
}

function GrupoAcaparadas({
  grupo,
  seleccion,
  liberando,
  onAlternar,
  onLiberarUna,
  onLiberarSeleccionadas,
}: {
  grupo: Grupo;
  seleccion: Set<string>;
  liberando: boolean;
  onAlternar: (cuentaId: string) => void;
  onLiberarUna: (fila: FilaCritica) => void;
  onLiberarSeleccionadas: (cuentaIds: string[]) => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const visibles = expandido ? grupo.filas : grupo.filas.slice(0, TOP_VISIBLES);
  const ocultas = grupo.filas.length - TOP_VISIBLES;
  const seleccionadas = grupo.filas
    .map((f) => f.cuenta_id)
    .filter((id) => seleccion.has(id));

  return (
    <details
      open
      className="rounded-lg border border-red-200 bg-superficie dark:border-red-900"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 hover:bg-red-50/60 dark:hover:bg-red-950/20">
        <span className="flex min-w-0 items-center gap-2">
          <span className="font-semibold">{grupo.ejecutivo}</span>
          <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
            {grupo.filas.length}
          </span>
          <span className="hidden text-xs text-tinta-suave sm:inline">
            {es.control.acaparadasDe(grupo.filas.length)}
          </span>
        </span>
        {seleccionadas.length > 0 && (
          <Boton
            variante="peligro"
            disabled={liberando}
            onClick={(e) => {
              e.preventDefault();
              onLiberarSeleccionadas(seleccionadas);
            }}
          >
            {liberando
              ? es.control.liberando
              : es.control.liberarSeleccionadas(seleccionadas.length)}
          </Boton>
        )}
      </summary>

      <div className="space-y-1 px-2 pb-2">
        {visibles.map((fila) => (
          <div
            key={fila.cuenta_id}
            className="flex flex-wrap items-center gap-2 rounded-md border border-borde bg-superficie px-2.5 py-2"
          >
            <input
              type="checkbox"
              aria-label={es.control.seleccionarEmpresa}
              checked={seleccion.has(fila.cuenta_id)}
              onChange={() => onAlternar(fila.cuenta_id)}
              className="h-4 w-4 shrink-0 accent-red-600"
            />
            <div className="min-w-0 flex-1">
              <Link
                href={`/empresas/${fila.cuenta_id}`}
                className="font-medium hover:underline"
              >
                {fila.razon_social}
              </Link>
              {fila.n_proyectos > 0 && (
                <p className="text-xs text-tinta-suave">
                  {es.control.nProyectosCorto(fila.n_proyectos)}
                  {fila.capex_max != null &&
                    ` · ${es.control.capexMaxCorto(formatearMUSD(Number(fila.capex_max)))}`}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Insignia tono={tonoDias(fila.dias_sin_gestion)}>
                {es.reportes.diasSinActividad(fila.dias_sin_gestion)}
              </Insignia>
              <Boton
                variante="secundario"
                disabled={liberando}
                onClick={() => onLiberarUna(fila)}
              >
                {es.control.liberarAlPool}
              </Boton>
            </div>
          </div>
        ))}
        {ocultas > 0 && (
          <button
            onClick={() => setExpandido((v) => !v)}
            className="w-full rounded-md py-1 text-center text-xs font-medium text-primario hover:bg-superficie-2"
          >
            {expandido
              ? es.control.verMenosAcaparadas
              : es.control.verMasAcaparadas(ocultas)}
          </button>
        )}
      </div>
    </details>
  );
}
