import { Proveedores } from "@/components/proveedores";
import { ShellApp } from "@/components/shell/shell-app";

/**
 * Layout de la sección (app). Thin: provee TanStack Query y delega el gate de
 * perfil + el shell a ShellApp (client), que resuelve el perfil por la Data API
 * (Fase 3). El middleware de Neon Auth ya bloquea a quien no tiene sesión.
 */
export default function LayoutApp({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Proveedores>
      <ShellApp>{children}</ShellApp>
    </Proveedores>
  );
}
