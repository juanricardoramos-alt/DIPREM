"use client";

/**
 * Primitivas UI livianas con Tailwind (evaluar shadcn/ui cuando crezca la
 * superficie). Mantener consistencia visual usando SIEMPRE estos componentes.
 */

import { useEffect } from "react";

export function Boton({
  variante = "primario",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: "primario" | "secundario" | "peligro" | "fantasma";
}) {
  const estilos = {
    primario:
      "bg-[var(--color-diprem)] text-white hover:bg-[var(--color-diprem-oscuro)]",
    secundario: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    peligro: "bg-red-600 text-white hover:bg-red-700",
    fantasma: "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
  }[variante];
  return (
    <button
      className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${estilos} ${className}`}
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
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {etiqueta}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export const claseInput =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[var(--color-diprem)] focus:outline-none disabled:bg-slate-100";

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`max-h-[90vh] w-full ${ancho} overflow-y-auto rounded-xl bg-white p-6 shadow-xl`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
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
    gris: "bg-slate-100 text-slate-700",
    azul: "bg-blue-100 text-blue-800",
    verde: "bg-emerald-100 text-emerald-800",
    rojo: "bg-red-100 text-red-700",
    ambar: "bg-amber-100 text-amber-800",
  }[tono];
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${estilos}`}>
      {children}
    </span>
  );
}
