import type { Actividad, Lead } from "../types/dominio";
import { fechaLimiteVencida, infoAsignacionLead } from "./control";
import type { NivelAlerta } from "./seguimientos";

/**
 * Mi Día mejorado: racha de gestión, proyectos prioritarios del día,
 * resumen de fin de día con sugerencias y meta semanal derivada.
 */

/** Fecha local YYYY-MM-DD (la racha se corta por día del ejecutivo, no UTC). */
function claveDia(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Racha: días seguidos con al menos una gestión registrada, contando hacia
 * atrás desde hoy. Si hoy aún no hay gestión, la racha vigente parte de ayer
 * (no castiga al ejecutivo a primera hora).
 */
export function calcularRacha(
  fechasGestionISO: string[],
  ahora: Date = new Date(),
): number {
  if (fechasGestionISO.length === 0) return 0;
  const dias = new Set(fechasGestionISO.map((f) => claveDia(new Date(f))));

  const cursor = new Date(ahora);
  if (!dias.has(claveDia(cursor))) {
    cursor.setDate(cursor.getDate() - 1); // hoy aún sin gestión → evaluar desde ayer
    if (!dias.has(claveDia(cursor))) return 0;
  }

  let racha = 0;
  while (dias.has(claveDia(cursor))) {
    racha++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return racha;
}

// ---------------------------------------------------------------------------
// Proyectos prioritarios: los 3 más urgentes de trabajar hoy
// ---------------------------------------------------------------------------
export interface LeadPriorizado<T> {
  lead: T;
  puntaje: number;
  limiteVencido: boolean;
}

/**
 * Puntaje de urgencia sobre leads activos con proyecto asignado:
 * prioridad alta +3 / media +1 · límite vencido +3 · límite en ≤2 días +2 ·
 * aún sin primera gestión (estado nuevo) +1.
 */
export function proyectosPrioritarios<
  T extends Pick<Lead, "atributos" | "estado" | "creado_en">,
>(leads: T[], ahora: Date = new Date(), cantidad = 3): LeadPriorizado<T>[] {
  const dosDias = 2 * 86_400_000;
  return leads
    .filter((l) => l.estado === "nuevo" || l.estado === "en_gestion")
    .map((lead) => {
      const info = infoAsignacionLead(lead);
      if (!info) return null; // solo proyectos asignados desde el Mercado
      let puntaje = 0;
      if (info.prioridad === "alta") puntaje += 3;
      else if (info.prioridad === "media") puntaje += 1;
      const limiteVencido = fechaLimiteVencida(info.fecha_limite_contacto, ahora);
      if (limiteVencido) puntaje += 3;
      else if (
        info.fecha_limite_contacto &&
        new Date(`${info.fecha_limite_contacto}T23:59:59`).getTime() - ahora.getTime() <= dosDias
      ) {
        puntaje += 2;
      }
      if (lead.estado === "nuevo") puntaje += 1;
      return { lead, puntaje, limiteVencido };
    })
    .filter((x): x is LeadPriorizado<T> => x !== null)
    .sort(
      (a, b) =>
        b.puntaje - a.puntaje ||
        new Date(a.lead.creado_en).getTime() - new Date(b.lead.creado_en).getTime(),
    )
    .slice(0, cantidad);
}

// ---------------------------------------------------------------------------
// Resumen de fin de día (desde las 17:00) con 3 sugerencias para mañana
// ---------------------------------------------------------------------------
export const HORA_FIN_DE_DIA = 17;

export function esFinDeDia(ahora: Date = new Date()): boolean {
  return ahora.getHours() >= HORA_FIN_DE_DIA;
}

export interface Sugerencia {
  texto: string;
  ruta: string | null;
}

/**
 * 3 acciones sugeridas para mañana: seguimientos más urgentes, proyectos
 * prioritarios sin gestión y tareas vencidas — en ese orden de importancia.
 */
export function sugerenciasManana(
  seguimientos: {
    id: string;
    nombre: string;
    dias_sin_contacto: number;
    alerta: NivelAlerta;
    cuenta?: { razon_social: string } | null;
    cuenta_id: string;
  }[],
  prioritarios: LeadPriorizado<Pick<Lead, "id" | "nombre" | "empresa" | "atributos" | "estado" | "creado_en">>[],
  vencidas: Pick<Actividad, "id" | "asunto" | "tipo">[],
): Sugerencia[] {
  const sugerencias: Sugerencia[] = [];

  for (const s of seguimientos.filter((x) => x.alerta !== "ok").slice(0, 2)) {
    sugerencias.push({
      texto: `Contactar ${s.cuenta?.razon_social ?? s.nombre} — ${
        s.dias_sin_contacto === 1 ? "1 día" : `${s.dias_sin_contacto} días`
      } sin contacto`,
      ruta: `/empresas/${s.cuenta_id}`,
    });
  }
  for (const p of prioritarios) {
    if (sugerencias.length >= 3) break;
    if (p.lead.estado !== "nuevo") continue;
    sugerencias.push({
      texto: `Hacer el primer contacto de ${p.lead.nombre}${
        p.lead.empresa ? ` (${p.lead.empresa})` : ""
      }${p.limiteVencido ? " — fecha límite vencida" : ""}`,
      ruta: `/leads/${p.lead.id}`,
    });
  }
  for (const v of vencidas) {
    if (sugerencias.length >= 3) break;
    sugerencias.push({ texto: `Cerrar la tarea vencida: ${v.asunto}`, ruta: "/actividades" });
  }

  return sugerencias.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Meta semanal derivada de la meta mensual de actividades
// ---------------------------------------------------------------------------
export function metaSemanalDerivada(
  objetivoMensual: number,
  fecha: Date = new Date(),
): number {
  const diasMes = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();
  return Math.max(1, Math.round(objetivoMensual * (7 / diasMes)));
}
