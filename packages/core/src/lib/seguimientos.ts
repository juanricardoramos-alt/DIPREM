import type { Oportunidad } from "../types/dominio";

/**
 * Reglas de seguimiento del ciclo largo DIPREM.
 * Umbral pendiente de confirmar con gerencia (docs/CONTEXTO-DIPREM.md §5);
 * el brief usa "7 días sin contactar" como ejemplo → default.
 */
export const DIAS_ALERTA_ATENCION = 3;
export const DIAS_ALERTA_CRITICO = 7;

export type NivelAlerta = "ok" | "atencion" | "critico";

/** Días transcurridos desde el último contacto (o desde la creación si nunca hubo). */
export function diasSinContacto(
  oportunidad: Pick<Oportunidad, "ultimo_contacto_en" | "creado_en">,
  ahora: Date = new Date(),
): number {
  const referencia = oportunidad.ultimo_contacto_en ?? oportunidad.creado_en;
  const ms = ahora.getTime() - new Date(referencia).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function nivelAlerta(dias: number): NivelAlerta {
  if (dias >= DIAS_ALERTA_CRITICO) return "critico";
  if (dias >= DIAS_ALERTA_ATENCION) return "atencion";
  return "ok";
}

/** Oportunidades abiertas ordenadas de más urgente a menos (para "Seguimientos"). */
export function ordenarPorUrgencia<T extends Pick<Oportunidad, "ultimo_contacto_en" | "creado_en" | "cerrada_en">>(
  oportunidades: T[],
  ahora: Date = new Date(),
): (T & { dias_sin_contacto: number; alerta: NivelAlerta })[] {
  return oportunidades
    .filter((o) => !o.cerrada_en)
    .map((o) => {
      const dias = diasSinContacto(o, ahora);
      return { ...o, dias_sin_contacto: dias, alerta: nivelAlerta(dias) };
    })
    .sort((a, b) => b.dias_sin_contacto - a.dias_sin_contacto);
}
