"use client";

import { useState } from "react";
import { es, type RolUsuario } from "@diprem/core";
import { DashboardEquipo } from "@/components/reportes/dashboard-equipo";
import { DashboardEjecutivo } from "@/components/reportes/dashboard-ejecutivo";
import { Exportes } from "@/components/reportes/exportes";

export function ReportesCliente({
  rol,
  usuarioId,
}: {
  rol: RolUsuario;
  usuarioId: string;
}) {
  // Ejecutivo → su desempeño. Gerente/Admin/Lectura → equipo (+ pestaña propia si vende)
  const veEquipo = rol !== "ejecutivo";
  const vePropio = rol === "ejecutivo" || rol === "gerente";
  const [pestana, setPestana] = useState<"equipo" | "mio">(veEquipo ? "equipo" : "mio");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{es.nav.reportes}</h1>
        {veEquipo && vePropio && (
          <div className="flex rounded-lg bg-superficie-2 p-1 print:hidden">
            {(["equipo", "mio"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPestana(p)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium ${
                  pestana === p ? "bg-superficie shadow-sm text-primario" : "text-tinta-suave"
                }`}
              >
                {p === "equipo" ? es.reportes.pestanaEquipo : es.reportes.pestanaMio}
              </button>
            ))}
          </div>
        )}
      </div>

      {pestana === "equipo" && veEquipo ? (
        <DashboardEquipo />
      ) : (
        <DashboardEjecutivo usuarioId={usuarioId} />
      )}

      <Exportes />
    </div>
  );
}
