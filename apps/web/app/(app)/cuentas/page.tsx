"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ETIQUETAS_ESTADO_CUENTA,
  ETIQUETAS_VERTICAL,
  es,
} from "@diprem/core";
import { listarCuentas } from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { Boton, Entrada, Insignia } from "@/components/ui";
import { FormularioCuenta } from "@/components/formulario-cuenta";

const TONO_ESTADO = { prospecto: "ambar", activa: "verde", inactiva: "gris" } as const;

export default function PaginaCuentas() {
  const supabase = useSupabase();
  const [busqueda, setBusqueda] = useState("");
  const [formAbierto, setFormAbierto] = useState(false);

  const { data: cuentas, isLoading } = useQuery({
    queryKey: ["cuentas", busqueda],
    queryFn: () => listarCuentas(supabase, busqueda),
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{es.nav.cuentas}</h1>
        <div className="flex items-center gap-2">
          <Entrada
            placeholder={es.comunes.buscar}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-56 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <Boton onClick={() => setFormAbierto(true)}>+ {es.crm.nuevaCuenta}</Boton>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">{es.crm.razonSocial}</th>
              <th className="px-4 py-3">{es.crm.vertical}</th>
              <th className="px-4 py-3">{es.crm.pais}</th>
              <th className="px-4 py-3">{es.crm.propietario}</th>
              <th className="px-4 py-3">{es.crm.estado}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  {es.comunes.cargando}
                </td>
              </tr>
            )}
            {!isLoading && (cuentas?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  {es.crm.sinCuentas}
                </td>
              </tr>
            )}
            {cuentas?.map((cuenta) => (
              <tr key={cuenta.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/cuentas/${cuenta.id}`}
                    className="font-medium text-[var(--color-diprem)] hover:underline"
                  >
                    {cuenta.razon_social}
                  </Link>
                </td>
                <td className="px-4 py-3">{ETIQUETAS_VERTICAL[cuenta.vertical]}</td>
                <td className="px-4 py-3">{cuenta.pais ?? "—"}</td>
                <td className="px-4 py-3">{cuenta.propietario?.nombre ?? "—"}</td>
                <td className="px-4 py-3">
                  <Insignia tono={TONO_ESTADO[cuenta.estado]}>
                    {ETIQUETAS_ESTADO_CUENTA[cuenta.estado]}
                  </Insignia>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FormularioCuenta abierto={formAbierto} onCerrar={() => setFormAbierto(false)} />
    </div>
  );
}
