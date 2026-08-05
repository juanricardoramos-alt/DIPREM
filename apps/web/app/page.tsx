import { redirect } from "next/navigation";

/**
 * Entrada de la app. El middleware de Neon Auth garantiza que aquí solo llegan
 * usuarios con sesión; los enruta a "Mi Día". El gate por perfil/rol se resuelve
 * en la sección (app) (ShellApp, client-side): un usuario de solo lectura, por
 * ejemplo, es reenrutado desde allí a su pantalla inicial.
 */
export default function Inicio() {
  redirect("/mi-dia");
}
