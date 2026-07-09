"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ETIQUETAS_MODALIDAD,
  es,
  formatearMonto,
  type EtapaEmbudo,
  type Moneda,
  type Oportunidad,
} from "@diprem/core";
import {
  listarEtapas,
  listarMotivosPerdida,
  listarOportunidades,
  moverOportunidad,
} from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import {
  AreaTexto,
  Boton,
  Campo,
  Dialogo,
  Selector,
} from "@/components/ui";
import { FormularioOportunidad } from "@/components/formulario-oportunidad";

/** Suma montos por moneda → "US$ 12.000 · $ 8.500.000" */
function totalesPorMoneda(oportunidades: Oportunidad[]): string {
  const sumas = new Map<Moneda, number>();
  for (const op of oportunidades) {
    sumas.set(op.moneda, (sumas.get(op.moneda) ?? 0) + Number(op.monto));
  }
  if (sumas.size === 0) return "—";
  return [...sumas.entries()]
    .map(([moneda, total]) => formatearMonto(total, moneda))
    .join(" · ");
}

export default function PaginaOportunidades() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();

  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState<Oportunidad | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [pendientePerdida, setPendientePerdida] = useState<{
    oportunidad: Oportunidad;
    etapa: EtapaEmbudo;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: etapas } = useQuery({
    queryKey: ["etapas"],
    queryFn: () => listarEtapas(supabase),
  });
  const { data: oportunidades, isLoading } = useQuery({
    queryKey: ["oportunidades", {}],
    queryFn: () => listarOportunidades(supabase),
  });
  const { data: motivos } = useQuery({
    queryKey: ["motivos_perdida"],
    queryFn: () => listarMotivosPerdida(supabase),
  });

  const mover = useMutation({
    mutationFn: (args: {
      id: string;
      etapaId: string;
      motivo?: { motivo_perdida_id: string; motivo_perdida_detalle?: string | null };
    }) => moverOportunidad(supabase, args.id, args.etapaId, args.motivo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["oportunidades"] });
      setPendientePerdida(null);
      setError(null);
    },
    onError: (e: Error) => setError(e.message || es.comunes.errorGenerico),
  });

  const etapasActivas = etapas?.filter((e) => e.activa) ?? [];

  function soltarEn(etapa: EtapaEmbudo, oportunidadId: string) {
    const op = oportunidades?.find((o) => o.id === oportunidadId);
    if (!op || op.etapa_id === etapa.id) return;
    if (etapa.es_perdida) {
      // La pérdida exige motivo (catálogo reportable)
      setPendientePerdida({ oportunidad: op, etapa });
      return;
    }
    mover.mutate({ id: op.id, etapaId: etapa.id });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{es.crm.embudo}</h1>
          {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
        </div>
        <Boton onClick={() => setFormAbierto(true)}>
          + {es.crm.nuevaOportunidad}
        </Boton>
      </div>

      {isLoading && <p className="mt-6 text-slate-400">{es.comunes.cargando}</p>}

      <div className="mt-6 flex gap-4 overflow-x-auto pb-4">
        {etapasActivas.map((etapa) => {
          const deEtapa =
            oportunidades?.filter((o) => o.etapa_id === etapa.id) ?? [];
          return (
            <div
              key={etapa.id}
              className={`w-72 shrink-0 rounded-xl border bg-slate-100/60 ${
                arrastrando ? "border-dashed border-[var(--color-diprem)]" : "border-slate-200"
              }`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/oportunidad");
                setArrastrando(null);
                if (id) soltarEn(etapa, id);
              }}
            >
              <div className="px-3 pt-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-700">
                    {etapa.nombre}
                    {etapa.es_ganada && " ✅"}
                    {etapa.es_perdida && " ❌"}
                  </h2>
                  <span className="rounded-full bg-white px-2 text-xs text-slate-500">
                    {deEtapa.length}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {es.crm.totalPipeline}: {totalesPorMoneda(deEtapa)}
                </p>
              </div>

              <div className="min-h-24 space-y-2 p-3">
                {deEtapa.map((op) => (
                  <div
                    key={op.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/oportunidad", op.id);
                      setArrastrando(op.id);
                    }}
                    onDragEnd={() => setArrastrando(null)}
                    className="cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:shadow"
                  >
                    <button
                      className="text-left text-sm font-medium hover:text-[var(--color-diprem)]"
                      onClick={() => setEditando(op)}
                    >
                      {op.nombre}
                    </button>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {op.cuenta?.razon_social ?? "—"}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">
                      {formatearMonto(op.monto, op.moneda)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {ETIQUETAS_MODALIDAD[op.modalidad_contrato]}
                      {op.probabilidad != null && ` · ${op.probabilidad}%`}
                      {op.propietario?.nombre && ` · ${op.propietario.nombre}`}
                    </p>
                    {/* Fallback accesible al drag&drop */}
                    <Selector
                      value=""
                      onChange={(e) => {
                        const etapaDestino = etapasActivas.find(
                          (x) => x.id === e.target.value,
                        );
                        if (etapaDestino) soltarEn(etapaDestino, op.id);
                      }}
                      className="mt-2 w-full rounded border border-slate-200 px-1 py-1 text-xs text-slate-500"
                    >
                      <option value="">{es.crm.moverA}</option>
                      {etapasActivas
                        .filter((x) => x.id !== op.etapa_id)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.nombre}
                          </option>
                        ))}
                    </Selector>
                  </div>
                ))}
                {deEtapa.length === 0 && (
                  <p className="py-4 text-center text-xs text-slate-400">
                    {es.crm.sinOportunidades}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Nueva / editar oportunidad */}
      <FormularioOportunidad
        abierto={formAbierto}
        onCerrar={() => setFormAbierto(false)}
      />
      {editando && (
        <FormularioOportunidad
          abierto
          oportunidad={editando}
          onCerrar={() => setEditando(null)}
        />
      )}

      {/* Motivo de pérdida obligatorio */}
      <Dialogo
        abierto={pendientePerdida !== null}
        titulo={`${es.crm.registrarPerdida} — ${pendientePerdida?.oportunidad.nombre ?? ""}`}
        onCerrar={() => setPendientePerdida(null)}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!pendientePerdida) return;
            const form = new FormData(e.currentTarget);
            mover.mutate({
              id: pendientePerdida.oportunidad.id,
              etapaId: pendientePerdida.etapa.id,
              motivo: {
                motivo_perdida_id: form.get("motivo_perdida_id") as string,
                motivo_perdida_detalle:
                  (form.get("motivo_perdida_detalle") as string) || null,
              },
            });
          }}
        >
          <Campo etiqueta={es.crm.motivoPerdida}>
            <Selector name="motivo_perdida_id" required autoFocus>
              <option value="">—</option>
              {motivos?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta={es.crm.detalleMotivoPerdida}>
            <AreaTexto name="motivo_perdida_detalle" />
          </Campo>
          <div className="flex justify-end gap-2 pt-2">
            <Boton
              type="button"
              variante="secundario"
              onClick={() => setPendientePerdida(null)}
            >
              {es.comunes.cancelar}
            </Boton>
            <Boton type="submit" variante="peligro" disabled={mover.isPending}>
              {mover.isPending ? es.comunes.guardando : es.crm.registrarPerdida}
            </Boton>
          </div>
        </form>
      </Dialogo>
    </div>
  );
}
