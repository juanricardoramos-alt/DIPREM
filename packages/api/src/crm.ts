import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Contacto,
  Cuenta,
  DatosContacto,
  DatosCuenta,
  DatosLead,
  DatosOportunidad,
  EtapaEmbudo,
  Lead,
  LineaServicio,
  MotivoPerdida,
  Oportunidad,
  Pilar,
  Servicio,
} from "@diprem/core";

/**
 * Capa de datos CRM compartida (web + móvil).
 * La RLS de la BD es quien decide qué filas ve cada rol; estas funciones
 * no filtran por usuario a propósito.
 */

function lanzar(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------------------
export async function listarEtapas(sb: SupabaseClient): Promise<EtapaEmbudo[]> {
  const { data, error } = await sb.from("etapas_embudo").select("*").order("orden");
  lanzar(error);
  return (data ?? []) as EtapaEmbudo[];
}

export async function listarPilares(sb: SupabaseClient): Promise<Pilar[]> {
  const { data, error } = await sb.from("pilares").select("*").order("numero");
  lanzar(error);
  return (data ?? []) as Pilar[];
}

export async function listarLineasServicio(sb: SupabaseClient): Promise<LineaServicio[]> {
  const { data, error } = await sb
    .from("lineas_servicio")
    .select("*")
    .eq("activa", true)
    .order("nombre");
  lanzar(error);
  return (data ?? []) as LineaServicio[];
}

export async function listarServicios(sb: SupabaseClient): Promise<Servicio[]> {
  const { data, error } = await sb
    .from("servicios")
    .select("*")
    .eq("activo", true)
    .order("nombre");
  lanzar(error);
  return (data ?? []) as Servicio[];
}

export async function listarMotivosPerdida(sb: SupabaseClient): Promise<MotivoPerdida[]> {
  const { data, error } = await sb
    .from("motivos_perdida")
    .select("*")
    .eq("activo", true)
    .order("nombre");
  lanzar(error);
  return (data ?? []) as MotivoPerdida[];
}

// ---------------------------------------------------------------------------
// Cuentas y contactos
// ---------------------------------------------------------------------------
const SELECT_CUENTA =
  "*, propietario:usuarios!cuentas_propietario_id_fkey(nombre)";

export async function listarCuentas(
  sb: SupabaseClient,
  busqueda?: string,
): Promise<Cuenta[]> {
  let query = sb.from("cuentas").select(SELECT_CUENTA).order("razon_social");
  if (busqueda?.trim()) query = query.ilike("razon_social", `%${busqueda.trim()}%`);
  const { data, error } = await query;
  lanzar(error);
  return (data ?? []) as Cuenta[];
}

export async function obtenerCuenta(sb: SupabaseClient, id: string): Promise<Cuenta | null> {
  const { data, error } = await sb
    .from("cuentas")
    .select(SELECT_CUENTA)
    .eq("id", id)
    .maybeSingle();
  lanzar(error);
  return data as Cuenta | null;
}

export async function crearCuenta(
  sb: SupabaseClient,
  datos: DatosCuenta & { propietario_id: string; equipo_id: string | null },
): Promise<Cuenta> {
  const { data, error } = await sb.from("cuentas").insert(datos).select().single();
  lanzar(error);
  return data as Cuenta;
}

export async function actualizarCuenta(
  sb: SupabaseClient,
  id: string,
  datos: Partial<DatosCuenta>,
): Promise<void> {
  const { error } = await sb.from("cuentas").update(datos).eq("id", id);
  lanzar(error);
}

export async function listarContactos(sb: SupabaseClient, cuentaId: string): Promise<Contacto[]> {
  const { data, error } = await sb
    .from("contactos")
    .select("*")
    .eq("cuenta_id", cuentaId)
    .order("es_principal", { ascending: false })
    .order("nombre");
  lanzar(error);
  return (data ?? []) as Contacto[];
}

export async function crearContacto(
  sb: SupabaseClient,
  cuentaId: string,
  datos: DatosContacto,
): Promise<void> {
  const { error } = await sb.from("contactos").insert({ ...datos, cuenta_id: cuentaId });
  lanzar(error);
}

export async function actualizarContacto(
  sb: SupabaseClient,
  id: string,
  datos: Partial<DatosContacto>,
): Promise<void> {
  const { error } = await sb.from("contactos").update(datos).eq("id", id);
  lanzar(error);
}

export async function eliminarContacto(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("contactos").delete().eq("id", id);
  lanzar(error);
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------
const SELECT_LEAD = "*, propietario:usuarios!leads_propietario_id_fkey(nombre)";

export async function listarLeads(sb: SupabaseClient, busqueda?: string): Promise<Lead[]> {
  let query = sb
    .from("leads")
    .select(SELECT_LEAD)
    .order("creado_en", { ascending: false });
  if (busqueda?.trim()) {
    const b = `%${busqueda.trim()}%`;
    query = query.or(`nombre.ilike.${b},empresa.ilike.${b}`);
  }
  const { data, error } = await query;
  lanzar(error);
  return (data ?? []) as Lead[];
}

export async function crearLead(
  sb: SupabaseClient,
  datos: DatosLead & { propietario_id: string },
): Promise<void> {
  const { error } = await sb.from("leads").insert(datos);
  lanzar(error);
}

export async function actualizarLead(
  sb: SupabaseClient,
  id: string,
  datos: Partial<DatosLead> & { estado?: Lead["estado"] },
): Promise<void> {
  const { error } = await sb.from("leads").update(datos).eq("id", id);
  lanzar(error);
}

export interface ParametrosConversion {
  lead_id: string;
  razon_social: string;
  nombre_oportunidad?: string | null;
  monto?: number;
  vertical?: string;
  pilar_id?: number | null;
  modalidad?: string;
}

export async function convertirLead(
  sb: SupabaseClient,
  params: ParametrosConversion,
): Promise<{ cuenta_id: string; oportunidad_id: string }> {
  const { data, error } = await sb.rpc("convertir_lead", {
    p_lead_id: params.lead_id,
    p_razon_social: params.razon_social,
    p_nombre_oportunidad: params.nombre_oportunidad ?? null,
    p_monto: params.monto ?? 0,
    p_pilar_id: params.pilar_id ?? null,
    p_modalidad: params.modalidad ?? "proyecto",
    p_vertical: params.vertical ?? "otro",
  });
  lanzar(error);
  const fila = Array.isArray(data) ? data[0] : data;
  return fila as { cuenta_id: string; oportunidad_id: string };
}

// ---------------------------------------------------------------------------
// Oportunidades
// ---------------------------------------------------------------------------
const SELECT_OPORTUNIDAD =
  "*, cuenta:cuentas!oportunidades_cuenta_id_fkey(razon_social)," +
  " propietario:usuarios!oportunidades_propietario_id_fkey(nombre)," +
  " servicio:servicios!oportunidades_servicio_id_fkey(nombre)";

export async function listarOportunidades(
  sb: SupabaseClient,
  filtros?: { cuenta_id?: string },
): Promise<Oportunidad[]> {
  let query = sb
    .from("oportunidades")
    .select(SELECT_OPORTUNIDAD)
    .order("creado_en", { ascending: false });
  if (filtros?.cuenta_id) query = query.eq("cuenta_id", filtros.cuenta_id);
  const { data, error } = await query;
  lanzar(error);
  return (data ?? []) as unknown as Oportunidad[];
}

export async function crearOportunidad(
  sb: SupabaseClient,
  datos: DatosOportunidad & { propietario_id: string; etapa_id: string },
): Promise<void> {
  const { error } = await sb.from("oportunidades").insert(datos);
  lanzar(error);
}

export async function actualizarOportunidad(
  sb: SupabaseClient,
  id: string,
  datos: Partial<DatosOportunidad>,
): Promise<void> {
  const { error } = await sb.from("oportunidades").update(datos).eq("id", id);
  lanzar(error);
}

/** Mueve la oportunidad de etapa. Si la etapa es perdida, exige motivo. */
export async function moverOportunidad(
  sb: SupabaseClient,
  id: string,
  etapaId: string,
  motivo?: { motivo_perdida_id: string; motivo_perdida_detalle?: string | null },
): Promise<void> {
  const { error } = await sb
    .from("oportunidades")
    .update({ etapa_id: etapaId, ...(motivo ?? {}) })
    .eq("id", id);
  lanzar(error);
}

// ---------------------------------------------------------------------------
// Administración del embudo (solo admin — la RLS lo garantiza)
// ---------------------------------------------------------------------------
export async function guardarEtapa(
  sb: SupabaseClient,
  etapa: Partial<EtapaEmbudo> & { nombre: string; orden: number; probabilidad_default: number },
): Promise<void> {
  const { id, ...datos } = etapa;
  if (id) {
    const { error } = await sb.from("etapas_embudo").update(datos).eq("id", id);
    lanzar(error);
  } else {
    const { error } = await sb.from("etapas_embudo").insert(datos);
    lanzar(error);
  }
}

export async function intercambiarOrdenEtapas(
  sb: SupabaseClient,
  a: { id: string; orden: number },
  b: { id: string; orden: number },
): Promise<void> {
  // Dos updates simples (el editor es solo-admin y de baja concurrencia)
  const r1 = await sb.from("etapas_embudo").update({ orden: b.orden }).eq("id", a.id);
  lanzar(r1.error);
  const r2 = await sb.from("etapas_embudo").update({ orden: a.orden }).eq("id", b.id);
  lanzar(r2.error);
}
