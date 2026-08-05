import type {
  CalificacionLead,
  CanalContacto,
  EstadoActividad,
  EstadoCuenta,
  EstadoLead,
  EtapaProyecto,
  FuenteLead,
  ModalidadContrato,
  PrioridadProyecto,
  TipoActividad,
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

/** Idioma DIPREM: la visita es "a terreno" (faena / obra / planta). */
export const ETIQUETAS_TIPO_ACTIVIDAD: Record<TipoActividad, string> = {
  llamada: "Llamada",
  reunion: "Reunión",
  visita_terreno: "Visita a terreno",
  email: "Correo",
  whatsapp: "WhatsApp",
  tarea: "Tarea",
};

export const ICONOS_TIPO_ACTIVIDAD: Record<TipoActividad, string> = {
  llamada: "📞",
  reunion: "🤝",
  visita_terreno: "🏗️",
  email: "✉️",
  whatsapp: "💬",
  tarea: "☑️",
};

export const ETIQUETAS_ESTADO_ACTIVIDAD: Record<EstadoActividad, string> = {
  pendiente: "Pendiente",
  completada: "Completada",
  cancelada: "Cancelada",
};

export const ETIQUETAS_PRIORIDAD: Record<PrioridadProyecto, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

/** Orden para listas: alta primero. */
export const ORDEN_PRIORIDAD: Record<PrioridadProyecto, number> = {
  alta: 0,
  media: 1,
  baja: 2,
};

export const ETIQUETAS_ETAPA_PROYECTO: Record<EtapaProyecto, string> = {
  exploracion: "Exploración",
  perfil: "Perfil",
  prefactibilidad: "Prefactibilidad",
  factibilidad: "Factibilidad",
  ingenieria_basica: "Ingeniería básica",
  ingenieria_detalle: "Ingeniería de detalle",
  en_licitacion: "En licitación",
  construccion: "Construcción",
  comisionamiento: "Comisionamiento",
  operacion: "Operación",
  paralizado: "Paralizado",
  cerrado: "Cerrado",
};
