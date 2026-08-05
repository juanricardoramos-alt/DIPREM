/**
 * Tipos de dominio DIPREM — espejo de los enums y tablas núcleo del esquema SQL
 * (docs/PLAN-ARQUITECTURA.md §4). Los tipos completos de la BD se generarán con
 * `supabase gen types` en Fase 1; estos tipos manuales cubren lo que usa la Fase 0.
 */

export type RolUsuario = "ejecutivo" | "gerente" | "admin" | "revisor" | "lectura";

export type VerticalCuenta =
  | "mineria"
  | "energia"
  | "infraestructura"
  | "construccion"
  | "industrial"
  | "oil_gas"
  | "otro";

export type TipoActividad =
  | "llamada"
  | "reunion"
  | "visita_terreno"
  | "email"
  | "whatsapp"
  | "tarea";

export type ModalidadContrato = "proyecto" | "mensual_recurrente" | "outsourcing";

export type TipoMeta =
  | "monto_adjudicado"
  | "propuestas_enviadas"
  | "actividades"
  | "oportunidades_nuevas";

/** Monedas de los 14 países DIPREM (Panamá y Puerto Rico operan en USD). */
export type Moneda =
  | "USD" | "CLP" | "ARS" | "COP" | "BRL" | "MXN" | "PEN"
  | "CAD" | "UYU" | "BOB" | "GTQ" | "DOP" | "EUR";

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  equipo_id: string | null;
  telefono: string | null;
  activo: boolean;
}

export interface Equipo {
  id: string;
  nombre: string;
  pais: string;
  moneda_default: Moneda;
  gerente_id: string | null;
}

export interface Pilar {
  id: number;
  numero: number;
  nombre: string;
}

export type EstadoCuenta = "prospecto" | "activa" | "inactiva";
export type FuenteLead =
  | "referido"
  | "licitacion"
  | "web"
  | "evento"
  | "linkedin"
  | "red_comercial"
  | "otro";
export type CalificacionLead = "frio" | "tibio" | "caliente";
export type EstadoLead = "nuevo" | "en_gestion" | "convertido" | "descartado";
export type CanalContacto = "llamada" | "email" | "whatsapp" | "reunion";

export interface Cuenta {
  id: string;
  razon_social: string;
  tax_id: string | null;
  vertical: VerticalCuenta;
  pais: string | null;
  ciudad: string | null;
  sitio_web: string | null;
  propietario_id: string;
  equipo_id: string | null;
  estado: EstadoCuenta;
  creado_en: string;
  /** join opcional */
  propietario?: { nombre: string } | null;
}

export interface Contacto {
  id: string;
  cuenta_id: string;
  nombre: string;
  cargo: string | null;
  /**
   * PII (0015): la Data API ya NO entrega telefono/email/linkedin en ningún
   * SELECT (privilegios por columna). Se obtienen con revelarContactos()
   * — cuota diaria por rol + registro en lecturas_sensibles.
   */
  telefono?: string | null;
  email?: string | null;
  linkedin?: string | null;
  canal_preferido: CanalContacto | null;
  es_principal: boolean;
  creado_en?: string;
  /** Desde la migración 0008 (perfil enriquecido); antes vienen undefined. */
  mejor_horario?: string | null;
  notas_privadas?: string | null;
  /** Ley 21.719: si no es null, la persona se opuso — no contactar. */
  opt_out_en?: string | null;
  /** Rol decisor clasificado (0011). */
  rol?: string;
  /** join opcional */
  cuenta?: { razon_social: string } | null;
}

export interface Lead {
  id: string;
  nombre: string;
  empresa: string | null;
  telefono: string | null;
  email: string | null;
  fuente: FuenteLead;
  calificacion: CalificacionLead;
  propietario_id: string;
  estado: EstadoLead;
  convertido_cuenta_id: string | null;
  convertido_oportunidad_id: string | null;
  notas: string | null;
  /** Campos personalizados + info de asignación de proyectos del mercado. */
  atributos?: Record<string, unknown> | null;
  creado_en: string;
  propietario?: { nombre: string } | null;
}

export interface EtapaEmbudo {
  id: string;
  nombre: string;
  orden: number;
  probabilidad_default: number;
  es_ganada: boolean;
  es_perdida: boolean;
  activa: boolean;
}

export interface LineaServicio {
  id: string;
  pilar_id: number;
  nombre: string;
  activa: boolean;
}

export interface Servicio {
  id: string;
  pilar_id: number;
  linea_servicio_id: string | null;
  nombre: string;
  descripcion: string | null;
  unidad: string;
  precio_referencial: number | null;
  moneda: Moneda;
  activo: boolean;
}

export interface MotivoPerdida {
  id: string;
  nombre: string;
  activo: boolean;
}

export type EstadoActividad = "pendiente" | "completada" | "cancelada";

