/**
 * Textos de UI centralizados (español). Único lugar donde viven los strings
 * visibles, compartido por web y móvil — preparado para i18n futuro (pt/en).
 */
export const es = {
  app: {
    nombre: "DIPREM CRM",
    lema: "Gestión comercial DIPREM",
  },
  auth: {
    titulo: "Iniciar sesión",
    email: "Correo electrónico",
    password: "Contraseña",
    entrar: "Entrar",
    entrando: "Entrando…",
    salir: "Cerrar sesión",
    errores: {
      emailRequerido: "Ingresa tu correo",
      emailInvalido: "Correo inválido",
      passwordCorta: "La contraseña debe tener al menos 6 caracteres",
      credenciales: "Correo o contraseña incorrectos",
      generico: "No se pudo iniciar sesión. Intenta de nuevo.",
    },
  },
  nav: {
    miDia: "Mi Día",
    cuentas: "Cuentas",
    oportunidades: "Oportunidades",
    actividades: "Actividades",
    propuestas: "Propuestas",
    reportes: "Reportes",
    admin: "Administración",
    perfil: "Perfil",
  },
  roles: {
    ejecutivo: "Ejecutivo Comercial",
    gerente: "Gerente Comercial",
    admin: "Administrador",
    lectura: "Solo lectura",
  },
  comunes: {
    cargando: "Cargando…",
    proximamente: "Disponible en una próxima fase",
    sinAcceso: "No tienes acceso a esta sección",
  },
  fase0: {
    bienvenida: "Bienvenido/a",
    descripcionMiDia:
      "Aquí verás tu agenda del día, seguimientos pendientes y avance de metas (Fase 2).",
    descripcionCuentas: "Gestión de cuentas y contactos (Fase 1).",
    descripcionOportunidades: "Embudo de ventas DIPREM en Kanban (Fase 1).",
    descripcionActividades: "Registro de llamadas, reuniones y visitas a terreno (Fase 2).",
    descripcionPropuestas: "Propuestas con versiones y aprobación gerencial (Fase 4).",
    descripcionReportes: "KPIs y reportes exportables (Fase 3).",
    descripcionAdmin: "Embudo, servicios, usuarios, equipos y metas (por fases).",
  },
} as const;

export type Strings = typeof es;
