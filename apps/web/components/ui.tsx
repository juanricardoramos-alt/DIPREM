"use client";

/**
 * Primitivas UI del sistema de diseño DIPREM.
 * Solo tokens (bg-superficie, text-tinta, border-borde…) — nunca colores
 * sueltos — para que el modo claro y el oscuro queden completos siempre.
 * Mantener consistencia visual usando SIEMPRE estos componentes.
 */

import { useEffect } from "react";
import { AlertTriangle, Inbox, RefreshCw, X } from "lucide-react";

export function Boton({
  variante = "primario",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: "primario" | "secundario" | "peligro" | "fantasma";
}) {
  const estilos = {
    primario:
      "bg-primario text-white shadow-md shadow-primario/30 hover:bg-primario-oscuro active:bg-primario-oscuro",
    secundario:
      "border border-borde bg-superficie text-tinta-suave shadow-sm hover:border-primario/40 hover:bg-primario-suave/60 hover:text-primario active:bg-primario-suave",
    peligro:
      "bg-red-600 text-white shadow-md shadow-red-600/25 hover:bg-red-700 active:bg-red-700",
    fantasma: "text-tinta-suave hover:bg-superficie-2 hover:text-tinta active:bg-superficie-2",
  }[variante];
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primario disabled:pointer-events-none disabled:opacity-50 ${estilos} ${className}`}
      {...props}
    />
  );
}

export function Campo({
  etiqueta,
  error,
  children,
}: {
  etiqueta: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-tinta-suave">
        {etiqueta}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{error}</span>}
    </label>
  );
}

export const claseInput =
  "w-full rounded-lg border border-borde bg-superficie px-3 py-2 text-sm text-tinta placeholder:text-tinta-tenue transition-colors focus:border-primario focus:outline-none disabled:bg-superficie-2 disabled:text-tinta-suave";

export function Entrada(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={claseInput} {...props} />;
}

export function Selector(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={claseInput} {...props} />;
}

export function AreaTexto(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={claseInput} rows={3} {...props} />;
}

export function Dialogo({
  abierto,
  titulo,
  onCerrar,
  children,
  ancho = "max-w-lg",
}: {
  abierto: boolean;
  titulo: string;
  onCerrar: () => void;
  children: React.ReactNode;
  ancho?: string;
}) {
  useEffect(() => {
    if (!abierto) return;
    const manejar = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", manejar);
    return () => window.removeEventListener("keydown", manejar);
  }, [abierto, onCerrar]);

  if (!abierto) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`max-h-[90vh] w-full ${ancho} overflow-y-auto rounded-2xl border border-borde bg-superficie p-6 shadow-2xl`}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-tinta">{titulo}</h2>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-lg p-1 text-tinta-tenue transition-colors hover:bg-superficie-2 hover:text-tinta"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Insignia({
  children,
  tono = "gris",
}: {
  children: React.ReactNode;
  tono?: "gris" | "azul" | "verde" | "rojo" | "ambar";
}) {
  const estilos = {
    gris: "bg-superficie-2 text-tinta-suave",
    azul: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300",
    verde:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
    rojo: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
    ambar: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  }[tono];
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${estilos}`}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Estados de carga, vacío y error (usar SIEMPRE estos, no texto suelto)
// ---------------------------------------------------------------------------

/** Bloque gris animado; componer para armar placeholders. */
export function Esqueleto({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-superficie-2 ${className}`} />;
}

/** Filas fantasma para tablas mientras carga. */
export function FilasEsqueleto({ columnas, filas = 4 }: { columnas: number; filas?: number }) {
  return (
    <>
      {Array.from({ length: filas }, (_, i) => (
        <tr key={i} className="border-t border-borde">
          {Array.from({ length: columnas }, (_, j) => (
            <td key={j} className="px-4 py-3">
              <Esqueleto className="h-4 w-full max-w-32" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Tarjetas fantasma para listas mientras carga. */
export function TarjetasEsqueleto({ cantidad = 3 }: { cantidad?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: cantidad }, (_, i) => (
        <div key={i} className="rounded-xl border border-borde bg-superficie p-4">
          <Esqueleto className="h-4 w-1/3" />
          <Esqueleto className="mt-2 h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

/** Estado vacío con ícono y acción sugerida. */
export function EstadoVacio({
  titulo,
  descripcion,
  accion,
  icono,
}: {
  titulo: string;
  descripcion?: string;
  accion?: React.ReactNode;
  icono?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-borde px-6 py-10 text-center">
      <span className="text-tinta-tenue">{icono ?? <Inbox className="h-8 w-8" />}</span>
      <p className="text-sm font-medium text-tinta-suave">{titulo}</p>
      {descripcion && <p className="max-w-sm text-xs text-tinta-tenue">{descripcion}</p>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  );
}

/** Banner de error en español claro, con reintento opcional. */
export function BannerError({
  mensaje,
  onReintentar,
}: {
  mensaje: string;
  onReintentar?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
      <span className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {mensaje}
      </span>
      {onReintentar && (
        <button
          onClick={onReintentar}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-2.5 py-1 text-xs font-medium hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-950"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Reintentar
        </button>
      )}
    </div>
  );
}

/** Avatar con iniciales (usuarios sin foto). */
export function Avatar({
  nombre,
  tamano = "md",
}: {
  nombre: string;
  tamano?: "sm" | "md";
}) {
  const iniciales = nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const clase = tamano === "sm" ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-sm";
  return (
    <span
      className={`inline-flex ${clase} shrink-0 items-center justify-center rounded-full bg-primario-suave font-semibold text-primario`}
    >
      {iniciales || "?"}
    </span>
  );
}
