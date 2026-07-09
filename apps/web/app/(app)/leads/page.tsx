"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ETIQUETAS_CALIFICACION,
  ETIQUETAS_ESTADO_LEAD,
  ETIQUETAS_FUENTE,
  ETIQUETAS_MODALIDAD,
  ETIQUETAS_VERTICAL,
  es,
  esquemaConversionLead,
  esquemaLead,
  type Lead,
} from "@diprem/core";
import {
  actualizarLead,
  convertirLead,
  crearLead,
  listarLeads,
  listarPilares,
} from "@diprem/api";
import { usePerfil, useSupabase } from "@/lib/hooks";
import {
  AreaTexto,
  Boton,
  Campo,
  Dialogo,
  Entrada,
  Insignia,
  Selector,
} from "@/components/ui";

const TONO_ESTADO_LEAD = {
  nuevo: "azul",
  en_gestion: "ambar",
  convertido: "verde",
  descartado: "gris",
} as const;

export default function PaginaLeads() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: perfil } = usePerfil();

  const [busqueda, setBusqueda] = useState("");
  const [leadForm, setLeadForm] = useState<{ lead: Lead | null } | null>(null);
  const [convirtiendo, setConvirtiendo] = useState<Lead | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads", busqueda],
    queryFn: () => listarLeads(supabase, busqueda),
  });
  const { data: pilares } = useQuery({
    queryKey: ["pilares"],
    queryFn: () => listarPilares(supabase),
  });

  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: ["leads"] });
    void queryClient.invalidateQueries({ queryKey: ["cuentas"] });
    void queryClient.invalidateQueries({ queryKey: ["oportunidades"] });
  };

  const guardarLead = useMutation({
    mutationFn: async (form: FormData) => {
      const datos = esquemaLead.parse({
        nombre: form.get("nombre"),
        empresa: form.get("empresa"),
        telefono: form.get("telefono"),
        email: form.get("email"),
        fuente: form.get("fuente"),
        calificacion: form.get("calificacion"),
        notas: form.get("notas"),
      });
      if (leadForm?.lead) {
        await actualizarLead(supabase, leadForm.lead.id, datos);
      } else {
        if (!perfil) throw new Error(es.comunes.errorGenerico);
        await crearLead(supabase, { ...datos, propietario_id: perfil.id });
      }
    },
    onSuccess: () => {
      invalidar();
      setLeadForm(null);
      setError(null);
    },
    onError: (e: Error) => setError(e.message || es.comunes.errorGenerico),
  });

  const descartarLead = useMutation({
    mutationFn: (id: string) => actualizarLead(supabase, id, { estado: "descartado" }),
    onSuccess: invalidar,
  });

  const convertir = useMutation({
    mutationFn: async (form: FormData) => {
      if (!convirtiendo) throw new Error(es.comunes.errorGenerico);
      const datos = esquemaConversionLead.parse({
        razon_social: form.get("razon_social"),
        nombre_oportunidad: form.get("nombre_oportunidad"),
        monto: form.get("monto") || 0,
        vertical: form.get("vertical"),
        pilar_id: (form.get("pilar_id") as string) || null,
        modalidad: form.get("modalidad"),
      });
      return convertirLead(supabase, {
        lead_id: convirtiendo.id,
        razon_social: datos.razon_social,
        nombre_oportunidad: datos.nombre_oportunidad,
        monto: Number(datos.monto ?? 0),
        vertical: datos.vertical,
        pilar_id: datos.pilar_id ? Number(datos.pilar_id) : null,
        modalidad: datos.modalidad,
      });
    },
    onSuccess: (resultado) => {
      invalidar();
      setConvirtiendo(null);
      setError(null);
      router.push(`/cuentas/${resultado.cuenta_id}`);
    },
    onError: (e: Error) => setError(e.message || es.comunes.errorGenerico),
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{es.crm.leads}</h1>
        <div className="flex items-center gap-2">
          <Entrada
            placeholder={es.comunes.buscar}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-56 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <Boton onClick={() => setLeadForm({ lead: null })}>
            + {es.crm.nuevoLead}
          </Boton>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">{es.crm.nombre}</th>
              <th className="px-4 py-3">{es.crm.empresa}</th>
              <th className="px-4 py-3">{es.crm.fuente}</th>
              <th className="px-4 py-3">{es.crm.calificacion}</th>
              <th className="px-4 py-3">{es.crm.estado}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  {es.comunes.cargando}
                </td>
              </tr>
            )}
            {!isLoading && (leads?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  {es.crm.sinLeads}
                </td>
              </tr>
            )}
            {leads?.map((lead) => (
              <tr key={lead.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{lead.nombre}</td>
                <td className="px-4 py-3">{lead.empresa ?? "—"}</td>
                <td className="px-4 py-3">{ETIQUETAS_FUENTE[lead.fuente]}</td>
                <td className="px-4 py-3">{ETIQUETAS_CALIFICACION[lead.calificacion]}</td>
                <td className="px-4 py-3">
                  <Insignia tono={TONO_ESTADO_LEAD[lead.estado]}>
                    {ETIQUETAS_ESTADO_LEAD[lead.estado]}
                  </Insignia>
                </td>
                <td className="px-4 py-3 text-right">
                  {lead.estado !== "convertido" && lead.estado !== "descartado" && (
                    <div className="flex justify-end gap-1">
                      <Boton
                        variante="fantasma"
                        onClick={() => setLeadForm({ lead })}
                      >
                        {es.comunes.editar}
                      </Boton>
                      <Boton variante="secundario" onClick={() => setConvirtiendo(lead)}>
                        {es.crm.convertir}
                      </Boton>
                      <Boton
                        variante="fantasma"
                        onClick={() => descartarLead.mutate(lead.id)}
                      >
                        {es.crm.descartarLead}
                      </Boton>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Crear / editar lead */}
      <Dialogo
        abierto={leadForm !== null}
        titulo={leadForm?.lead ? es.crm.editarLead : es.crm.nuevoLead}
        onCerrar={() => setLeadForm(null)}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            guardarLead.mutate(new FormData(e.currentTarget));
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <Campo etiqueta={es.crm.nombre}>
              <Entrada
                name="nombre"
                defaultValue={leadForm?.lead?.nombre ?? ""}
                required
                autoFocus
              />
            </Campo>
            <Campo etiqueta={`${es.crm.empresa} (${es.comunes.opcional})`}>
              <Entrada name="empresa" defaultValue={leadForm?.lead?.empresa ?? ""} />
            </Campo>
            <Campo etiqueta={`${es.crm.telefono} (${es.comunes.opcional})`}>
              <Entrada name="telefono" defaultValue={leadForm?.lead?.telefono ?? ""} />
            </Campo>
            <Campo etiqueta={`${es.crm.correo} (${es.comunes.opcional})`}>
              <Entrada
                name="email"
                type="email"
                defaultValue={leadForm?.lead?.email ?? ""}
              />
            </Campo>
            <Campo etiqueta={es.crm.fuente}>
              <Selector name="fuente" defaultValue={leadForm?.lead?.fuente ?? "referido"}>
                {Object.entries(ETIQUETAS_FUENTE).map(([valor, etiqueta]) => (
                  <option key={valor} value={valor}>
                    {etiqueta}
                  </option>
                ))}
              </Selector>
            </Campo>
            <Campo etiqueta={es.crm.calificacion}>
              <Selector
                name="calificacion"
                defaultValue={leadForm?.lead?.calificacion ?? "tibio"}
              >
                {Object.entries(ETIQUETAS_CALIFICACION).map(([valor, etiqueta]) => (
                  <option key={valor} value={valor}>
                    {etiqueta}
                  </option>
                ))}
              </Selector>
            </Campo>
          </div>
          <Campo etiqueta={`${es.crm.notas} (${es.comunes.opcional})`}>
            <AreaTexto name="notas" defaultValue={leadForm?.lead?.notas ?? ""} />
          </Campo>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Boton type="button" variante="secundario" onClick={() => setLeadForm(null)}>
              {es.comunes.cancelar}
            </Boton>
            <Boton type="submit" disabled={guardarLead.isPending}>
              {guardarLead.isPending ? es.comunes.guardando : es.comunes.guardar}
            </Boton>
          </div>
        </form>
      </Dialogo>

      {/* Convertir lead */}
      <Dialogo
        abierto={convirtiendo !== null}
        titulo={es.crm.convertirLead}
        onCerrar={() => setConvirtiendo(null)}
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
              defaultValue={convirtiendo?.empresa ?? ""}
              required
              autoFocus
            />
          </Campo>
          <Campo etiqueta={`${es.crm.nombreOportunidad} (${es.comunes.opcional})`}>
            <Entrada
              name="nombre_oportunidad"
              placeholder={`Oportunidad — ${convirtiendo?.empresa ?? ""}`}
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
            <Boton
              type="button"
              variante="secundario"
              onClick={() => setConvirtiendo(null)}
            >
              {es.comunes.cancelar}
            </Boton>
            <Boton type="submit" disabled={convertir.isPending}>
              {convertir.isPending ? es.comunes.guardando : es.crm.convertir}
            </Boton>
          </div>
        </form>
      </Dialogo>
    </div>
  );
}
