"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { es, formatearFechaCorta, formatearHora } from "@diprem/core";
import { listarHistorialAsignaciones } from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { EstadoVacio, FilasEsqueleto, Insignia } from "@/components/ui";

const TONO_ESTADO = {
  sin_asignar: "ambar",
  asignado: "azul",
  convertido: "verde",
} as const;

/** Trazabilidad: quién asignó qué proyecto, a quién y cuándo. */
export function HistorialAsignaciones() {
  const supabase = useSupabase();
  const { data: historial, isLoading } = useQuery({
    queryKey: ["historial_asignaciones"],
    queryFn: () => listarHistorialAsignaciones(supabase),
    retry: false,
  });

  return (
    <section>
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <History className="h-5 w-5 text-primario" /> {es.control.historialTitulo}
      </h2>
      <p className="text-sm text-tinta-suave">{es.control.historialNota}</p>

      <div className="mt-3 overflow-x-auto rounded-xl border border-borde bg-superficie">
        <table className="w-full text-sm">
          <thead className="bg-superficie-2 text-left text-xs uppercase text-tinta-suave">
            <tr>
              <th className="px-4 py-3">{es.control.colProyecto}</th>
              <th className="px-4 py-3">{es.control.colAsignadoA}</th>
              <th className="px-4 py-3">{es.control.colAsignadoPor}</th>
              <th className="px-4 py-3">{es.control.colFecha}</th>
              <th className="px-4 py-3">{es.control.colEstado}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <FilasEsqueleto columnas={5} />}
            {!isLoading && (historial?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={5} className="p-4">
                  <EstadoVacio titulo={es.control.sinAsignaciones} />
                </td>
              </tr>
            )}
            {historial?.map((fila) => (
              <tr key={fila.id} className="border-t border-borde hover:bg-superficie-2">
                <td className="px-4 py-3">
                  {fila.lead_id ? (
                    <Link
                      href={`/leads/${fila.lead_id}`}
                      className="font-medium hover:text-primario hover:underline"
                    >
                      {fila.proyecto}
                    </Link>
                  ) : (
                    <span className="font-medium">{fila.proyecto}</span>
                  )}
                  <p className="text-xs text-tinta-tenue">{fila.empresa}</p>
                </td>
                <td className="px-4 py-3">{fila.asignado_a_nombre ?? "—"}</td>
                <td className="px-4 py-3">{fila.asignado_por_nombre ?? "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap text-tinta-suave">
                  {formatearFechaCorta(fila.asignado_en)}{" "}
                  {formatearHora(fila.asignado_en)}
                </td>
                <td className="px-4 py-3">
                  <Insignia tono={TONO_ESTADO[fila.estado]}>
                    {es.mercado.estados[fila.estado]}
                  </Insignia>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
