"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ETIQUETAS_CALIFICACION,
  ETIQUETAS_ESTADO_LEAD,
  ETIQUETAS_FUENTE,
  ETIQUETAS_PRIORIDAD,
  es,
  fechaLimiteVencida,
  formatearFechaCorta,
  infoAsignacionLead,
  type Lead,
} from "@diprem/core";
import { actualizarLead, obtenerLead } from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { Boton, Insignia } from "@/components/ui";
import { EnlacesContacto } from "@/components/enlaces-contacto";
import { AnalisisGestion } from "@/components/analisis-gestion";
import { DialogoConvertirLead } from "@/components/dialogo-convertir-lead";
import { NotasInternas } from "@/components/notas-internas";

const TONO_ESTADO_LEAD = {
  nuevo: "azul",
  en_gestion: "ambar",
  convertido: "verde",
  descartado: "gris",
} as const;

export default function PaginaDetalleLead({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const [convirtiendo, setConvirtiendo] = useState<Lead | null>(null);

  const { data: lead, isLoading } = useQuery({
    queryKey: ["lead", id],
    queryFn: () => obtenerLead(supabase, id),
  });

  const descartar = useMutation({
    mutationFn: () => actualizarLead(supabase, id, { estado: "descartado" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["lead", id] });
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  if (isLoading) return <p className="text-tinta-tenue">{es.comunes.cargando}</p>;
  if (!lead) return <p className="text-tinta-tenue">{es.comunes.sinResultados}</p>;

  const activo = lead.estado === "nuevo" || lead.estado === "en_gestion";
  const asignacion = infoAsignacionLead(lead);
  const limiteVencido = fechaLimiteVencida(asignacion?.fecha_limite_contacto);

  return (
    <div>
      <Link href="/leads" className="text-sm text-tinta-suave hover:underline">
        ← {es.crm.leads}
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{lead.nombre}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-tinta-suave">
            <Insignia tono={TONO_ESTADO_LEAD[lead.estado]}>
              {ETIQUETAS_ESTADO_LEAD[lead.estado]}
            </Insignia>
            <span>{ETIQUETAS_CALIFICACION[lead.calificacion]}</span>
            {lead.empresa && <span>· {lead.empresa}</span>}
            <span>· {es.crm.fuente}: {ETIQUETAS_FUENTE[lead.fuente]}</span>
            <span>· {formatearFechaCorta(lead.creado_en)}</span>
            {lead.propietario?.nombre && (
              <span>· {es.crm.propietario}: {lead.propietario.nombre}</span>
            )}
            {asignacion?.prioridad && (
              <Insignia
                tono={
                  asignacion.prioridad === "alta"
                    ? "rojo"
                    : asignacion.prioridad === "media"
                      ? "ambar"
                      : "gris"
                }
              >
                {es.mercado.prioridad}: {ETIQUETAS_PRIORIDAD[asignacion.prioridad]}
              </Insignia>
            )}
            {asignacion?.fecha_limite_contacto && (
              <Insignia tono={limiteVencido ? "rojo" : "azul"}>
                ⏰ {es.mercado.fechaLimite}:{" "}
                {formatearFechaCorta(asignacion.fecha_limite_contacto)}
                {limiteVencido && ` · ${es.control.vencido}`}
              </Insignia>
            )}
          </div>
          {/* Teléfono → WhatsApp/llamada · correo → email, con un toque */}
          <div className="mt-3">
            <EnlacesContacto telefono={lead.telefono} email={lead.email} />
          </div>
        </div>
        {activo && (
          <div className="flex gap-2">
            <Boton onClick={() => setConvirtiendo(lead)}>{es.crm.convertir}</Boton>
            <Boton
              variante="fantasma"
              onClick={() => {
                if (confirm(es.comunes.confirmarEliminar)) descartar.mutate();
              }}
            >
              {es.crm.descartarLead}
            </Boton>
          </div>
        )}
      </div>

      {/* Nota privada de quien asignó el proyecto */}
      {asignacion?.nota_asignacion && (
        <div className="mt-4 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 text-sm text-amber-900 dark:text-amber-200">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
            💬 {es.control.notaDelDueno}
          </p>
          <p className="mt-1 italic">{asignacion.nota_asignacion}</p>
        </div>
      )}

      {lead.notas && (
        <p className="mt-4 whitespace-pre-wrap rounded-lg border border-borde bg-superficie p-4 text-sm text-tinta-suave">
          {lead.notas}
        </p>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[2fr_1fr]">
        <AnalisisGestion
          lead={{ id: lead.id, nombre: lead.nombre }}
          creadoEn={lead.creado_en}
        />
        <NotasInternas entidad="lead" entidadId={lead.id} />
      </div>

      <DialogoConvertirLead lead={convirtiendo} onCerrar={() => setConvirtiendo(null)} />
    </div>
  );
}
