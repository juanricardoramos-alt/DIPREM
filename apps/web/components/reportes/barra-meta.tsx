"use client";

import {
  ETIQUETAS_TIPO_META,
  formatearMonto,
  porcentajeMeta,
  semaforoMeta,
  type MetaAvance,
} from "@diprem/core";

const COLOR = {
  verde: "bg-emerald-500",
  ambar: "bg-amber-400",
  rojo: "bg-red-500",
} as const;

export function BarraMeta({ meta }: { meta: MetaAvance }) {
  const pct = porcentajeMeta(meta);
  const color = COLOR[semaforoMeta(meta)];
  const esMonto = meta.tipo === "monto_adjudicado" && meta.moneda;
  const avanceTexto = esMonto
    ? formatearMonto(Number(meta.avance), meta.moneda!)
    : String(Number(meta.avance));
  const objetivoTexto = esMonto
    ? formatearMonto(Number(meta.objetivo), meta.moneda!)
    : String(Number(meta.objetivo));

  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{ETIQUETAS_TIPO_META[meta.tipo]}</span>
        <span className="text-tinta-suave">
          {avanceTexto} / {objetivoTexto} · <b>{pct}%</b>
        </span>
      </div>
      <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-superficie-2">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}
