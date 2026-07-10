"use client";

import {
  ETIQUETAS_TIPO_ACTIVIDAD,
  ICONOS_TIPO_ACTIVIDAD,
  type TipoActividad,
} from "@diprem/core";

export const LISTA_ACCIONES_RAPIDAS: { tipo: TipoActividad; rapido: boolean }[] = [
  { tipo: "llamada", rapido: true },
  { tipo: "whatsapp", rapido: true },
  { tipo: "reunion", rapido: false },
  { tipo: "visita_terreno", rapido: false },
  { tipo: "tarea", rapido: false },
];

/** Identidad de color por tipo de gestión (móvil primero: registro sin fricción). */
const ESTILO_TIPO: Record<TipoActividad, string> = {
  llamada:
    "border-sky-200 bg-sky-50 text-sky-800 active:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-200 dark:active:bg-sky-950",
  whatsapp:
    "border-emerald-200 bg-emerald-50 text-emerald-800 active:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200 dark:active:bg-emerald-950",
  reunion:
    "border-violet-200 bg-violet-50 text-violet-800 active:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-200 dark:active:bg-violet-950",
  visita_terreno:
    "border-amber-300 bg-amber-50 text-amber-900 active:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200 dark:active:bg-amber-950",
  email:
    "border-blue-200 bg-blue-50 text-blue-800 active:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200 dark:active:bg-blue-950",
  tarea:
    "border-primario/30 bg-primario-suave text-primario active:bg-primario/20",
};

function etiquetaAccion(tipo: TipoActividad, rapido: boolean): string {
  // WhatsApp conserva su mayúscula de marca
  const nombre =
    tipo === "whatsapp"
      ? ETIQUETAS_TIPO_ACTIVIDAD[tipo]
      : ETIQUETAS_TIPO_ACTIVIDAD[tipo].toLowerCase();
  if (rapido) return `Registrar ${nombre}`;
  if (tipo === "tarea") return "Nueva tarea";
  return `Agendar ${nombre}`;
}

/**
 * Botones de registro rápido de Mi Día, con color e identidad por tipo.
 * En móvil: grilla de 2 columnas a ancho completo; en PC: fila.
 */
export function AccionesRapidas({
  onSeleccion,
}: {
  onSeleccion: (tipo: TipoActividad, rapido: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {LISTA_ACCIONES_RAPIDAS.map(({ tipo, rapido }) => (
        <button
          key={tipo}
          onClick={() => onSeleccion(tipo, rapido)}
          className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium shadow-sm transition-all active:scale-[0.97] last:col-span-2 sm:last:col-auto ${ESTILO_TIPO[tipo]}`}
        >
          <span className="text-base">{ICONOS_TIPO_ACTIVIDAD[tipo]}</span>
          {etiquetaAccion(tipo, rapido)}
        </button>
      ))}
    </div>
  );
}
