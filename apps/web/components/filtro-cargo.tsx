"use client";

/**
 * Filtro por perfil de contacto (bucket de cargo DIPREM) — REUTILIZABLE.
 * Hoy filtra la lista de Empresas; en la Fase B filtrará los contactos clave
 * del detalle de proyecto del Mercado (mandante + EPC + contratistas).
 * Nunca muestra ni necesita PII: trabaja solo con la columna `rol`.
 */

import { conteosPorBucket, es, type BucketContacto } from "@diprem/core";

const BUCKETS: readonly BucketContacto[] = [
  "decisor_tecnico",
  "gestor_compra",
  "puerta_entrada",
];

export function FiltroCargo({
  valor,
  onCambiar,
  conteos,
}: {
  valor: BucketContacto | "";
  onCambiar: (bucket: BucketContacto | "") => void;
  /** opcional: nº por bucket para mostrar junto al chip */
  conteos?: Partial<Record<BucketContacto, number>>;
}) {
  const opciones: { clave: BucketContacto | ""; etiqueta: string }[] = [
    { clave: "", etiqueta: es.filtroCargo.todos },
    ...BUCKETS.map((b) => ({ clave: b, etiqueta: es.filtroCargo[b] })),
  ];
  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label={es.filtroCargo.titulo}
      title={es.filtroCargo.nota}
    >
      {opciones.map((opcion) => {
        const activo = valor === opcion.clave;
        const n = opcion.clave ? conteos?.[opcion.clave] : undefined;
        return (
          <button
            key={opcion.clave || "todos"}
            onClick={() => onCambiar(opcion.clave)}
            aria-pressed={activo}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              activo
                ? "border-primario bg-primario-suave text-primario"
                : "border-borde bg-superficie text-tinta-suave hover:border-primario/40"
            }`}
          >
            {opcion.etiqueta}
            {n != null && ` · ${n}`}
          </button>
        );
      })}
    </div>
  );
}

/** Resumen compacto "✅ 2 · 🛒 1 · 🚪 3" de contactos por bucket (sin PII). */
export function ChipsContactos({
  roles,
}: {
  roles: (string | null | undefined)[];
}) {
  const conteos = conteosPorBucket(roles);
  const partes: string[] = [];
  if (conteos.decisor_tecnico) partes.push(`✅ ${conteos.decisor_tecnico}`);
  if (conteos.gestor_compra) partes.push(`🛒 ${conteos.gestor_compra}`);
  if (conteos.puerta_entrada) partes.push(`🚪 ${conteos.puerta_entrada}`);
  if (partes.length === 0) {
    return (
      <span className="text-xs text-tinta-tenue">
        {es.filtroCargo.sinContactosClave}
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap text-xs text-tinta-suave">
      {partes.join(" · ")}
    </span>
  );
}
