import type { Moneda } from "../types/dominio";

/** Monedas soportadas — mismas del enum `moneda` de la BD. */
export const MONEDAS: readonly Moneda[] = [
  "USD", "CLP", "ARS", "COP", "BRL", "MXN", "PEN",
  "CAD", "UYU", "BOB", "GTQ", "DOP", "EUR",
] as const;

/** Formatea un monto en su moneda con convención regional es-CL/es-AR-friendly. */
export function formatearMonto(monto: number, moneda: Moneda): string {
  return new Intl.NumberFormat("es", {
    style: "currency",
    currency: moneda,
    maximumFractionDigits: moneda === "CLP" ? 0 : 2,
  }).format(monto);
}
