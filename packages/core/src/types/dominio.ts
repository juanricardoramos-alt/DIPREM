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
