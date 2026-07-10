"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ETIQUETAS_CALIFICACION,
  ETIQUETAS_ESTADO_LEAD,
  ETIQUETAS_FUENTE,
  es,
  esquemaLead,
  type Lead,
} from "@diprem/core";
import { actualizarLead, crearLead, listarLeads } from "@diprem/api";
import { usePerfil, useSupabase } from "@/lib/hooks";
import {
  AreaTexto,
  Boton,
  Campo,
  Dialogo,
  Entrada,
  EstadoVacio,
  FilasEsqueleto,
  Insignia,
  Selector,
} from "@/components/ui";
import { EnlacesContacto } from "@/components/enlaces-contacto";
import { DialogoConvertirLead } from "@/components/dialogo-convertir-lead";

const TONO_ESTADO_LEAD = {
  nuevo: "azul",
  en_gestion: "ambar",
  convertido: "verde",
  descartado: "gris",
} as const;

export default function PaginaLeads() {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const { data: perfil } = usePerfil();

  const [busqueda, setBusqueda] = useState("");
  const [leadForm, setLeadForm] = useState<{ lead: Lead | null } | null>(null);
  const [convirtiendo, setConvirtiendo] = useState<Lead | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads", busqueda],
    queryFn: () => listarLeads(supabase, busqueda),
  });

  // Acción rápida del botón flotante: /leads?crear=1 abre el formulario
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("crear") === "1") {
      setLeadForm({ lead: null });
      window.history.replaceState(null, "", "/leads");
    }
  }, []);

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

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{es.crm.leads}</h1>
        <div className="flex items-center gap-2">
          <Entrada
            placeholder={es.comunes.buscar}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-56 rounded-md border border-borde px-3 py-2 text-sm"
          />
          <Boton onClick={() => setLeadForm({ lead: null })}>
            + {es.crm.nuevoLead}
          </Boton>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-borde bg-superficie">
        <table className="w-full text-sm">
          <thead className="bg-superficie-2 text-left text-xs uppercase text-tinta-suave">
            <tr>
              <th className="px-4 py-3">{es.crm.nombre}</th>
              <th className="px-4 py-3">{es.crm.empresa}</th>
              <th className="px-4 py-3">{es.crm.contactos}</th>
              <th className="px-4 py-3">{es.crm.fuente}</th>
              <th className="px-4 py-3">{es.crm.calificacion}</th>
              <th className="px-4 py-3">{es.crm.estado}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && <FilasEsqueleto columnas={7} />}
            {!isLoading && (leads?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={7} className="p-4">
                  <EstadoVacio
                    titulo={es.crm.sinLeads}
                    accion={
                      <Boton variante="secundario" onClick={() => setLeadForm({ lead: null })}>
                        + {es.crm.nuevoLead}
                      </Boton>
                    }
                  />
                </td>
              </tr>
            )}
            {leads?.map((lead) => (
              <tr key={lead.id} className="border-t border-borde hover:bg-superficie-2">
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/leads/${lead.id}`}
                    className="hover:text-primario hover:underline"
                  >
                    {lead.nombre}
                  </Link>
                </td>
                <td className="px-4 py-3">{lead.empresa ?? "—"}</td>
                <td className="px-4 py-3">
                  <EnlacesContacto telefono={lead.telefono} email={lead.email} compacto />
                </td>
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
            <Campo etiqueta={es.crm.telefono}>
              <Entrada
                name="telefono"
                type="tel"
                placeholder="+56 9 1234 5678"
                defaultValue={leadForm?.lead?.telefono ?? ""}
                required
              />
            </Campo>
            <Campo etiqueta={es.crm.correo}>
              <Entrada
                name="email"
                type="email"
                defaultValue={leadForm?.lead?.email ?? ""}
                required
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

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

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
      <DialogoConvertirLead lead={convirtiendo} onCerrar={() => setConvirtiendo(null)} />
    </div>
  );
}
