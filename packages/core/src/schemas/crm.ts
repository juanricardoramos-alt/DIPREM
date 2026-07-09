import { z } from "zod";

/** Esquemas de formularios CRM (compartidos web/móvil). */

const textoOpcional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

export const esquemaCuenta = z.object({
  razon_social: z.string().trim().min(1, "La razón social es obligatoria"),
  tax_id: textoOpcional,
  vertical: z.enum([
    "mineria", "energia", "infraestructura", "construccion",
    "industrial", "oil_gas", "otro",
  ]),
  pais: textoOpcional,
  ciudad: textoOpcional,
  sitio_web: textoOpcional,
  estado: z.enum(["prospecto", "activa", "inactiva"]).default("prospecto"),
});
export type DatosCuenta = z.input<typeof esquemaCuenta>;

export const esquemaContacto = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  cargo: textoOpcional,
  telefono: textoOpcional,
  email: z
    .string()
    .trim()
    .email("Correo inválido")
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  canal_preferido: z.enum(["llamada", "email", "whatsapp", "reunion"]).default("email"),
  es_principal: z.boolean().default(false),
});
export type DatosContacto = z.input<typeof esquemaContacto>;

export const esquemaLead = z.object({
  nombre: z.string().trim().min(1, "El nombre del contacto es obligatorio"),
  empresa: textoOpcional,
  telefono: textoOpcional,
  email: z
    .string()
    .trim()
    .email("Correo inválido")
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  fuente: z.enum([
    "referido", "licitacion", "web", "evento", "linkedin", "red_comercial", "otro",
  ]),
  calificacion: z.enum(["frio", "tibio", "caliente"]).default("tibio"),
  notas: textoOpcional,
});
export type DatosLead = z.input<typeof esquemaLead>;

export const esquemaOportunidad = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  cuenta_id: z.string().uuid("Selecciona una cuenta"),
  monto: z.coerce.number().min(0, "El monto no puede ser negativo").default(0),
  moneda: z.enum([
    "USD", "CLP", "ARS", "COP", "BRL", "MXN", "PEN",
    "CAD", "UYU", "BOB", "GTQ", "DOP", "EUR",
  ]),
  modalidad_contrato: z
    .enum(["proyecto", "mensual_recurrente", "outsourcing"])
    .default("proyecto"),
  pilar_id: z.coerce.number().int().min(1).max(3).nullable().optional(),
  linea_servicio_id: z.string().uuid().nullable().optional(),
  servicio_id: z.string().uuid().nullable().optional(),
  fecha_cierre_estimada: textoOpcional,
});
export type DatosOportunidad = z.input<typeof esquemaOportunidad>;

export const esquemaActividad = z.object({
  tipo: z.enum(["llamada", "reunion", "visita_terreno", "email", "whatsapp", "tarea"]),
  asunto: z.string().trim().min(1, "El asunto es obligatorio"),
  cuenta_id: z.string().uuid().nullable().optional(),
  oportunidad_id: z.string().uuid().nullable().optional(),
  contacto_id: z.string().uuid().nullable().optional(),
  fecha_programada: textoOpcional,
  fecha_vencimiento: textoOpcional,
  notas: textoOpcional,
  proxima_accion: textoOpcional,
});
export type DatosActividad = z.input<typeof esquemaActividad>;

export const esquemaCompletarActividad = z.object({
  resultado: textoOpcional,
  proxima_accion: textoOpcional,
});
export type DatosCompletarActividad = z.input<typeof esquemaCompletarActividad>;

export const esquemaConversionLead = z.object({
  razon_social: z.string().trim().min(1, "La razón social es obligatoria"),
  nombre_oportunidad: textoOpcional,
  monto: z.coerce.number().min(0).default(0),
  vertical: z.enum([
    "mineria", "energia", "infraestructura", "construccion",
    "industrial", "oil_gas", "otro",
  ]),
  pilar_id: z.coerce.number().int().min(1).max(3).nullable().optional(),
  modalidad: z
    .enum(["proyecto", "mensual_recurrente", "outsourcing"])
    .default("proyecto"),
});
export type DatosConversionLead = z.input<typeof esquemaConversionLead>;
