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
import {
  Boton,
  EncabezadoPagina,
  Entrada,
  EstadoVacio,
  FilasEsqueleto,
  Insignia,
} from "@/components/ui";
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
      <EncabezadoPagina
        titulo={es.nav.cuentas}
        acciones={
          <>
            <Entrada
              placeholder={es.comunes.buscar}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="sm:w-56 rounded-md border border-borde px-3 py-2 text-sm"
            />
            <Boton onClick={() => setFormAbierto(true)}>+ {es.crm.nuevaCuenta}</Boton>
          </>
        }
      />

      {/* Móvil: tarjetas apiladas */}
      <div className="mt-6 space-y-2 md:hidden">
        {isLoading && (
          <div className="rounded-xl border border-borde bg-superficie p-4 text-sm text-tinta-tenue">
            {es.comunes.cargando}
          </div>
        )}
        {!isLoading && (cuentas?.length ?? 0) === 0 && (
          <EstadoVacio titulo={es.crm.sinCuentas} />
        )}
        {cuentas?.map((cuenta) => (
          <Link
            key={cuenta.id}
            href={`/empresas/${cuenta.id}`}
            className="block rounded-xl border border-borde bg-superficie p-3.5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 font-semibold leading-snug text-primario">
                {cuenta.razon_social}
              </p>
              <Insignia tono={TONO_ESTADO[cuenta.estado]}>
                {ETIQUETAS_ESTADO_CUENTA[cuenta.estado]}
              </Insignia>
            </div>
            <p className="mt-1 text-xs text-tinta-suave">
              {ETIQUETAS_VERTICAL[cuenta.vertical]}
              {cuenta.pais ? ` · ${cuenta.pais}` : ""}
              {cuenta.propietario?.nombre ? ` · ${cuenta.propietario.nombre}` : ""}
            </p>
          </Link>
        ))}
      </div>

      {/* Escritorio: tabla */}
      <div className="mt-6 hidden overflow-x-auto rounded-xl border border-borde bg-superficie shadow-sm md:block">
        <table className="w-full text-sm">
          {/* Menos columnas por defecto (Fase D): el detalle vive en la ficha */}
          <thead className="bg-superficie-2 text-left text-xs uppercase text-tinta-suave">
            <tr>
              <th className="px-4 py-3">{es.crm.razonSocial}</th>
              <th className="px-4 py-3">{es.crm.propietario}</th>
              <th className="px-4 py-3">{es.crm.estado}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <FilasEsqueleto columnas={3} />}
            {!isLoading && (cuentas?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={3} className="p-4">
                  <EstadoVacio
                    titulo={es.crm.sinCuentas}
                    accion={
                      <Boton variante="secundario" onClick={() => setFormAbierto(true)}>
                        + {es.crm.nuevaCuenta}
                      </Boton>
                    }
                  />
                </td>
              </tr>
            )}
            {cuentas?.map((cuenta) => (
              <tr key={cuenta.id} className="border-t border-borde hover:bg-superficie-2">
                <td className="px-4 py-3">
                  <Link
                    href={`/empresas/${cuenta.id}`}
                    className="font-medium text-primario hover:underline"
                  >
                    {cuenta.razon_social}
                  </Link>
                  <p className="text-xs text-tinta-tenue">
                    {ETIQUETAS_VERTICAL[cuenta.vertical]}
                    {cuenta.pais ? ` · ${cuenta.pais}` : ""}
                  </p>
                </td>
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
