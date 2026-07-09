"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ETIQUETAS_MODALIDAD,
  ETIQUETAS_VERTICAL,
  es,
  esquemaConversionLead,
  type Lead,
} from "@diprem/core";
import { convertirLead, listarPilares } from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { Boton, Campo, Dialogo, Entrada, Selector } from "@/components/ui";

/** Convierte un lead en cuenta + contacto principal + oportunidad (RPC atómica). */
export function DialogoConvertirLead({
  lead,
  onCerrar,
}: {
  lead: Lead | null;
  onCerrar: () => void;
}) {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const { data: pilares } = useQuery({
    queryKey: ["pilares"],
    queryFn: () => listarPilares(supabase),
    enabled: lead !== null,
  });

  const convertir = useMutation({
    mutationFn: async (form: FormData) => {
      if (!lead) throw new Error(es.comunes.errorGenerico);
      const datos = esquemaConversionLead.parse({
        razon_social: form.get("razon_social"),
        nombre_oportunidad: form.get("nombre_oportunidad"),
        monto: form.get("monto") || 0,
        vertical: form.get("vertical"),
        pilar_id: (form.get("pilar_id") as string) || null,
        modalidad: form.get("modalidad"),
      });
      return convertirLead(supabase, {
        lead_id: lead.id,
        razon_social: datos.razon_social,
        nombre_oportunidad: datos.nombre_oportunidad,
        monto: Number(datos.monto ?? 0),
        vertical: datos.vertical,
        pilar_id: datos.pilar_id ? Number(datos.pilar_id) : null,
        modalidad: datos.modalidad,
      });
    },
    onSuccess: (resultado) => {
      void queryClient.invalidateQueries({ queryKey: ["leads"] });
      void queryClient.invalidateQueries({ queryKey: ["cuentas"] });
      void queryClient.invalidateQueries({ queryKey: ["oportunidades"] });
      setError(null);
      onCerrar();
      router.push(`/cuentas/${resultado.cuenta_id}`);
    },
    onError: (e: Error) => setError(e.message || es.comunes.errorGenerico),
  });

  return (
    <Dialogo
      abierto={lead !== null}
      titulo={es.crm.convertirLead}
      onCerrar={onCerrar}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          convertir.mutate(new FormData(e.currentTarget));
        }}
      >
        <Campo etiqueta={es.crm.razonSocial}>
          <Entrada
            name="razon_social"
            defaultValue={lead?.empresa ?? ""}
            required
            autoFocus
          />
        </Campo>
        <Campo etiqueta={`${es.crm.nombreOportunidad} (${es.comunes.opcional})`}>
          <Entrada
            name="nombre_oportunidad"
            placeholder={`Oportunidad — ${lead?.empresa ?? ""}`}
          />
        </Campo>
        <div className="grid grid-cols-2 gap-4">
          <Campo etiqueta={es.crm.vertical}>
            <Selector name="vertical" defaultValue="mineria">
              {Object.entries(ETIQUETAS_VERTICAL).map(([valor, etiqueta]) => (
                <option key={valor} value={valor}>
                  {etiqueta}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta={`${es.crm.pilar} (${es.comunes.opcional})`}>
            <Selector name="pilar_id" defaultValue="">
              <option value="">—</option>
              {pilares?.map((p) => (
                <option key={p.id} value={p.id}>
                  Pilar {p.numero} — {p.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta={`${es.crm.monto} (${es.comunes.opcional})`}>
            <Entrada name="monto" type="number" min="0" step="0.01" />
          </Campo>
          <Campo etiqueta={es.crm.modalidad}>
            <Selector name="modalidad" defaultValue="proyecto">
              {Object.entries(ETIQUETAS_MODALIDAD).map(([valor, etiqueta]) => (
                <option key={valor} value={valor}>
                  {etiqueta}
                </option>
              ))}
            </Selector>
          </Campo>
        </div>
        <p className="text-xs text-slate-500">
          Se creará la cuenta, el contacto principal y una oportunidad en la
          primera etapa del embudo, con la moneda del equipo del ejecutivo.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Boton type="button" variante="secundario" onClick={onCerrar}>
            {es.comunes.cancelar}
          </Boton>
          <Boton type="submit" disabled={convertir.isPending}>
            {convertir.isPending ? es.comunes.guardando : es.crm.convertir}
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}
