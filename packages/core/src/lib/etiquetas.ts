import type {
  CalificacionLead,
  CanalContacto,
  EstadoCuenta,
  EstadoLead,
  FuenteLead,
  ModalidadContrato,
  VerticalCuenta,
} from "../types/dominio";

/** Etiquetas visibles en español para los enums de la BD (idioma DIPREM). */

export const ETIQUETAS_VERTICAL: Record<VerticalCuenta, string> = {
  mineria: "Minería",
  energia: "Energía",
  infraestructura: "Infraestructura",
  construccion: "Construcción",
  industrial: "Industrial",
  oil_gas: "Oil & Gas",
  otro: "Otro",
};

export const ETIQUETAS_ESTADO_CUENTA: Record<EstadoCuenta, string> = {
  prospecto: "Prospecto",
  activa: "Activa",
  inactiva: "Inactiva",
};

export const ETIQUETAS_FUENTE: Record<FuenteLead, string> = {
  referido: "Referido",
  licitacion: "Licitación",
  web: "Web",
  evento: "Evento",
  linkedin: "LinkedIn",
  red_comercial: "Red comercial",
  otro: "Otro",
};

export const ETIQUETAS_CALIFICACION: Record<CalificacionLead, string> = {
  frio: "Frío ❄️",
  tibio: "Tibio 🌤",
  caliente: "Caliente 🔥",
};

export const ETIQUETAS_ESTADO_LEAD: Record<EstadoLead, string> = {
  nuevo: "Nuevo",
  en_gestion: "En gestión",
  convertido: "Convertido",
  descartado: "Descartado",
};

export const ETIQUETAS_MODALIDAD: Record<ModalidadContrato, string> = {
  proyecto: "Proyecto",
  mensual_recurrente: "Mensual recurrente",
  outsourcing: "Outsourcing",
};

export const ETIQUETAS_CANAL: Record<CanalContacto, string> = {
  llamada: "Llamada",
  email: "Correo",
  whatsapp: "WhatsApp",
  reunion: "Reunión",
};
