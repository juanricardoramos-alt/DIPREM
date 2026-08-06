import type { Actividad, Lead, Moneda } from "../types/dominio";
import { fechaLimiteVencida, infoAsignacionLead } from "./control";
import { formatearHora } from "./fechas";
import { formatearMonto } from "./moneda";
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
// Qué hacer hoy: UNA lista ordenada por urgencia (Fase D). El ejecutivo no
// decide por dónde partir — la plataforma se lo dice. La razón viaja
// estructurada para que el motor de IA (Fase C) pueda reemplazar el "por qué"
// sin cambiar esta lógica.
// ---------------------------------------------------------------------------
export type RazonAccion =
  | { tipo: "limite_vencido" }
  | { tipo: "primer_contacto" }
  | { tipo: "tarea_vencida" }
  | { tipo: "agendada"; hora: string | null }
  | { tipo: "sin_contacto"; dias: number };

export interface SeguimientoResumen {
  id: string;
  nombre: string;
  cuenta_id: string;
  monto: number;
  moneda: Moneda;
  dias_sin_contacto: number;
  alerta: NivelAlerta;
  cuenta?: { razon_social: string } | null;
}

type LeadResumen = Pick<Lead, "id" | "nombre" | "empresa" | "atributos">;
type ActividadResumen = Pick<Actividad, "id" | "asunto" | "tipo" | "fecha_programada"> & {
  cuenta?: { razon_social: string } | null;
};

export interface AccionDeHoy<TA extends ActividadResumen = ActividadResumen> {
  clave: string;
  titulo: string;
  detalle: string | null;
  razon: RazonAccion;
  urgente: boolean;
  ruta: string | null;
  hacer:
    | { tipo: "completar"; actividad: TA }
    | { tipo: "gestionar_lead"; lead: { id: string; nombre: string } }
    | {
        tipo: "gestionar_oportunidad";
        oportunidad: { id: string; nombre: string; cuenta_id: string };
      };
}

/**
 * Prioridad (de más a menos grave): límite de primer contacto vencido →
 * tareas vencidas → seguimientos críticos → proyectos asignados pendientes →
 * agenda de hoy → leads nuevos → seguimientos en atención.
 */
export function accionesDeHoy<TA extends ActividadResumen>(
  datos: {
    vencidas: TA[];
    agendaPendiente: TA[];
    prioritarios: LeadPriorizado<LeadResumen & Pick<Lead, "estado" | "creado_en">>[];
    leadsNuevos: LeadResumen[];
    seguimientos: SeguimientoResumen[];
  },
  limite = 6,
): AccionDeHoy<TA>[] {
  const acciones: AccionDeHoy<TA>[] = [];

  const deLead = (lead: LeadResumen, razon: RazonAccion, urgente: boolean): AccionDeHoy<TA> => {
    const info = infoAsignacionLead(lead);
    return {
      clave: `lead-${lead.id}`,
      titulo: info?.proyecto_nombre ?? lead.nombre,
      detalle: lead.empresa ?? null,
      razon,
      urgente,
      ruta: `/leads/${lead.id}`,
      hacer: { tipo: "gestionar_lead", lead: { id: lead.id, nombre: lead.nombre } },
    };
  };
  const deActividad = (a: TA, razon: RazonAccion, urgente: boolean): AccionDeHoy<TA> => ({
    clave: `act-${a.id}`,
    titulo: a.asunto,
    detalle: a.cuenta?.razon_social ?? null,
    razon,
    urgente,
    ruta: null,
    hacer: { tipo: "completar", actividad: a },
  });
  const deSeguimiento = (s: SeguimientoResumen, urgente: boolean): AccionDeHoy<TA> => ({
    clave: `seg-${s.id}`,
    titulo: s.nombre,
    detalle: [s.cuenta?.razon_social, formatearMonto(s.monto, s.moneda)]
      .filter(Boolean)
      .join(" · "),
    razon: { tipo: "sin_contacto", dias: s.dias_sin_contacto },
    urgente,
    ruta: `/empresas/${s.cuenta_id}`,
    hacer: {
      tipo: "gestionar_oportunidad",
      oportunidad: { id: s.id, nombre: s.nombre, cuenta_id: s.cuenta_id },
    },
  });

  const porDias = (a: SeguimientoResumen, b: SeguimientoResumen) =>
    b.dias_sin_contacto - a.dias_sin_contacto;

  for (const p of datos.prioritarios.filter((x) => x.limiteVencido)) {
    acciones.push(deLead(p.lead, { tipo: "limite_vencido" }, true));
  }
  for (const a of datos.vencidas) {
    acciones.push(deActividad(a, { tipo: "tarea_vencida" }, true));
  }
  for (const s of datos.seguimientos.filter((x) => x.alerta === "critico").sort(porDias)) {
    acciones.push(deSeguimiento(s, true));
  }
  for (const p of datos.prioritarios.filter((x) => !x.limiteVencido)) {
    acciones.push(deLead(p.lead, { tipo: "primer_contacto" }, false));
  }
  const agenda = [...datos.agendaPendiente].sort((a, b) =>
    (a.fecha_programada ?? "").localeCompare(b.fecha_programada ?? ""),
  );
  for (const a of agenda) {
    acciones.push(
      deActividad(
        a,
        {
          tipo: "agendada",
          hora: a.fecha_programada ? formatearHora(a.fecha_programada) : null,
        },
        false,
      ),
    );
  }
  for (const l of datos.leadsNuevos) {
    acciones.push(deLead(l, { tipo: "primer_contacto" }, false));
  }
  for (const s of datos.seguimientos.filter((x) => x.alerta === "atencion").sort(porDias)) {
    acciones.push(deSeguimiento(s, false));
  }

  // Sin repetidos (un lead prioritario también llega en leadsNuevos)
  const vistas = new Set<string>();
  return acciones
    .filter((a) => (vistas.has(a.clave) ? false : (vistas.add(a.clave), true)))
    .slice(0, limite);
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
