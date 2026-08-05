"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { es, formatearMonto, type Moneda } from "@diprem/core";
import {
  listarControlAvanceDecisor,
  listarControlCriticas,
  listarControlEmbudo,
  listarControlHuerfanas,
  listarControlRespuesta,
  listarGestionesRecientes,
} from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { Esqueleto } from "@/components/ui";

/**
 * Reporte diario del dueño: móvil primero, legible sin zoom.
 * Una sola columna angosta, texto grande, cero tablas.
 */

const VENTANA_HORAS = 48;
const UMBRAL_ACAPARADOR = 14;

const EMOJI_TIPO: Record<string, string> = {
  llamada: "📞",
  whatsapp: "💬",
  email: "✉️",
  reunion: "🤝",
  visita_terreno: "⛑",
  tarea: "📋",
};

export function ReporteDiario() {
  const supabase = useSupabase();
  const corte = useMemo(() => Date.now() - VENTANA_HORAS * 3600_000, []);

  const { data: gestiones, isLoading } = useQuery({
    queryKey: ["diario_gestiones"],
    queryFn: () => listarGestionesRecientes(supabase, VENTANA_HORAS),
    retry: false,
  });
  const { data: avances } = useQuery({
    queryKey: ["control_avances"],
    queryFn: () => listarControlAvanceDecisor(supabase),
    retry: false,
  });
  const { data: embudo } = useQuery({
    queryKey: ["diario_embudo"],
    queryFn: () => listarControlEmbudo(supabase, new Date(corte).toISOString()),
    retry: false,
  });
  const { data: criticas } = useQuery({
    queryKey: ["control_criticas"],
    queryFn: () => listarControlCriticas(supabase),
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

  const avancesRecientes = useMemo(
    () => (avances ?? []).filter((a) => new Date(a.logrado_en).getTime() >= corte),
    [avances, corte],
  );
  const acaparadas = useMemo(
    () => (criticas ?? []).filter((c) => c.dias_sin_gestion >= UMBRAL_ACAPARADOR),
    [criticas],
  );
  const tasaPor = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const r of respuesta ?? [])
      m.set(r.usuario_id, r.tasa_pct != null ? Number(r.tasa_pct) : null);
    return m;
  }, [respuesta]);

  // Agrupar gestiones por ejecutivo, con conteo por canal
  const porEjecutivo = useMemo(() => {
    const m = new Map<
      string,
      {
        nombre: string;
        canales: Map<string, number>;
        conRespuesta: number;
        total: number;
        destacada: { asunto: string; cuenta: string | null; resultado: string | null } | null;
      }
    >();
    for (const g of gestiones ?? []) {
      const clave = g.propietario_id;
      if (!m.has(clave))
        m.set(clave, {
          nombre: g.propietario?.nombre ?? "—",
          canales: new Map(),
          conRespuesta: 0,
          total: 0,
          destacada: null,
        });
      const e = m.get(clave)!;
      e.total++;
      e.canales.set(g.tipo, (e.canales.get(g.tipo) ?? 0) + 1);
      if (g.con_respuesta) {
        e.conRespuesta++;
        if (!e.destacada)
          e.destacada = {
            asunto: g.asunto,
            cuenta: g.cuenta?.razon_social ?? null,
            resultado: g.resultado,
          };
      }
    }
    return [...m.values()].sort((a, b) => b.conRespuesta - a.conRespuesta || b.total - a.total);
  }, [gestiones]);

  const totalGestiones = gestiones?.length ?? 0;
  const totalRespuestas = (gestiones ?? []).filter((g) => g.con_respuesta).length;
  const fecha = new Date().toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="mx-auto max-w-md space-y-5 pb-10">
      <div>
        <Link
          href="/control"
          className="text-sm text-tinta-suave hover:underline print:hidden"
        >
          {es.control.diarioVolverControl}
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{es.control.diarioTitulo}</h1>
        <p className="text-base capitalize text-tinta-suave">{fecha}</p>
      </div>

      {/* El día en una línea */}
      <section className="rounded-2xl border border-borde bg-superficie p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
          {es.control.diarioResumen}
        </p>
        {isLoading ? (
          <Esqueleto className="mt-2 h-8 w-full" />
        ) : (
          <p className="mt-1 text-lg leading-snug">
            <span className="font-bold">{es.control.diarioGestiones(totalGestiones)}</span>{" "}
            · {es.control.diarioConRespuesta(totalRespuestas)} ·{" "}
            <span className="text-emerald-700 dark:text-emerald-300">
              {es.control.diarioDecisores(avancesRecientes.length)}
            </span>{" "}
            · {es.control.diarioEmbudo((embudo ?? []).filter((e) => e.avance).length)}
          </p>
        )}
      </section>

      {/* Alertas del dueño */}
      <section className="rounded-2xl border-2 border-red-300 bg-red-50/70 p-4 dark:border-red-900 dark:bg-red-950/30">
        <p className="text-base font-bold text-red-800 dark:text-red-300">
          {es.control.diarioAlertas}
        </p>
        {acaparadas.length === 0 && (huerfanas ?? []).length === 0 ? (
          <p className="mt-1 text-base">{es.control.diarioSinAlertas}</p>
        ) : (
          <div className="mt-2 space-y-2 text-base">
            {acaparadas.length > 0 && (
              <div>
                <p className="font-medium">
                  {es.control.diarioAcaparadas(acaparadas.length, UMBRAL_ACAPARADOR)}
                </p>
                {acaparadas
                  .sort((a, b) => (b.capex_max ?? -1) - (a.capex_max ?? -1))
                  .slice(0, 3)
                  .map((c) => (
                    <p key={c.cuenta_id} className="mt-1 text-sm leading-snug">
                      · <span className="font-medium">{c.razon_social}</span> —{" "}
                      {c.ejecutivo}, {c.dias_sin_gestion} días
                      {c.capex_max != null &&
                        ` · ${Number(c.capex_max).toLocaleString("es-CL")} MUSD`}
                    </p>
                  ))}
              </div>
            )}
            {(huerfanas ?? []).length > 0 && (
              <p className="font-medium">
                {es.control.diarioHuerfanas((huerfanas ?? []).length)}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Por ejecutivo */}
      <section>
        <h2 className="text-base font-bold">{es.control.diarioPorEjecutivo}</h2>
        {porEjecutivo.length === 0 && !isLoading && (
          <p className="mt-2 text-base text-tinta-suave">{es.control.diarioSinGestiones}</p>
        )}
        <div className="mt-2 space-y-2.5">
          {porEjecutivo.map((e) => (
            <div
              key={e.nombre}
              className="rounded-2xl border border-borde bg-superficie p-4 shadow-sm"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-base font-semibold">{e.nombre}</p>
                <p className="text-sm text-tinta-suave">
                  {e.conRespuesta}/{e.total} resp.
                </p>
              </div>
              <p className="mt-1 text-lg tracking-wide">
                {[...e.canales.entries()].map(([tipo, n]) => (
                  <span key={tipo} className="mr-3 whitespace-nowrap">
                    {EMOJI_TIPO[tipo] ?? "•"}
                    <span className="ml-0.5 text-sm tabular-nums text-tinta-suave">
                      ×{n}
                    </span>
                  </span>
                ))}
              </p>
              {e.destacada && (
                <p className="mt-1.5 text-sm leading-snug text-tinta-suave">
                  ✓ {e.destacada.asunto}
                  {e.destacada.cuenta ? ` — ${e.destacada.cuenta}` : ""}
                  {e.destacada.resultado ? `: ${e.destacada.resultado}` : ""}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Decisores conseguidos */}
      {avancesRecientes.length > 0 && (
        <section className="rounded-2xl border border-emerald-300 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <p className="text-base font-bold text-emerald-800 dark:text-emerald-300">
            {es.control.diarioDecisoresTitulo}
          </p>
          {avancesRecientes.map((a) => (
            <p key={a.cuenta_id} className="mt-1.5 text-base leading-snug">
              <span className="font-medium">{a.razon_social}</span>
              <span className="text-sm text-tinta-suave"> — {a.autor ?? a.ejecutivo}</span>
            </p>
          ))}
        </section>
      )}

      {/* Embudo en movimiento */}
      {(embudo ?? []).length > 0 && (
        <section className="rounded-2xl border border-borde bg-superficie p-4 shadow-sm">
          <p className="text-base font-bold">{es.control.diarioEmbudoTitulo}</p>
          {(embudo ?? []).slice(0, 6).map((m) => (
            <p key={`${m.oportunidad_id}-${m.movido_en}`} className="mt-1.5 text-sm leading-snug">
              {m.avance ? "↑" : "↓"} <span className="font-medium">{m.oportunidad}</span>
              <span className="text-tinta-suave">
                {" "}
                · {m.de_etapa} → {m.a_etapa} ·{" "}
                {formatearMonto(m.monto, m.moneda as Moneda)}
              </span>
            </p>
          ))}
        </section>
      )}

      {/* Tasa de respuesta 30d, al pie como referencia */}
      {(respuesta ?? []).length > 0 && (
        <p className="text-center text-xs text-tinta-tenue">
          {es.control.colTasaRespuesta} (30d):{" "}
          {(respuesta ?? [])
            .map((r) =>
              `${r.ejecutivo.split(" ")[0]} ${
                tasaPor.get(r.usuario_id) != null ? `${tasaPor.get(r.usuario_id)}%` : "s/r"
              }`,
            )
            .join(" · ")}
        </p>
      )}
    </div>
  );
}
