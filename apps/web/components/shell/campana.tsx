"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { es, formatearFechaCorta, formatearHora, type Notificacion } from "@diprem/core";
import {
  listarNotificacionesNoLeidas,
  marcarNotificacionLeida,
  marcarTodasNotificacionesLeidas,
} from "@diprem/api";
import { usePerfil, useSupabase } from "@/lib/hooks";
import { rutaNotificacion } from "@/lib/notificaciones";

/**
 * 🔔 Campana del header: badge con no leídas y panel con asignaciones,
 * recordatorios, alertas, notas internas y el reporte semanal.
 */
export function Campana() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: perfil } = usePerfil();
  const [abierta, setAbierta] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data: notificaciones } = useQuery({
    queryKey: ["notificaciones", "no-leidas"],
    queryFn: () => listarNotificacionesNoLeidas(supabase),
    refetchInterval: 60_000,
  });

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!abierta) return;
    const manejar = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setAbierta(false);
    };
    window.addEventListener("mousedown", manejar);
    return () => window.removeEventListener("mousedown", manejar);
  }, [abierta]);

  const invalidar = () =>
    void queryClient.invalidateQueries({ queryKey: ["notificaciones"] });

  const marcar = useMutation({
    mutationFn: (id: string) => marcarNotificacionLeida(supabase, id),
    onSuccess: invalidar,
  });
  const marcarTodas = useMutation({
    mutationFn: () => marcarTodasNotificacionesLeidas(supabase, perfil!.id),
    onSuccess: invalidar,
  });

  const abrir = (notificacion: Notificacion) => {
    marcar.mutate(notificacion.id);
    const ruta = rutaNotificacion(notificacion);
    if (ruta) {
      setAbierta(false);
      router.push(ruta);
    }
  };

  const pendientes = notificaciones?.length ?? 0;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setAbierta((v) => !v)}
        aria-label={es.notificaciones.campana}
        aria-expanded={abierta}
        className="relative rounded-xl p-2 text-tinta-suave transition-colors hover:bg-superficie-2 hover:text-tinta"
      >
        <Bell className="h-5 w-5" />
        {pendientes > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {pendientes > 9 ? "9+" : pendientes}
          </span>
        )}
      </button>

      {abierta && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-xl border border-borde bg-superficie shadow-xl sm:w-96">
          <div className="flex items-center justify-between border-b border-borde px-4 py-2.5">
            <p className="text-sm font-semibold text-tinta">
              {es.notificaciones.campana}
            </p>
            {pendientes > 0 && perfil && (
              <button
                onClick={() => marcarTodas.mutate()}
                className="inline-flex items-center gap-1 text-xs text-primario hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" /> {es.notificaciones.marcarTodas}
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {pendientes === 0 && (
              <p className="px-4 py-8 text-center text-sm text-tinta-tenue">
                {es.notificaciones.sinNotificaciones}
              </p>
            )}
            {notificaciones?.map((notificacion) => (
              <button
                key={notificacion.id}
                onClick={() => abrir(notificacion)}
                className="block w-full border-b border-borde px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-superficie-2"
              >
                <p className="text-sm font-semibold text-tinta">
                  {notificacion.titulo}
                  <span className="ml-2 text-xs font-normal text-tinta-tenue">
                    {formatearFechaCorta(notificacion.creado_en)}{" "}
                    {formatearHora(notificacion.creado_en)}
                  </span>
                </p>
                <p className="mt-0.5 line-clamp-2 text-sm text-tinta-suave">
                  {notificacion.mensaje}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
