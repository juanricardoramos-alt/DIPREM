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

export const ITEMS_NAVEGACION: readonly ItemNavegacion[] = [
  { ruta: "/control", etiqueta: es.nav.control, roles: ["gerente", "admin", "revisor"] },
  { ruta: "/mi-dia", etiqueta: es.nav.miDia, roles: OPERATIVOS },
  { ruta: "/empresas", etiqueta: es.nav.cuentas, roles: TODOS },
  { ruta: "/leads", etiqueta: es.crm.leads, roles: OPERATIVOS },
  { ruta: "/oportunidades", etiqueta: es.nav.oportunidades, roles: TODOS },
  { ruta: "/actividades", etiqueta: es.nav.actividades, roles: [...OPERATIVOS, "revisor"] },
  { ruta: "/propuestas", etiqueta: es.nav.propuestas, roles: TODOS },
  { ruta: "/mercado", etiqueta: es.nav.mercado, roles: ["gerente", "admin", "revisor"] },
  { ruta: "/reportes", etiqueta: es.nav.reportes, roles: TODOS },
  { ruta: "/admin", etiqueta: es.nav.admin, roles: ["admin"] },
] as const;

export function itemsParaRol(rol: RolUsuario): ItemNavegacion[] {
  return ITEMS_NAVEGACION.filter((item) => item.roles.includes(rol));
}

/** Ruta inicial tras el login según el rol (los de consulta no tienen "Mi Día"). */
export function rutaInicial(rol: RolUsuario): string {
  if (rol === "revisor") return "/control";
  return rol === "lectura" ? "/reportes" : "/mi-dia";
}
