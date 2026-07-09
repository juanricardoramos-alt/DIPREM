"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { obtenerEquipo, obtenerPerfil } from "@diprem/api";
import { clienteNavegador } from "@/lib/supabase/navegador";

/** Cliente Supabase memoizado para componentes cliente. */
export function useSupabase() {
  return useMemo(() => clienteNavegador(), []);
}

/** Perfil del usuario autenticado (fila de `usuarios`). */
export function usePerfil() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["perfil"],
    queryFn: () => obtenerPerfil(supabase),
    staleTime: 5 * 60_000,
  });
}

/** Equipo del usuario (para moneda por defecto en formularios). */
export function useEquipo(equipoId: string | null | undefined) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["equipo", equipoId],
    queryFn: () => obtenerEquipo(supabase, equipoId ?? null),
    enabled: equipoId !== undefined,
    staleTime: 5 * 60_000,
  });
}
