import type { Actividad, TipoActividad } from "../types/dominio";
import type { PipelineFila } from "./metas";
import { inicioSemana } from "./control";

/**
 * Reportes del dueño: semana comercial, oportunidades que avanzaron de etapa
 * (leídas desde la auditoría — trazabilidad DIPREM) y embudo de conversión
 * de los proyectos del mercado.
 */

// ---------------------------------------------------------------------------
// Semana comercial (lunes a domingo)
// ---------------------------------------------------------------------------
export interface RangoSemana {
  inicio: Date;
  fin: Date; // exclusivo
}

/** Semana completa anterior; offset 1 = una semana más atrás, etc. */
export function semanaAnterior(offset = 0, ahora: Date = new Date()): RangoSemana {
  const fin = inicioSemana(ahora);
  fin.setDate(fin.getDate() - 7 * offset);
  const inicio = new Date(fin);
  inicio.setDate(inicio.getDate() - 7);
  return { inicio, fin };
}

export function etiquetaSemana({ inicio, fin }: RangoSemana): string {
  const ultimoDia = new Date(fin.getTime() - 86_400_000);
  const opciones: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `Semana del ${inicio.toLocaleDateString("es", opciones)} al ${ultimoDia.toLocaleDateString(
    "es",
    { ...opciones, year: "numeric" },
  )}`;
}

// ---------------------------------------------------------------------------
// Oportunidades que avanzaron de etapa (desde la tabla de auditoría)
// ---------------------------------------------------------------------------
export interface RegistroAuditoria {
  creado_en: string;
  usuario_id: string | null;
  cambios: {
    antes?: Record<string, unknown>;
    despues?: Record<string, unknown>;
  } | null;
}

export interface CambioEtapa {
  oportunidad_id: string;
  nombre: string;
  propietario_id: string | null;
  etapa_antes_id: string;
  etapa_despues_id: string;
  creado_en: string;
}

/** Filtra los UPDATE de oportunidades cuya etapa cambió. */
export function extraerCambiosEtapa(registros: RegistroAuditoria[]): CambioEtapa[] {
  const cambios: CambioEtapa[] = [];
  for (const registro of registros) {
    const antes = registro.cambios?.antes;
    const despues = registro.cambios?.despues;
    if (!antes || !despues) continue;
    const etapaAntes = antes.etapa_id as string | undefined;
    const etapaDespues = despues.etapa_id as string | undefined;
    if (!etapaAntes || !etapaDespues || etapaAntes === etapaDespues) continue;
    cambios.push({
      oportunidad_id: (despues.id as string) ?? "",
      nombre: (despues.nombre as string) ?? "—",
      propietario_id: (despues.propietario_id as string) ?? null,
      etapa_antes_id: etapaAntes,
      etapa_despues_id: etapaDespues,
      creado_en: registro.creado_en,
    });
  }
  return cambios;
}

// ---------------------------------------------------------------------------
// Resumen semanal por ejecutivo
// ---------------------------------------------------------------------------
export interface ResumenSemanalEjecutivo {
  propietario_id: string;
  ejecutivo: string;
  totalGestiones: number;
  porTipo: Partial<Record<TipoActividad, number>>;
  proyectosTrabajados: number; // leads distintos con gestión en la semana
  oportunidadesAvanzadas: number;
  adjudicadas: number;
}

export function resumenSemanal(
  gestiones: Pick<Actividad, "tipo" | "propietario_id" | "lead_id" | "propietario">[],
  cambiosEtapa: CambioEtapa[],
  adjudicadasSemana: Pick<PipelineFila, "propietario_id" | "ejecutivo">[],
): ResumenSemanalEjecutivo[] {
  const porEjecutivo = new Map<string, ResumenSemanalEjecutivo>();
  const leadsPorEjecutivo = new Map<string, Set<string>>();

  const asegurar = (id: string, nombre: string): ResumenSemanalEjecutivo => {
    let resumen = porEjecutivo.get(id);
    if (!resumen) {
      resumen = {
        propietario_id: id,
        ejecutivo: nombre,
        totalGestiones: 0,
        porTipo: {},
        proyectosTrabajados: 0,
        oportunidadesAvanzadas: 0,
        adjudicadas: 0,
      };
      porEjecutivo.set(id, resumen);
    } else if (resumen.ejecutivo === "—" && nombre !== "—") {
      resumen.ejecutivo = nombre;
    }
    return resumen;
  };

  for (const gestion of gestiones) {
    const resumen = asegurar(gestion.propietario_id, gestion.propietario?.nombre ?? "—");
    resumen.totalGestiones += 1;
    resumen.porTipo[gestion.tipo] = (resumen.porTipo[gestion.tipo] ?? 0) + 1;
    if (gestion.lead_id) {
      const set = leadsPorEjecutivo.get(gestion.propietario_id) ?? new Set<string>();
      set.add(gestion.lead_id);
      leadsPorEjecutivo.set(gestion.propietario_id, set);
    }
  }
  for (const [id, leads] of leadsPorEjecutivo) {
    asegurar(id, "—").proyectosTrabajados = leads.size;
  }
  for (const cambio of cambiosEtapa) {
    if (!cambio.propietario_id) continue;
    asegurar(cambio.propietario_id, "—").oportunidadesAvanzadas += 1;
  }
  for (const fila of adjudicadasSemana) {
    asegurar(fila.propietario_id, fila.ejecutivo).adjudicadas += 1;
  }

  return [...porEjecutivo.values()].sort((a, b) => b.totalGestiones - a.totalGestiones);
}

// ---------------------------------------------------------------------------
// Embudo de conversión de proyectos del mercado
// ---------------------------------------------------------------------------

/** Fila de v_conversion_proyectos. */
export interface FilaConversion {
  id: string;
  proyecto: string;
  empresa: string;
  rubro: string | null;
  region: string | null;
  estado: "asignado" | "convertido";
  asignado_a: string | null;
  ejecutivo: string | null;
  asignado_en: string;
  contactado_en: string | null;
  oportunidad_id: string | null;
  propuesta_enviada_en: string | null;
  adjudicada_en: string | null;
}

export interface EmbudoConversion {
  asignados: number;
  contactados: number;
  convertidos: number;
  conPropuesta: number;
  adjudicados: number;
}

export function embudoConversion(filas: FilaConversion[]): EmbudoConversion {
  return {
    asignados: filas.length,
    contactados: filas.filter((f) => f.contactado_en).length,
    convertidos: filas.filter((f) => f.oportunidad_id).length,
    conPropuesta: filas.filter((f) => f.propuesta_enviada_en).length,
    adjudicados: filas.filter((f) => f.adjudicada_en).length,
  };
}

/** % sobre el paso anterior (para leer la pérdida entre etapas). */
export function tasaPaso(actual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return Math.round((actual / anterior) * 100);
}
