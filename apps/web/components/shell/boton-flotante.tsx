"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Plus, SquareKanban, UserPlus, X } from "lucide-react";
import { es, type RolUsuario } from "@diprem/core";
import { FormularioActividad } from "@/components/formulario-actividad";

/**
 * Botón flotante "+" — regla de los 2 clics: registrar una gestión, crear un
 * lead o una oportunidad desde cualquier pantalla.
 */
export function BotonFlotante({ rol }: { rol: RolUsuario }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [registrando, setRegistrando] = useState(false);

  if (rol === "lectura") return null;

  const acciones = [
    {
      etiqueta: es.shell.accionGestion,
      Icono: CalendarCheck,
      accion: () => setRegistrando(true),
    },
    {
      etiqueta: es.shell.accionLead,
      Icono: UserPlus,
      accion: () => router.push("/leads?crear=1"),
    },
    {
      etiqueta: es.shell.accionOportunidad,
      Icono: SquareKanban,
      accion: () => router.push("/oportunidades?crear=1"),
    },
  ];

  return (
    <>
      <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-2 lg:bottom-6 lg:right-6 print:hidden">
        {abierto &&
          acciones.map(({ etiqueta, Icono, accion }) => (
            <button
              key={etiqueta}
              onClick={() => {
                setAbierto(false);
                accion();
              }}
              className="flex items-center gap-2.5 rounded-full border border-borde bg-superficie py-2 pl-4 pr-2.5 text-sm font-medium text-tinta shadow-lg transition-colors hover:bg-superficie-2"
            >
              {etiqueta}
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primario-suave text-primario">
                <Icono className="h-4 w-4" />
              </span>
            </button>
          ))}
        <button
          onClick={() => setAbierto((v) => !v)}
          aria-label={es.shell.accionesRapidas}
          aria-expanded={abierto}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primario text-white shadow-xl transition-transform hover:bg-primario-oscuro active:scale-95"
        >
          {abierto ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
        </button>
      </div>

      {registrando && (
        <FormularioActividad abierto registroRapido onCerrar={() => setRegistrando(false)} />
      )}
    </>
  );
}
