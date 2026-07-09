/**
 * Tipos de dominio DIPREM — espejo de los enums y tablas núcleo del esquema SQL
 * (docs/PLAN-ARQUITECTURA.md §4). Los tipos completos de la BD se generarán con
 * `supabase gen types` en Fase 1; estos tipos manuales cubren lo que usa la Fase 0.
 */

export type RolUsuario = "ejecutivo" | "gerente" | "admin" | "lectura";

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
  telefono: string | null;
  email: string | null;
  canal_preferido: CanalContacto | null;
  es_principal: boolean;
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