export interface Actividad {
  id: string;
  tipo: TipoActividad;
  asunto: string;
  cuenta_id: string | null;
  oportunidad_id: string | null;
  contacto_id: string | null;
  lead_id: string | null;
  propietario_id: string;
  fecha_programada: string | null;
  fecha_vencimiento: string | null;
  estado: EstadoActividad;
  resultado: string | null;
  notas: string | null;
  proxima_accion: string | null;
  completada_en: string | null;
  creado_en: string;
  cuenta?: { razon_social: string } | null;
  oportunidad?: { nombre: string } | null;
  contacto?: { nombre: string } | null;
  lead?: { nombre: string } | null;
  propietario?: { nombre: string } | null;
}

export interface Oportunidad {
  id: string;
  nombre: string;
  cuenta_id: string;
  propietario_id: string;
  etapa_id: string;
  pilar_id: number | null;
  linea_servicio_id: string | null;
  servicio_id: string | null;
  modalidad_contrato: ModalidadContrato;
  monto: number;
  moneda: Moneda;
  probabilidad: number | null;
  fecha_cierre_estimada: string | null;
  motivo_perdida_id: string | null;
  motivo_perdida_detalle: string | null;
  cerrada_en: string | null;
  ultimo_contacto_en: string | null;
  creado_en: string;
  cuenta?: { razon_social: string } | null;
  propietario?: { nombre: string } | null;
  servicio?: { nombre: string } | null;
}

// ---------------------------------------------------------------------------
// Mercado nacional (base de proyectos importables — solo admin/gerente)
// ---------------------------------------------------------------------------
export type EstadoProyectoMercado = "sin_asignar" | "asignado" | "convertido";
export type PrioridadProyecto = "alta" | "media" | "baja";

/** Ciclo de vida de un proyecto industrial (Fase 8; 'exploracion' desde 0014). */
export type EtapaProyecto =
  | "exploracion"
  | "perfil"
  | "prefactibilidad"
  | "factibilidad"
  | "ingenieria_basica"
  | "ingenieria_detalle"
  | "en_licitacion"
  | "construccion"
  | "comisionamiento"
  | "operacion"
  | "paralizado"
  | "cerrado";

export type CubetaScoring =
  | "objetivo_pilar_1"
  | "objetivo_pilar_2"
  | "objetivo_pilar_3"
  | "om_hse_recurrente"
  | "descarte";

/** Desglose auditable del score (0018): por qué puntuó lo que puntuó. */
export interface ScoreDetalle {
  version: string;
  total: number;
  cubeta: CubetaScoring | null;
  pilar_primario: string | null;
  pilares_secundarios: string[];
  factores: Record<
    "etapa" | "capex" | "sector" | "contactabilidad" | "cliente_historico",
    { puntos: number; max: number; detalle: string }
  >;
}

export interface ProyectoMercado {
  id: string;
  nombre: string;
  empresa: string;
  rubro: string | null;
  region: string | null;
  monto_estimado: number | null;
  moneda: Moneda;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  contacto_email: string | null;
  fuente: string | null;
  estado: EstadoProyectoMercado;
  asignado_a: string | null;
  asignado_en: string | null;
  asignado_por: string | null;
  lead_id: string | null;
  importado_por: string;
  creado_en: string;
  /** Desde la migración 0007 (asignación mejorada); antes vienen undefined. */
  prioridad?: PrioridadProyecto;
  fecha_limite_contacto?: string | null;
  nota_asignacion?: string | null;
  dias_alerta_sin_gestion?: number;
  /** Fase 8 (0011/0014/0018): radar con scoring. */
  etapa?: EtapaProyecto | null;
  cuenta_id?: string | null;
  capex_musd?: number | null;
  sector?: string | null;
  subsector?: string | null;
  es_watchlist?: boolean;
  motivo_descarte?: string | null;
  inicio_construccion?: string | null;
  puesta_en_marcha?: string | null;
  score?: number | null;
  score_detalle?: ScoreDetalle | null;
  cubeta?: CubetaScoring | null;
  /** join opcional */
  asignado?: { nombre: string } | null;
}

export type EntidadNota = "cuenta" | "oportunidad" | "contacto" | "lead";

/** Nota interna: visible para quien ve el registro padre (RLS heredada). */
export interface Nota {
  id: string;
  entidad: EntidadNota;
  entidad_id: string;
  autor_id: string;
  contenido: string;
  creado_en: string;
  /** join opcional */
  autor?: { nombre: string } | null;
}

export interface Notificacion {
  id: string;
  usuario_id: string;
  tipo: string; // recordatorio | seguimiento | aprobacion | alerta_gerencial
  titulo: string;
  mensaje: string;
  entidad: string | null;
  entidad_id: string | null;
  leida: boolean;
  creado_en: string;
}
