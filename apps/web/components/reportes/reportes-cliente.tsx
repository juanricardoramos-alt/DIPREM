"use client";

import { useState } from "react";
import { es, type RolUsuario } from "@diprem/core";
import { DashboardEquipo } from "@/components/reportes/dashboard-equipo";
import { DashboardEjecutivo } from "@/components/reportes/dashboard-ejecutivo";
import { ReporteSemanal } from "@/components/reportes/reporte-semanal";
import { ReportePipeline } from "@/components/reportes/reporte-pipeline";
import { ReporteConversion } from "@/components/reportes/reporte-conversion";
import { Exportes } from "@/components/reportes/exportes";

type Pestana = "equipo" | "semanal" | "pipeline" | "conversion" | "mio";

export function ReportesCliente({
  rol,
  usuarioId,
}: {
  rol: RolUsuario;
  usuarioId: string;
}) {
  // Ejecutivo → su desempeño. Gerente/Admin/Lectura → reportes del equipo
  const veEquipo = rol !== "ejecutivo";
  const vePropio = rol === "ejecutivo" || rol === "gerente";
  const [pestana, setPestana] = useState<Pestana>(veEquipo ? "equipo" : "mio");

  const pestanas: { clave: Pestana; etiqueta: string }[] = [
    ...(veEquipo
      ? ([
          { clave: "equipo", etiqueta: es.reportes.pestanaEquipo },
          { clave: "semanal", etiqueta: es.reportes.pestanaSemanal },
          { clave: "pipeline", etiqueta: es.reportes.pestanaPipeline },
          { clave: "conversion", etiqueta: es.reportes.pestanaConversion },
        ] as const)
      : []),
    ...(vePropio ? ([{ clave: "mio", etiqueta: es.reportes.pestanaMio }] as const) : []),
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{es.nav.reportes}</h1>
        {pestanas.length > 1 && (
          <div className="flex flex-wrap rounded-lg bg-superficie-2 p-1 print:hidden">
            {pestanas.map((p) => (
              <button
                key={p.clave}
                onClick={() => setPestana(p.clave)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  pestana === p.clave
                    ? "bg-superficie text-primario shadow-sm"
                    : "text-tinta-suave hover:text-tinta"
                }`}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>
        )}
      </div>

      {pestana === "equipo" && veEquipo && <DashboardEquipo />}
      {pestana === "semanal" && veEquipo && <ReporteSemanal />}
      {pestana === "pipeline" && veEquipo && <ReportePipeline />}
      {pestana === "conversion" && veEquipo && <ReporteConversion />}
      {pestana === "mio" && <DashboardEjecutivo usuarioId={usuarioId} />}

      {(pestana === "equipo" || pestana === "mio") && <Exportes />}
    </div>
  );
}
