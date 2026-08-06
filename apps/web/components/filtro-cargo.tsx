"use client";

/**
 * Filtro por perfil de contacto (bucket de cargo DIPREM) — REUTILIZABLE.
 * Hoy filtra la lista de Empresas; en la Fase B filtrará los contactos clave
 * del detalle de proyecto del Mercado (mandante + EPC + contratistas).
 * Nunca muestra ni necesita PII: trabaja solo con la columna `rol`.
 */

import { bucketDeRol, conteosPorBucket, es, type BucketContacto } from "@diprem/core";
import { Entrada } from "@/components/ui";

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

/** Minúsculas y sin tildes, para que "María" calce con "maria". */
function normalizarBusqueda(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Filtra una lista de contactos por bucket + texto libre (nombre o cargo).
 * Misma lógica en la ficha de empresa y la ficha de proyecto.
 */
export function filtrarContactos<
  T extends { nombre: string; cargo?: string | null; rol?: string | null },
>(contactos: T[], bucket: BucketContacto | "", busqueda: string): T[] {
  const texto = normalizarBusqueda(busqueda.trim());
  return contactos.filter((contacto) => {
    if (bucket && bucketDeRol(contacto.rol) !== bucket) return false;
    if (!texto) return true;
    return (
      normalizarBusqueda(contacto.nombre).includes(texto) ||
      (contacto.cargo ? normalizarBusqueda(contacto.cargo).includes(texto) : false)
    );
  });
}

/**
 * Barra completa de filtro de contactos: chips por cargo + búsqueda por texto.
 * EL componente compartido — ficha de empresa y ficha de proyecto usan este
 * mismo bloque, no implementaciones propias.
 */
export function BarraFiltroContactos({
  bucket,
  onBucket,
  busqueda,
  onBusqueda,
  conteos,
}: {
  bucket: BucketContacto | "";
  onBucket: (bucket: BucketContacto | "") => void;
  busqueda: string;
  onBusqueda: (texto: string) => void;
  conteos?: Partial<Record<BucketContacto, number>>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FiltroCargo valor={bucket} onCambiar={onBucket} conteos={conteos} />
      <Entrada
        placeholder={es.crm.buscarContactoPlaceholder}
        value={busqueda}
        onChange={(e) => onBusqueda(e.target.value)}
        className="w-full rounded-md border border-borde bg-superficie px-3 py-1.5 text-sm sm:w-56"
      />
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
