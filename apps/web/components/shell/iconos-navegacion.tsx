import {
  BarChart3,
  Building2,
  CalendarCheck,
  FileText,
  LayoutDashboard,
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
  "/mi-dia": Sun,
  "/cuentas": Building2,
  "/leads": UserPlus,
  "/oportunidades": SquareKanban,
  "/actividades": CalendarCheck,
  "/propuestas": FileText,
  "/mercado": Store,
  "/reportes": BarChart3,
  "/admin": Settings,
};
