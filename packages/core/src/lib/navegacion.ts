import type { RolUsuario } from "../types/dominio";
import { es } from "../strings/es";

export interface ItemNavegacion {
  ruta: string;
  etiqueta: string;
  /** Roles que ven este item (RBAC de UI; la RLS de BD es la barrera real). */
  roles: readonly RolUsuario[];
}

const TODOS: readonly RolUsuario[] = ["ejecutivo", "gerente", "admin", "lectura"];
const OPERATIVOS: readonly RolUsuario[] = ["ejecutivo", "gerente", "admin"];

export const ITEMS_NAVEGACION: readonly ItemNavegacion[] = [
  { ruta: "/mi-dia", etiqueta: es.nav.miDia, roles: OPERATIVOS },
  { ruta: "/cuentas", etiqueta: es.nav.cuentas, roles: TODOS },
  { ruta: "/oportunidades", etiqueta: es.nav.oportunidades, roles: TODOS },
  { ruta: "/actividades", etiqueta: es.nav.actividades, roles: OPERATIVOS },
  { ruta: "/propuestas", etiqueta: es.nav.propuestas, roles: TODOS },
  { ruta: "/reportes", etiqueta: es.nav.reportes, roles: TODOS },
  { ruta: "/admin", etiqueta: es.nav.admin, roles: ["admin"] },
] as const;

export function itemsParaRol(rol: RolUsuario): ItemNavegacion[] {
  return ITEMS_NAVEGACION.filter((item) => item.roles.includes(rol));
}

/** Ruta inicial tras el login según el rol (lectura no tiene "Mi Día"). */
export function rutaInicial(rol: RolUsuario): string {
  return rol === "lectura" ? "/reportes" : "/mi-dia";
}
