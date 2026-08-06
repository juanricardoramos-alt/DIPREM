import { es } from "../strings/es";

/**
 * Traduce errores técnicos (PostgREST/red, en inglés) a español claro.
 * Los mensajes que ya vienen en español (los lanzan nuestras funciones de BD,
 * ej. topes de cuota del perímetro) pasan tal cual — solo se traduce lo que
 * calza con patrones técnicos conocidos.
 */
const PATRONES: [RegExp, () => string][] = [
  [/row-level security|permission denied|insufficient_privilege|not authorized/i, () => es.errores.sinPermiso],
  [/duplicate key|unique constraint|already exists/i, () => es.errores.duplicado],
  [/failed to fetch|networkerror|network request failed|fetch failed|load failed|timed? ?out/i, () => es.errores.sinConexion],
  [/jwt|token.*(expired|invalid)|unauthorized/i, () => es.errores.sesionExpirada],
  [/foreign key|violates .*constraint|invalid input syntax|malformed|unexpected token|parse error/i, () => es.comunes.errorGenerico],
];

export function mensajeError(error: unknown): string {
  const crudo =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!crudo.trim()) return es.comunes.errorGenerico;
  for (const [patron, mensaje] of PATRONES) {
    if (patron.test(crudo)) return mensaje();
  }
  return crudo;
}
