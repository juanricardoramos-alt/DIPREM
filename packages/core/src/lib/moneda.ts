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

/**
 * CAPEX en MUSD con formato ÚNICO en toda la app: entero con separador de
 * miles ("3.300", "544"); bajo 1 MUSD se muestra "<1" (los decimales no
 * aportan a esta escala y hacían bailar la lista).
 */
export function formatearMUSD(musd: number): string {
  if (musd > 0 && musd < 1) return "<1";
  return Math.round(musd).toLocaleString("es-CL");
}
