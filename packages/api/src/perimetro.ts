import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Perímetro anti-extracción (migración 0015).
 *
 * · La PII de contactos (teléfono/correo/LinkedIn) NO llega en los SELECT:
 *   solo la entrega revelarContactos(), con cuota diaria por rol y registro
 *   en lecturas_sensibles (una fila por primera revelación; re-ver es libre).
 * · El pool "Cartera sin asignar" es invisible por tabla; se explora con
 *   directorioProspectos() (sin PII) y se entra con reclamarCuenta()
 *   (tope de cartera por rol, auditado).
 */

function lanzar(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Revelación de PII
// ---------------------------------------------------------------------------
export interface ContactoRevelado {
  id: string;
  nombre: string;
  cargo: string | null;
  rol: string;
  es_principal: boolean;
  canal_preferido: string | null;
  /** Ley 21.719: la persona se opuso — sin PII y no debe ser contactada. */
  opt_out: boolean;
  /** true = quedó fuera de la cuota diaria; PII en null hasta mañana. */
  omitido: boolean;
  telefono: string | null;
  email: string | null;
  linkedin: string | null;
}

export interface RevelacionContactos {
  contactos: ContactoRevelado[];
  omitidos_por_limite: number;
  usadas_hoy: number;
  limite_diario: number | null;
}

/** PII de los contactos de una cuenta de la cartera propia (o del equipo). */
export async function revelarContactos(
  sb: SupabaseClient,
  cuentaId: string,
): Promise<RevelacionContactos> {
  const { data, error } = await sb.rpc("revelar_contactos", { p_cuenta_id: cuentaId });
  lanzar(error);
  return data as RevelacionContactos;
}

/** PII de UN contacto (botón "Mostrar" de la tarjeta): consume 1 del tope
 *  diario y queda registrado igual que el revelado de cuenta completa.
 *  Si el tope está copado, lanza error con el mensaje de la BD. */
export async function revelarContacto(
  sb: SupabaseClient,
  contactoId: string,
): Promise<ContactoRevelado & { usadas_hoy?: number; limite_diario?: number | null }> {
  const { data, error } = await sb.rpc("revelar_contacto", { p_contacto_id: contactoId });
  lanzar(error);
  return data as ContactoRevelado & { usadas_hoy?: number; limite_diario?: number | null };
}

// ---------------------------------------------------------------------------
// Directorio del pool (sin PII) + reclamo / liberación
// ---------------------------------------------------------------------------
export interface FilaDirectorio {
  cuenta_id: string;
  razon_social: string;
  giro: string | null;
  region: string | null;
  pais: string | null;
  rol_mercado: string | null;
  /** cuántos contactos hay — nunca quiénes son */
  n_contactos: number;
  esta_asignada: boolean;
  /** nombre del dueño si está asignada (para no chocar carteras) */
  ejecutivo: string | null;
}

export async function directorioProspectos(
  sb: SupabaseClient,
  filtros: {
    busqueda?: string;
    rolMercado?: string;
    region?: string;
    /** epc/contratista ocultos por defecto (interruptor aprobado) */
    incluirProveedores?: boolean;
    limite?: number;
    desde?: number;
  } = {},
): Promise<FilaDirectorio[]> {
  const { data, error } = await sb.rpc("directorio_prospectos", {
    p_busqueda: filtros.busqueda ?? null,
    p_rol_mercado: filtros.rolMercado ?? null,
    p_region: filtros.region ?? null,
    p_incluir_proveedores: filtros.incluirProveedores ?? false,
    p_limite: filtros.limite ?? 50,
    p_desde: filtros.desde ?? 0,
  });
  lanzar(error);
  return (data ?? []) as FilaDirectorio[];
}

/** Saca una cuenta del pool hacia la cartera propia (o de `paraUsuarioId`,
 *  si quien llama es admin o su gerente). Tope de cartera por rol. */
export async function reclamarCuenta(
  sb: SupabaseClient,
  cuentaId: string,
  paraUsuarioId?: string,
): Promise<{ cuenta_id: string; propietario_id: string }> {
  const { data, error } = await sb.rpc("reclamar_cuenta", {
    p_cuenta_id: cuentaId,
    p_para: paraUsuarioId ?? null,
  });
  lanzar(error);
  return data as { cuenta_id: string; propietario_id: string };
}

/** Devuelve una cuenta al pool (exige cerrar/reasignar oportunidades antes). */
export async function liberarCuenta(sb: SupabaseClient, cuentaId: string): Promise<void> {
  const { error } = await sb.rpc("liberar_cuenta", { p_cuenta_id: cuentaId });
  lanzar(error);
}

// ---------------------------------------------------------------------------
// Puerta de entrada de leads (captación paralela, sin duplicados)
// ---------------------------------------------------------------------------
export type ResultadoAltaLead =
  | { resultado: "creado"; lead_id: string }
  | {
      resultado: "empresa_existente";
      cuenta_id: string;
      razon_social: string;
      en_pool: boolean;
      /** dueño actual si está asignada; null si está en el pool */
      propietario: string | null;
    }
  | { resultado: "lead_duplicado"; lead_id: string; propietario: string };

/**
 * Alta manual con dedup contra TODO (cuentas del pool incluidas) y
 * base de licitud obligatoria (Ley 21.719). Si la empresa ya existe o el
 * lead está duplicado, devuelve el match en vez de crear.
 */
export async function altaLead(
  sb: SupabaseClient,
  datos: {
    nombre: string;
    empresa?: string;
    telefono?: string;
    email?: string;
    fuente?: string;
    calificacion?: string;
    baseLicitud: string;
    origenDato?: string;
    proyectoMercadoId?: string;
    notas?: string;
  },
): Promise<ResultadoAltaLead> {
  const { data, error } = await sb.rpc("alta_lead", {
    p_nombre: datos.nombre,
    p_empresa: datos.empresa ?? null,
    p_telefono: datos.telefono ?? null,
    p_email: datos.email ?? null,
    p_fuente: datos.fuente ?? "otro",
    p_calificacion: datos.calificacion ?? "tibio",
    p_base_licitud: datos.baseLicitud,
    p_origen_dato: datos.origenDato ?? null,
    p_proyecto_mercado_id: datos.proyectoMercadoId ?? null,
    p_notas: datos.notas ?? null,
  });
  lanzar(error);
  return data as ResultadoAltaLead;
}
