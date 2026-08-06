import {
  BarChart3,
  Building2,
  CalendarCheck,
  LayoutDashboard,
  Newspaper,
  Settings,
  SquareKanban,
  Store,
  Sun,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

/** Ícono lucide por ruta de navegación (mismas rutas que ITEMS_NAVEGACION). */
export const ICONOS_RUTA: Record<string, LucideIcon> = {
  "/control": LayoutDashboard,
  "/control/diario": Newspaper,
  "/mi-dia": Sun,
  "/empresas": Building2,
  "/leads": UserPlus,
  "/oportunidades": SquareKanban,
  "/actividades": CalendarCheck,
  "/mercado": Store,
  "/reportes": BarChart3,
  "/admin": Settings,
};
