"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ETIQUETAS_CANAL,
  ETIQUETAS_ESTADO_CUENTA,
  ETIQUETAS_MODALIDAD,
  ETIQUETAS_VERTICAL,
  es,
  esquemaContacto,
  formatearMonto,
  type Contacto,
} from "@diprem/core";
import {
  actualizarContacto,
  crearContacto,
  eliminarContacto,
  listarContactos,
  listarEtapas,
  listarOportunidades,
  obtenerCuenta,
} from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import {
  Boton,
  Campo,
  Dialogo,
  Entrada,
  Insignia,
  Selector,
} from "@/components/ui";
import { FormularioCuenta } from "@/components/formulario-cuenta";
import { FormularioOportunidad } from "@/components/formulario-oportunidad";
import { EnlacesContacto } from "@/components/enlaces-contacto";
import { AnalisisGestion } from "@/components/analisis-gestion";

export default function PaginaDetalleCuenta({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const supabase = useSupabase();
  const queryClient = useQueryClient();

  const [editando, setEditando] = useState(false);
  const [contactoForm, setContactoForm] = useState<
    { contacto: Contacto | null } | null
  >(null);
  const [oportunidadForm, setOportunidadForm] = useState(false);
  const [errorContacto, setErrorContacto] = useState<string | null>(null);

  const { data: cuenta, isLoading } = useQuery({
    queryKey: ["cuenta", id],
    queryFn: () => obtenerCuenta(supabase, id),
  });
  const { data: contactos } = useQuery({
    queryKey: ["contactos", id],
    queryFn: () => listarContactos(supabase, id),
  });
  const { data: oportunidades } = useQuery({
    queryKey: ["oportunidades", { cuenta_id: id }],
    queryFn: () => listarOportunidades(supabase, { cuenta_id: id }),
  });
  const { data: etapas } = useQuery({
    queryKey: ["etapas"],
    queryFn: () => listarEtapas(supabase),
  });

  const guardarContacto = useMutation({
    mutationFn: async (form: FormData) => {
      const datos = esquemaContacto.parse({
        nombre: form.get("nombre"),
        cargo: form.get("cargo"),
        telefono: form.get("telefono"),
        email: form.get("email"),
        canal_preferido: form.get("canal_preferido"),
        es_principal: form.get("es_principal") === "on",
      });
      if (contactoForm?.contacto) {
        await actualizarContacto(supabase, contactoForm.contacto.id, datos);
      } else {
        await crearContacto(supabase, id, datos);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contactos", id] });
      setContactoForm(null);
      setErrorContacto(null);
    },
    onError: (e: Error) => setErrorContacto(e.message || es.comunes.errorGenerico),
  });

  const borrarContacto = useMutation({
    mutationFn: (contactoId: string) => eliminarContacto(supabase, contactoId),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["contactos", id] }),
  });

  if (isLoading) return <p className="text-slate-400">{es.comunes.cargando}</p>;
  if (!cuenta) return <p className="text-slate-400">{es.comunes.sinResultados}</p>;

  const nombreEtapa = (etapaId: string) =>
    etapas?.find((e) => e.id === etapaId)?.nombre ?? "—";

  return (
    <div>
      <Link href="/cuentas" className="text-sm text-slate-500 hover:underline">
        ← {es.nav.cuentas}
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{cuenta.razon_social}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <Insignia tono="azul">{ETIQUETAS_VERTICAL[cuenta.vertical]}</Insignia>
            <Insignia
              tono={
                cuenta.estado === "activa"
                  ? "verde"
                  : cuenta.estado === "prospecto"
                    ? "ambar"
                    : "gris"
              }
            >
              {ETIQUETAS_ESTADO_CUENTA[cuenta.estado]}
            </Insignia>
            {cuenta.pais && <span>{cuenta.pais}</span>}
            {cuenta.tax_id && <span>· {cuenta.tax_id}</span>}
            <span>
              · {es.crm.propietario}: {cuenta.propietario?.nombre ?? "—"}
            </span>
          </div>
        </div>
        <Boton variante="secundario" onClick={() => setEditando(true)}>
          {es.comunes.editar}
        </Boton>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {/* Contactos */}
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{es.crm.contactos}</h2>
            <Boton
              variante="secundario"
              onClick={() => setContactoForm({ contacto: null })}
            >
              + {es.crm.nuevoContacto}
            </Boton>
          </div>
          <div className="mt-3 space-y-2">
            {(contactos?.length ?? 0) === 0 && (
              <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
                {es.crm.sinContactos}
              </p>
            )}
            {contactos?.map((contacto) => (
              <div
                key={contacto.id}
                className="flex items-start justify-between rounded-lg border border-slate-200 bg-white p-4"
              >
                <div>
                  <p className="font-medium">
                    {contacto.nombre}{" "}
                    {contacto.es_principal && <Insignia tono="azul">Principal</Insignia>}
                  </p>
                  <p className="text-sm text-slate-500">{contacto.cargo ?? ""}</p>
                  <p className="mt-1 text-sm">
                    <EnlacesContacto
                      telefono={contacto.telefono}
                      email={contacto.email}
                      compacto
                    />
                  </p>
                  {contacto.canal_preferido && (
                    <p className="mt-0.5 text-xs text-slate-400">
                      {es.crm.canalPreferido}: {ETIQUETAS_CANAL[contacto.canal_preferido]}
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Boton
                    variante="fantasma"
                    onClick={() => setContactoForm({ contacto })}
                  >
                    {es.comunes.editar}
                  </Boton>
                  <Boton
                    variante="fantasma"
                    onClick={() => {
                      if (confirm(es.comunes.confirmarEliminar))
                        borrarContacto.mutate(contacto.id);
                    }}
                  >
                    {es.comunes.eliminar}
                  </Boton>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Oportunidades de la cuenta */}
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{es.crm.oportunidades}</h2>
            <Boton variante="secundario" onClick={() => setOportunidadForm(true)}>
              + {es.crm.nuevaOportunidad}
            </Boton>
          </div>
          <div className="mt-3 space-y-2">
            {(oportunidades?.length ?? 0) === 0 && (
              <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
                {es.crm.sinOportunidades}
              </p>
            )}
            {oportunidades?.map((op) => (
              <div
                key={op.id}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium">{op.nombre}</p>
                  <Insignia
                    tono={op.cerrada_en ? (op.motivo_perdida_id ? "rojo" : "verde") : "azul"}
                  >
                    {nombreEtapa(op.etapa_id)}
                  </Insignia>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {formatearMonto(op.monto, op.moneda)} ·{" "}
                  {ETIQUETAS_MODALIDAD[op.modalidad_contrato]}
                  {op.servicio?.nombre ? ` · ${op.servicio.nombre}` : ""}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Análisis de gestión de la cuenta */}
      <div className="mt-10">
        <AnalisisGestion
          cuenta={{ id: cuenta.id, razon_social: cuenta.razon_social }}
          creadoEn={cuenta.creado_en}
        />
      </div>

      {/* Diálogos */}
      <FormularioCuenta
        abierto={editando}
        cuenta={cuenta}
        onCerrar={() => setEditando(false)}
      />
      <FormularioOportunidad
        abierto={oportunidadForm}
        cuentaFija={{ id: cuenta.id, razon_social: cuenta.razon_social }}
        onCerrar={() => setOportunidadForm(false)}
      />
      <Dialogo
        abierto={contactoForm !== null}
        titulo={contactoForm?.contacto ? es.crm.editarContacto : es.crm.nuevoContacto}
        onCerrar={() => setContactoForm(null)}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            guardarContacto.mutate(new FormData(e.currentTarget));
          }}
        >
          <Campo etiqueta={es.crm.nombre}>
            <Entrada
              name="nombre"
              defaultValue={contactoForm?.contacto?.nombre ?? ""}
              required
              autoFocus
            />
          </Campo>
          <div className="grid grid-cols-2 gap-4">
            <Campo etiqueta={`${es.crm.cargo} (${es.comunes.opcional})`}>
              <Entrada name="cargo" defaultValue={contactoForm?.contacto?.cargo ?? ""} />
            </Campo>
            <Campo etiqueta={es.crm.canalPreferido}>
              <Selector
                name="canal_preferido"
                defaultValue={contactoForm?.contacto?.canal_preferido ?? "email"}
              >
                {Object.entries(ETIQUETAS_CANAL).map(([valor, etiqueta]) => (
                  <option key={valor} value={valor}>
                    {etiqueta}
                  </option>
                ))}
              </Selector>
            </Campo>
            <Campo etiqueta={es.crm.telefono}>
              <Entrada
                name="telefono"
                type="tel"
                placeholder="+56 9 1234 5678"
                defaultValue={contactoForm?.contacto?.telefono ?? ""}
                required
              />
            </Campo>
            <Campo etiqueta={es.crm.correo}>
              <Entrada
                name="email"
                type="email"
                defaultValue={contactoForm?.contacto?.email ?? ""}
                required
              />
            </Campo>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="es_principal"
              defaultChecked={contactoForm?.contacto?.es_principal ?? false}
            />
            {es.crm.contactoPrincipal}
          </label>

          {errorContacto && <p className="text-sm text-red-600">{errorContacto}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Boton
              type="button"
              variante="secundario"
              onClick={() => setContactoForm(null)}
            >
              {es.comunes.cancelar}
            </Boton>
            <Boton type="submit" disabled={guardarContacto.isPending}>
              {guardarContacto.isPending ? es.comunes.guardando : es.comunes.guardar}
            </Boton>
          </div>
        </form>
      </Dialogo>
    </div>
  );
}
