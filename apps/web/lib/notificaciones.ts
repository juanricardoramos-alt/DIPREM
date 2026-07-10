import type { Notificacion } from "@diprem/core";

/** Ruta destino de una notificación según su entidad (null = sin link). */
export function rutaNotificacion(n: Notificacion): string | null {
  if (n.entidad === "lead" && n.entidad_id) return `/leads/${n.entidad_id}`;
  if (n.entidad === "cuenta" && n.entidad_id) return `/cuentas/${n.entidad_id}`;
  if (n.entidad === "reporte_semanal") return "/reportes";
  if (n.entidad === "proyecto_mercado") return "/mercado";
  return null;
}
