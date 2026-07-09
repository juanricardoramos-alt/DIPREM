import type { SupabaseClient } from "@supabase/supabase-js";
import type { Actividad, DatosActividad, EstadoActividad, Oportunidad } from "@diprem/core";

function lanzar(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

const SELECT_ACTIVIDAD =
  "*, cuenta:cuentas!actividades_cuenta_id_fkey(razon_social)," +
  " oportunidad:oportunidades!actividades_oportunidad_id_fkey(nombre)," +
  " contacto:contactos!actividades_contacto_id_fkey(nombre)," +
  " propietario:usuarios!actividades_propietario_id_fkey(nombre)";

export interface FiltrosActividades {
  estado?: EstadoActividad;
  cuenta_id?: string;
  oportunidad_id?: string;
}

export async function listarActividades(
  sb: SupabaseClient,
  filtros?: FiltrosActividades,
): Promise<Actividad[]> {
  let query = sb
    .from("actividades")
    .select(SELECT_ACTIVIDAD)
    .order("fecha_programada", { ascending: true, nullsFirst: false })
    .order("creado_en", { ascending: false })
    .limit(200);
  if (filtros?.estado) query = query.eq("estado", filtros.estado);
  if (filtros?.cuenta_id) query = query.eq("cuenta_id", filtros.cuenta_id);
  if (filtros?.oportunidad_id) query = query.eq("oportunidad_id", filtros.oportunidad_id);
  const { data, error } = await query;
  lanzar(error);
  return (data ?? []) as unknown as Actividad[];
}

/**
 * Agenda de "Mi Día": actividades cuya fecha programada cae dentro del día
 * local del usuario (los límites vienen del cliente para respetar su zona
 * horaria) + tareas pendientes ya vencidas.
 */
export async function agendaDelDia(
  sb: SupabaseClient,
  inicioDiaISO: string,
  finDiaISO: string,
): Promise<{ agenda: Actividad[]; vencidas: Actividad[] }> {
  const [agendaRes, vencidasRes] = await Promise.all([
    sb
      .from("actividades")
      .select(SELECT_ACTIVIDAD)
      .gte("fecha_programada", inicioDiaISO)
      .lt("fecha_programada", finDiaISO)
      .neq("estado", "cancelada")
      .order("fecha_programada", { ascending: true }),
    sb
      .from("actividades")
      .select(SELECT_ACTIVIDAD)
      .eq("estado", "pendiente")
      .or(`fecha_programada.lt.${inicioDiaISO},fecha_vencimiento.lt.${inicioDiaISO}`)
      .order("fecha_programada", { ascending: true, nullsFirst: false })
      .limit(50),
  ]);
  lanzar(agendaRes.error);
  lanzar(vencidasRes.error);
  return {
    agenda: (agendaRes.data ?? []) as unknown as Actividad[],
    vencidas: (vencidasRes.data ?? []) as unknown as Actividad[],
  };
}

/** Oportunidades abiertas para el panel de seguimientos (el orden/alerta se calcula en core). */
export async function oportunidadesAbiertas(sb: SupabaseClient): Promise<Oportunidad[]> {
  const { data, error } = await sb
    .from("oportunidades")
    .select(
      "id, nombre, cuenta_id, propietario_id, etapa_id, monto, moneda, " +
        "ultimo_contacto_en, creado_en, cerrada_en, modalidad_contrato, " +
        "probabilidad, fecha_cierre_estimada, pilar_id, linea_servicio_id, " +
        "servicio_id, motivo_perdida_id, motivo_perdida_detalle, " +
        "cuenta:cuentas!oportunidades_cuenta_id_fkey(razon_social)",
    )
    .is("cerrada_en", null)
    .limit(200);
  lanzar(error);
  return (data ?? []) as unknown as Oportunidad[];
}

export interface NuevaActividad extends DatosActividad {
  propietario_id: string;
  estado?: EstadoActividad;
  completada_en?: string | null;
  resultado?: string | null;
}

export async function crearActividad(sb: SupabaseClient, datos: NuevaActividad): Promise<void> {
  const { error } = await sb.from("actividades").insert(datos);
  lanzar(error);
}

export async function actualizarActividad(
  sb: SupabaseClient,
  id: string,
  datos: Partial<NuevaActividad>,
): Promise<void> {
  const { error } = await sb.from("actividades").update(datos).eq("id", id);
  lanzar(error);
}

/** Marca la actividad como hecha (dispara el trigger de último contacto). */
export async function completarActividad(
  sb: SupabaseClient,
  id: string,
  datos?: { resultado?: string | null; proxima_accion?: string | null },
): Promise<void> {
  const { error } = await sb
    .from("actividades")
    .update({
      estado: "completada",
      completada_en: new Date().toISOString(),
      ...(datos ?? {}),
    })
    .eq("id", id);
  lanzar(error);
}

export async function cancelarActividad(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("actividades").update({ estado: "cancelada" }).eq("id", id);
  lanzar(error);
}

/** Gestión completada en un rango, para el reporte exportable por ejecutivo. */
export async function listarGestionReporte(
  sb: SupabaseClient,
  filtros: { desde: string; hasta: string; propietario_id?: string },
): Promise<Actividad[]> {
  let query = sb
    .from("actividades")
    .select(SELECT_ACTIVIDAD)
    .eq("estado", "completada")
    .gte("completada_en", filtros.desde)
    .lt("completada_en", filtros.hasta)
    .order("completada_en", { ascending: true })
    .limit(5000);
  if (filtros.propietario_id) query = query.eq("propietario_id", filtros.propietario_id);
  const { data, error } = await query;
  lanzar(error);
  return (data ?? []) as unknown as Actividad[];
}
