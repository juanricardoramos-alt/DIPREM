"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ETIQUETAS_CALIFICACION,
  ETIQUETAS_ESTADO_LEAD,
  ETIQUETAS_FUENTE,
  es,
  formatearFechaCorta,
  type Lead,
} from "@diprem/core";
import { actualizarLead, obtenerLead } from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { Boton, Insignia } from "@/components/ui";
import { EnlacesContacto } from "@/components/enlaces-contacto";
import { AnalisisGestion } from "@/components/analisis-gestion";
import { DialogoConvertirLead } from "@/components/dialogo-convertir-lead";

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

      {lead.notas && (
        <p className="mt-4 whitespace-pre-wrap rounded-lg border border-borde bg-superficie p-4 text-sm text-tinta-suave">
          {lead.notas}
        </p>
      )}

      <div className="mt-8">
        <AnalisisGestion
          lead={{ id: lead.id, nombre: lead.nombre }}
          creadoEn={lead.creado_en}
        />
      </div>

      <DialogoConvertirLead lead={convirtiendo} onCerrar={() => setConvirtiendo(null)} />
    </div>
  );
}
