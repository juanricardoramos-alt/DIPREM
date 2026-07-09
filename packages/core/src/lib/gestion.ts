import type { Actividad, TipoActividad } from "../types/dominio";
import { nivelAlerta, type NivelAlerta } from "./seguimientos";

/**
 * Análisis de gestión por contacto (lead o cuenta) y por ejecutivo.
 * Los datos crudos vienen de las vistas v_gestion_contactos y
 * v_distribucion_gestion (migración 0005); aquí vive la interpretación.
 */

/** Fila de v_gestion_contactos: un lead activo o una cuenta con su última gestión. */
export interface GestionContacto {
  entidad: "lead" | "cuenta";
  entidad_id: string;
  nombre: string;
  detalle: string | null; // empresa (lead) o país (cuenta)
  telefono: string | null;
  email: string | null;
  propietario_id: string;
  ejecutivo: string;
  equipo_id: string | null;
  creado_en: string;
  ultima_gestion: string | null;
  total_gestiones: number;
}

/** Fila de v_distribucion_gestion: gestiones por tipo y ejecutivo (90 días). */
export interface DistribucionGestion {
  propietario_id: string;
  ejecutivo: string;
  equipo_id: string | null;
  tipo: TipoActividad;
  total: number;
}

/** Días transcurridos desde la última gestión (o desde la creación si nunca hubo). */
export function diasSinGestion(
  contacto: Pick<GestionContacto, "ultima_gestion" | "creado_en">,
  ahora: Date = new Date(),
): number {
  const referencia = contacto.ultima_gestion ?? contacto.creado_en;
  const ms = ahora.getTime() - new Date(referencia).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** Semáforo verde/ámbar/rojo — mismos umbrales que los seguimientos de Mi Día. */
export function semaforoGestion(dias: number): NivelAlerta {
  return nivelAlerta(dias);
}

// ---------------------------------------------------------------------------
// Intensidad de gestión: poco / regular / intenso
// Regla: gestiones por semana desde que existe el contacto (mínimo 1 semana).
//   0 gestiones → sin gestión · < 1/semana → poca · < 3/semana → regular · ≥ 3 → intensa
// ---------------------------------------------------------------------------
export type IntensidadGestion = "sin_gestion" | "poca" | "regular" | "intensa";

export function intensidadGestion(
  totalGestiones: number,
  creadoEn: string,
  ahora: Date = new Date(),
): IntensidadGestion {
  if (totalGestiones <= 0) return "sin_gestion";
  const semanas = Math.max(
    1,
    (ahora.getTime() - new Date(creadoEn).getTime()) / (7 * 86_400_000),
  );
  const porSemana = totalGestiones / semanas;
  if (porSemana >= 3) return "intensa";
  if (porSemana >= 1) return "regular";
  return "poca";
}

export const ETIQUETAS_INTENSIDAD: Record<IntensidadGestion, string> = {
  sin_gestion: "Sin gestión",
  poca: "Poca gestión",
  regular: "Gestión regular",
  intensa: "Gestión intensa",
};

// ---------------------------------------------------------------------------
// Resumen y línea de tiempo a partir de las actividades del contacto
// ---------------------------------------------------------------------------

/** Cuántas gestiones completadas de cada tipo se han hecho en total. */
export function resumenPorTipo(
  actividades: Pick<Actividad, "tipo" | "estado">[],
): Partial<Record<TipoActividad, number>> {
  const resumen: Partial<Record<TipoActividad, number>> = {};
  for (const a of actividades) {
    if (a.estado !== "completada") continue;
    resumen[a.tipo] = (resumen[a.tipo] ?? 0) + 1;
  }
  return resumen;
}

/** Línea de tiempo: completadas de más reciente a más antigua. */
export function lineaDeTiempo<T extends Pick<Actividad, "estado" | "completada_en" | "creado_en">>(
  actividades: T[],
): T[] {
  return actividades
    .filter((a) => a.estado === "completada")
    .sort(
      (a, b) =>
        new Date(b.completada_en ?? b.creado_en).getTime() -
        new Date(a.completada_en ?? a.creado_en).getTime(),
    );
}

/**
 * Próxima acción pendiente destacada: la actividad pendiente más próxima o,
 * si no hay, la "próxima acción" anotada en la última gestión completada.
 */
export function proximaAccion(
  actividades: Pick<
    Actividad,
    "estado" | "asunto" | "tipo" | "fecha_programada" | "proxima_accion" | "completada_en" | "creado_en"
  >[],
): { texto: string; tipo: TipoActividad | null; fecha: string | null } | null {
  const pendientes = actividades
    .filter((a) => a.estado === "pendiente")
    .sort(
      (a, b) =>
        new Date(a.fecha_programada ?? "9999-12-31").getTime() -
        new Date(b.fecha_programada ?? "9999-12-31").getTime(),
    );
  const primera = pendientes[0];
  if (primera) {
    return {
      texto: primera.asunto,
      tipo: primera.tipo,
      fecha: primera.fecha_programada,
    };
  }
  const ultima = lineaDeTiempo(actividades).find((a) => a.proxima_accion);
  if (ultima?.proxima_accion) {
    return { texto: ultima.proxima_accion, tipo: null, fecha: null };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Panel del gerente: agregados por ejecutivo
// ---------------------------------------------------------------------------
export const DIAS_GESTION_RECIENTE = 7;
/** Ventana de la vista v_distribucion_gestion (mantener en sincronía con el SQL). */
export const DIAS_VENTANA_DISTRIBUCION = 90;

export interface AnalisisEjecutivo {
  propietario_id: string;
  ejecutivo: string;
  totalContactos: number;
  conGestionReciente: number; // gestión en los últimos 7 días
  sinGestionReciente: number;
  masAbandonados: (GestionContacto & { dias: number })[]; // top 5 con más días sin gestión
  distribucion: Partial<Record<TipoActividad, number>>; // gestiones 90 días por tipo
  totalGestiones90d: number;
  /** Cada cuántos días contacta en promedio a cada prospecto (null = sin datos). */
  frecuenciaPromedioDias: number | null;
}

export function analizarEjecutivos(
  contactos: GestionContacto[],
  distribucion: DistribucionGestion[],
  ahora: Date = new Date(),
): AnalisisEjecutivo[] {
  const porEjecutivo = new Map<string, AnalisisEjecutivo>();

  const asegurar = (id: string, nombre: string): AnalisisEjecutivo => {
    let analisis = porEjecutivo.get(id);
    if (!analisis) {
      analisis = {
        propietario_id: id,
        ejecutivo: nombre,
        totalContactos: 0,
        conGestionReciente: 0,
        sinGestionReciente: 0,
        masAbandonados: [],
        distribucion: {},
        totalGestiones90d: 0,
        frecuenciaPromedioDias: null,
      };
      porEjecutivo.set(id, analisis);
    }
    return analisis;
  };

  for (const contacto of contactos) {
    const analisis = asegurar(contacto.propietario_id, contacto.ejecutivo);
    const dias = diasSinGestion(contacto, ahora);
    analisis.totalContactos += 1;
    if (contacto.ultima_gestion && dias <= DIAS_GESTION_RECIENTE) {
      analisis.conGestionReciente += 1;
    } else {
      analisis.sinGestionReciente += 1;
    }
    analisis.masAbandonados.push({ ...contacto, dias });
  }

  for (const fila of distribucion) {
    const analisis = asegurar(fila.propietario_id, fila.ejecutivo);
    analisis.distribucion[fila.tipo] =
      (analisis.distribucion[fila.tipo] ?? 0) + Number(fila.total);
    analisis.totalGestiones90d += Number(fila.total);
  }

  for (const analisis of porEjecutivo.values()) {
    analisis.masAbandonados = analisis.masAbandonados
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 5);
    // Frecuencia: gestiones de 90 días repartidas entre sus contactos activos
    if (analisis.totalContactos > 0 && analisis.totalGestiones90d > 0) {
      analisis.frecuenciaPromedioDias = Math.round(
        DIAS_VENTANA_DISTRIBUCION /
          (analisis.totalGestiones90d / analisis.totalContactos),
      );
    }
  }

  return [...porEjecutivo.values()].sort((a, b) =>
    a.ejecutivo.localeCompare(b.ejecutivo),
  );
}
