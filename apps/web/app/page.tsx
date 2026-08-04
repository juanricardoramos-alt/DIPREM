import { redirect } from "next/navigation";

/**
 * Entrada de la app. El middleware de Neon Auth garantiza que aquí solo llegan
 * usuarios con sesión; los enruta a la página de estado (Fase 2). En Fase 3,
 * cuando las pantallas del CRM estén sobre la Data API, esto volverá a enrutar
 * por rol a "Mi Día" / panel según corresponda.
 */
export default function Inicio() {
  redirect("/estado");
}
