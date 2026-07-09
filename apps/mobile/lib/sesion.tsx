import { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Usuario } from "@diprem/core";
import { obtenerPerfil } from "@diprem/api";
import { supabase } from "./supabase";

interface EstadoSesion {
  sesion: Session | null;
  perfil: Usuario | null;
  cargando: boolean;
}

const ContextoSesion = createContext<EstadoSesion>({
  sesion: null,
  perfil: null,
  cargando: true,
});

export function ProveedorSesion({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<EstadoSesion>({
    sesion: null,
    perfil: null,
    cargando: true,
  });

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const perfil = session ? await obtenerPerfil(supabase) : null;
      setEstado({ sesion: session, perfil, cargando: false });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_evento, session) => {
      const perfil = session ? await obtenerPerfil(supabase) : null;
      setEstado({ sesion: session, perfil, cargando: false });
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <ContextoSesion.Provider value={estado}>{children}</ContextoSesion.Provider>
  );
}

export function useSesion() {
  return useContext(ContextoSesion);
}
