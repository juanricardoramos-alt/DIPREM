import type { RolUsuario } from "../types/dominio";
import { es } from "../strings/es";

export interface ItemNavegacion {
  ruta: string;
  etiqueta: string;
  /** Roles que ven este item (RBAC de UI; la RLS de BD es la barrera real). */
  roles: readonly RolUsuario[];
}

const TODOS: readonly RolUsuario[] = ["ejecutivo", "gerente", "admin", "revisor", "lectura"];
const OPERATIVOS: readonly RolUsuario[] = ["ejecutivo", "gerente", "admin"];

/**
 * Orden pensado por perfil: la tab bar móvil toma los primeros 4 visibles.
 * Ejecutivo → Mi Día, Empresas, Oportunidades, Actividades.
 * Gerente/Admin (director/dueño) → Control, Reporte diario, Mi Día, Empresas.
 */
export const ITEMS_NAVEGACION: readonly ItemNavegacion[] = [
  { ruta: "/control", etiqueta: es.nav.control, roles: ["gerente", "admin", "revisor"] },
  { ruta: "/control/diario", etiqueta: es.nav.reporteDiario, roles: ["gerente", "admin", "revisor"] },
  { ruta: "/mi-dia", etiqueta: es.nav.miDia, roles: OPERATIVOS },
  { ruta: "/empresas", etiqueta: es.nav.cuentas, roles: TODOS },
  { ruta: "/oportunidades", etiqueta: es.nav.oportunidades, roles: TODOS },
  { ruta: "/actividades", etiqueta: es.nav.actividades, roles: [...OPERATIVOS, "revisor"] },
  { ruta: "/leads", etiqueta: es.crm.leads, roles: OPERATIVOS },
  { ruta: "/mercado", etiqueta: es.nav.mercado, roles: ["gerente", "admin", "revisor"] },
  { ruta: "/reportes", etiqueta: es.nav.reportes, roles: TODOS },
  { ruta: "/propuestas", etiqueta: es.nav.propuestas, roles: TODOS },
  { ruta: "/admin", etiqueta: es.nav.admin, roles: ["admin"] },
] as const;

export function itemsParaRol(rol: RolUsuario): ItemNavegacion[] {
  return ITEMS_NAVEGACION.filter((item) => item.roles.includes(rol));
}

/**
 * Ruta del ítem activo para el pathname actual: gana la coincidencia más
 * específica ("/control/diario" no enciende también "/control").
 */
export function rutaActiva(
  pathname: string,
  items: readonly ItemNavegacion[],
): string | null {
  let mejor: string | null = null;
  for (const item of items) {
    if (pathname === item.ruta || pathname.startsWith(`${item.ruta}/`)) {
      if (!mejor || item.ruta.length > mejor.length) mejor = item.ruta;
    }
  }
  return mejor;
}

/**
 * Ruta inicial tras el login según el rol: quien dirige (gerente, dueño,
 * revisor) entra al Control; el ejecutivo a su día; los de consulta a Reportes.
 */
export function rutaInicial(rol: RolUsuario): string {
  if (rol === "gerente" || rol === "admin" || rol === "revisor") return "/control";
  return rol === "lectura" ? "/reportes" : "/mi-dia";
}
