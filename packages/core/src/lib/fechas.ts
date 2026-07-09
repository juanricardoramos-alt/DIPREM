/** Utilidades de fecha (zona horaria LOCAL del usuario — clave multi-país). */

/** Límites [inicio, fin) del día local, en ISO UTC, para consultas de agenda. */
export function limitesDiaLocal(referencia: Date = new Date()): {
  inicio: string;
  fin: string;
} {
  const inicio = new Date(referencia);
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 1);
  return { inicio: inicio.toISOString(), fin: fin.toISOString() };
}

export function formatearHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatearFechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es", {
    day: "2-digit",
    month: "short",
  });
}

export function formatearFechaLarga(fecha: Date = new Date()): string {
  return fecha.toLocaleDateString("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Date local → valor para <input type="datetime-local"> */
export function aDatetimeLocal(fecha: Date = new Date()): string {
  const ajustada = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60_000);
  return ajustada.toISOString().slice(0, 16);
}
