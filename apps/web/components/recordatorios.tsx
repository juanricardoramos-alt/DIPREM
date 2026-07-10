"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, X } from "lucide-react";
import { es, formatearFechaCorta } from "@diprem/core";
import { listarNotificacionesNoLeidas, marcarNotificacionLeida } from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { rutaNotificacion } from "@/lib/notificaciones";

/**
 * Recordatorios in-app no leídos (p. ej. "Recordar" del Panel de Control).
 * Se muestran destacados en Mi Día; la campana global llega en la Fase 7
 * y reutilizará estas mismas notificaciones.
 */
export function Recordatorios() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();

  const { data: notificaciones } = useQuery({
    queryKey: ["notificaciones", "no-leidas"],
    queryFn: () => listarNotificacionesNoLeidas(supabase),
    refetchInterval: 60_000,
  });

  const marcar = useMutation({
    mutationFn: (id: string) => marcarNotificacionLeida(supabase, id),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["notificaciones"] }),
  });

  if (!notificaciones || notificaciones.length === 0) return null;

  return (
    <section className="mt-5 space-y-2">
      {notificaciones.map((notificacion) => {
        const ruta = rutaNotificacion(notificacion);
        return (
          <div
            key={notificacion.id}
            className="flex items-start gap-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
          >
            <BellRing className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {notificacion.titulo}
                <span className="ml-2 text-xs font-normal opacity-70">
                  {formatearFechaCorta(notificacion.creado_en)}
                </span>
              </p>
              <p className="mt-0.5">{notificacion.mensaje}</p>
              {ruta && (
                <Link
                  href={ruta}
                  className="mt-1 inline-block font-medium underline underline-offset-2"
                  onClick={() => marcar.mutate(notificacion.id)}
                >
                  {es.control.verLead} →
                </Link>
              )}
            </div>
            <button
              aria-label={es.notificaciones.marcarLeida}
              title={es.notificaciones.marcarLeida}
              onClick={() => marcar.mutate(notificacion.id)}
              className="rounded-lg p-1 opacity-60 transition-opacity hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </section>
  );
}
