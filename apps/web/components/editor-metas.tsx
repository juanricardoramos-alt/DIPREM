"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MONEDAS,
  TIPOS_META,
  ETIQUETAS_TIPO_META,
  es,
  periodoActual,
  type Moneda,
  type TipoMeta,
} from "@diprem/core";
import {
  eliminarMeta,
  guardarMeta,
  listarAvanceMetas,
  listarComerciales,
} from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { Boton, Entrada, Selector } from "@/components/ui";

type Valores = Record<string, string>; // clave: `${usuarioId}:${tipo}`

export function EditorMetas() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const [periodo, setPeriodo] = useState(periodoActual());
  const [valores, setValores] = useState<Valores>({});
  const [monedas, setMonedas] = useState<Record<string, Moneda>>({});
  const [guardado, setGuardado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: comerciales, error: errorVistas } = useQuery({
    queryKey: ["comerciales"],
    queryFn: () => listarComerciales(supabase),
    retry: false,
  });
  const { data: metas } = useQuery({
    queryKey: ["avance_metas", periodo],
    queryFn: () => listarAvanceMetas(supabase, { periodo }),
    retry: false,
  });

  // Precargar inputs con las metas existentes del periodo
  useEffect(() => {
    if (!metas) return;
    const v: Valores = {};
    const m: Record<string, Moneda> = {};
    for (const meta of metas) {
      v[`${meta.usuario_id}:${meta.tipo}`] = String(Number(meta.objetivo));
      if (meta.tipo === "monto_adjudicado" && meta.moneda) m[meta.usuario_id] = meta.moneda;
    }
    setValores(v);
    setMonedas(m);
  }, [metas]);

  const guardarFila = useMutation({
    mutationFn: async (usuarioId: string) => {
      for (const tipo of TIPOS_META) {
        const clave = `${usuarioId}:${tipo}`;
        const texto = (valores[clave] ?? "").trim();
        const existia = metas?.some(
          (m) => m.usuario_id === usuarioId && m.tipo === tipo,
        );
        if (texto === "" || Number(texto) <= 0) {
          if (existia) await eliminarMeta(supabase, usuarioId, periodo, tipo);
          continue;
        }
        await guardarMeta(supabase, {
          usuario_id: usuarioId,
          periodo,
          tipo: tipo as TipoMeta,
          objetivo: Number(texto),
          moneda: tipo === "monto_adjudicado" ? (monedas[usuarioId] ?? "USD") : null,
        });
      }
      return usuarioId;
    },
    onSuccess: (usuarioId) => {
      void queryClient.invalidateQueries({ queryKey: ["avance_metas"] });
      setGuardado(usuarioId);
      setError(null);
      setTimeout(() => setGuardado(null), 2000);
    },
    onError: (e: Error) => setError(e.message),
  });

  if (errorVistas) {
    return (
      <p className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 text-sm text-amber-800 dark:text-amber-300">
        ⚠️ {errorVistas.message}
      </p>
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{es.metasAdmin.titulo}</h2>
          <p className="mt-1 max-w-2xl text-sm text-tinta-suave">
            {es.metasAdmin.descripcion}
          </p>
        </div>
        <Entrada
          type="month"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          className="w-44 rounded-md border border-borde px-3 py-2 text-sm"
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-borde bg-superficie">
        <table className="w-full text-sm">
          <thead className="bg-superficie-2 text-left text-xs uppercase text-tinta-suave">
            <tr>
              <th className="px-4 py-3">{es.reportes.colEjecutivo}</th>
              <th className="px-4 py-3">{ETIQUETAS_TIPO_META.monto_adjudicado}</th>
              <th className="px-4 py-3">{ETIQUETAS_TIPO_META.propuestas_enviadas}</th>
              <th className="px-4 py-3">{ETIQUETAS_TIPO_META.actividades}</th>
              <th className="px-4 py-3">{ETIQUETAS_TIPO_META.oportunidades_nuevas}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(comerciales?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-tinta-tenue">
                  {es.metasAdmin.sinComerciales}
                </td>
              </tr>
            )}
            {comerciales?.map((c) => (
              <tr key={c.id} className="border-t border-borde">
                <td className="px-4 py-3">
                  <p className="font-medium">{c.nombre}</p>
                  <p className="text-xs text-tinta-tenue">
                    {c.equipo ?? "—"}
                    {c.pais ? ` · ${c.pais}` : ""}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <Entrada
                      type="number"
                      min="0"
                      className="w-28 rounded-md border border-borde px-2 py-1.5 text-sm"
                      value={valores[`${c.id}:monto_adjudicado`] ?? ""}
                      onChange={(e) =>
                        setValores((v) => ({
                          ...v,
                          [`${c.id}:monto_adjudicado`]: e.target.value,
                        }))
                      }
                    />
                    <Selector
                      className="w-20 rounded-md border border-borde px-1 py-1.5 text-sm"
                      value={monedas[c.id] ?? "USD"}
                      onChange={(e) =>
                        setMonedas((m) => ({ ...m, [c.id]: e.target.value as Moneda }))
                      }
                    >
                      {MONEDAS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </Selector>
                  </div>
                </td>
                {(["propuestas_enviadas", "actividades", "oportunidades_nuevas"] as const).map(
                  (tipo) => (
                    <td key={tipo} className="px-4 py-3">
                      <Entrada
                        type="number"
                        min="0"
                        className="w-24 rounded-md border border-borde px-2 py-1.5 text-sm"
                        value={valores[`${c.id}:${tipo}`] ?? ""}
                        onChange={(e) =>
                          setValores((v) => ({ ...v, [`${c.id}:${tipo}`]: e.target.value }))
                        }
                      />
                    </td>
                  ),
                )}
                <td className="px-4 py-3 text-right">
                  <Boton
                    variante="secundario"
                    disabled={guardarFila.isPending}
                    onClick={() => guardarFila.mutate(c.id)}
                  >
                    {guardado === c.id ? es.metasAdmin.guardado : es.comunes.guardar}
                  </Boton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
