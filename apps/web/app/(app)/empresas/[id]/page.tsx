"use client";

import { useAvisar } from "@/components/avisos";
import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { mensajeError,
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
  listarContactosPuerta,
  listarEtapas,
  listarOportunidades,
  obtenerCuenta,
  revelarContacto,
  revelarContactos,
  type ContactoRevelado,
} from "@diprem/api";
import { bucketDeRol, conteosPorBucket, type BucketContacto } from "@diprem/core";
import { BarraFiltroContactos, filtrarContactos } from "@/components/filtro-cargo";
import { useSupabase } from "@/lib/hooks";
import {
  AreaTexto,
  Boton,
  Campo,
  Dialogo,
  Entrada,
  Insignia,
  Selector,
  EstadoVacio,
} from "@/components/ui";
import { FormularioCuenta } from "@/components/formulario-cuenta";
import { FormularioOportunidad } from "@/components/formulario-oportunidad";
import { EnlacesContacto } from "@/components/enlaces-contacto";
import { AnalisisGestion } from "@/components/analisis-gestion";
import { NotasInternas } from "@/components/notas-internas";

export default function PaginaDetalleCuenta({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const avisar = useAvisar();

  const [editando, setEditando] = useState(false);
  // Filtro de contactos: misma barra que la ficha de proyecto (chips + texto)
  const [bucketContactos, setBucketContactos] = useState<BucketContacto | "">("");
  const [busquedaContacto, setBusquedaContacto] = useState("");
  const [verTodosContactos, setVerTodosContactos] = useState(false);
  const [contactoForm, setContactoForm] = useState<
    { contacto: Contacto | null } | null
  >(null);
  const [oportunidadForm, setOportunidadForm] = useState(false);
  const [errorContacto, setErrorContacto] = useState<string | null>(null);
  const [notasDeOportunidad, setNotasDeOportunidad] = useState<
    { id: string; nombre: string } | null
  >(null);

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
        linkedin: form.get("linkedin"),
        mejor_horario: form.get("mejor_horario"),
        notas_privadas: form.get("notas_privadas"),
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
      avisar(es.confirmaciones.guardado);
    },
    onError: (e: Error) => setErrorContacto(mensajeError(e)),
  });

  const borrarContacto = useMutation({
    mutationFn: (contactoId: string) => eliminarContacto(supabase, contactoId),
    onSuccess: () => {
      avisar(es.confirmaciones.eliminado);
      void queryClient.invalidateQueries({ queryKey: ["contactos", id] });
    },
  });

  // Perímetro 0015: la PII (tel/correo/LinkedIn) no viene en el listado;
  // se pide explícitamente y queda registrada (cuota diaria por rol).
  const [pii, setPii] = useState<Record<string, ContactoRevelado>>({});
  const [avisoRevelado, setAvisoRevelado] = useState<string | null>(null);
  const revelar = useMutation({
    mutationFn: () => revelarContactos(supabase, id),
    onSuccess: (r) => {
      setPii(Object.fromEntries(r.contactos.map((c) => [c.id, c])));
      setAvisoRevelado(
        r.omitidos_por_limite > 0
          ? es.crm.limiteRevelaciones(r.omitidos_por_limite, r.limite_diario ?? 0)
          : null,
      );
    },
    onError: (e: Error) => setAvisoRevelado(mensajeError(e)),
  });
  const revelado = Object.keys(pii).length > 0;

  // Acción de derivación: la cuenta tiene puerta de entrada pero NINGÚN
  // decisor técnico → tarea concreta, con el mejor contacto puerta
  // (ordenado por peso_decision) listo para llamar.
  const sinDecisor =
    (contactos?.length ?? 0) > 0 &&
    !contactos!.some((c) => bucketDeRol(c.rol) === "decisor_tecnico");
  const { data: puertas } = useQuery({
    queryKey: ["contactos_puerta", id],
    queryFn: () => listarContactosPuerta(supabase, id),
    enabled: sinDecisor,
  });

  // Filtro + jerarquía: con más de 10 contactos y sin filtro activo, primero
  // los clave (decisor/gestor/puerta) y el resto detrás de "Ver los N restantes"
  const MUCHOS_CONTACTOS = 10;
  const conteosContactos = conteosPorBucket((contactos ?? []).map((c) => c.rol));
  const contactosFiltrados = filtrarContactos(
    contactos ?? [],
    bucketContactos,
    busquedaContacto,
  );
  const filtroContactosActivo =
    Boolean(bucketContactos) || busquedaContacto.trim().length > 0;
  const colapsarContactos =
    !filtroContactosActivo &&
    !verTodosContactos &&
    (contactos?.length ?? 0) > MUCHOS_CONTACTOS;
  const contactosClave = contactosFiltrados.filter(
    (c) => bucketDeRol(c.rol) !== "sin_clasificar",
  );
  const contactosVisibles = colapsarContactos
    ? contactosClave.length > 0
      ? contactosClave
      : contactosFiltrados.slice(0, MUCHOS_CONTACTOS)
    : contactosFiltrados;
  const contactosRestantes = contactosFiltrados.length - contactosVisibles.length;

  // Revelado INDIVIDUAL (0020): un contacto = 1 del tope diario, registrado
  // igual que el global. Si el tope está copado, la BD lo dice y se muestra.
  const revelarUno = useMutation({
    mutationFn: (contactoId: string) => revelarContacto(supabase, contactoId),
    onSuccess: (c) => {
      setPii((prev) => ({ ...prev, [c.id]: c }));
      setAvisoRevelado(null);
    },
    onError: (e: Error) => setAvisoRevelado(mensajeError(e)),
  });

  // Editar exige la PII actual (el formulario la trae precargada): si aún no
  // se reveló, se revela SOLO ese contacto — la primera vez consume cuota.
  const abrirEdicion = async (contacto: Contacto) => {
    let datos: ContactoRevelado | undefined = pii[contacto.id];
    if (!datos) {
      try {
        datos = await revelarUno.mutateAsync(contacto.id);
      } catch {
        return; // el error ya quedó en avisoRevelado
      }
    }
    setContactoForm({
      contacto: {
        ...contacto,
        telefono: datos?.telefono ?? null,
        email: datos?.email ?? null,
        linkedin: datos?.linkedin ?? null,
      },
    });
  };

  if (isLoading) return <p className="py-16 text-center text-tinta-tenue">{es.comunes.cargando}</p>;
  if (!cuenta) return <p className="text-tinta-tenue">{es.comunes.sinResultados}</p>;

  const nombreEtapa = (etapaId: string) =>
    etapas?.find((e) => e.id === etapaId)?.nombre ?? "—";

  return (
    <div>
      <Link href="/empresas" className="text-sm text-tinta-suave hover:underline">
        ← {es.nav.cuentas}
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{cuenta.razon_social}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-tinta-suave">
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
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{es.crm.contactos}</h2>
            <span className="flex items-center gap-1">
              {(contactos?.length ?? 0) > 0 && !revelado && (
                <Boton
                  variante="fantasma"
                  title={es.crm.revelacionRegistrada}
                  onClick={() => revelar.mutate()}
                  disabled={revelar.isPending}
                >
                  🔓 {revelar.isPending ? es.comunes.cargando : es.crm.mostrarDatosContacto}
                </Boton>
              )}
              <Boton
                variante="secundario"
                onClick={() => setContactoForm({ contacto: null })}
              >
                + {es.crm.nuevoContacto}
              </Boton>
            </span>
          </div>
          {avisoRevelado && (
            <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
              {avisoRevelado}
            </p>
          )}
          {sinDecisor && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/50">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                🚪 {es.mercado.derivacionTitulo}
              </p>
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                {(puertas?.length ?? 0) > 0
                  ? es.mercado.derivacionNota
                  : es.mercado.derivacionSinPuerta}
              </p>
              {(puertas ?? []).slice(0, 3).map((p, i) => {
                const revPuerta = pii[p.contacto_id];
                return (
                <p key={p.contacto_id} className="mt-1.5 text-sm text-amber-900 dark:text-amber-100">
                  {i === 0 ? "→ " : "· "}
                  <span className="font-medium">{p.nombre}</span>
                  {p.cargo ? ` — ${p.cargo}` : ""}
                  {revPuerta && !revPuerta.omitido && (
                    <span className="ml-2">
                      <EnlacesContacto
                        telefono={revPuerta.telefono}
                        email={revPuerta.email}
                        compacto
                      />
                    </span>
                  )}
                </p>
                );
              })}
              {(puertas?.length ?? 0) > 0 && !revelado && (
                <Boton
                  variante="secundario"
                  className="mt-2"
                  onClick={() => revelar.mutate()}
                  disabled={revelar.isPending}
                >
                  🔓 {revelar.isPending ? es.comunes.cargando : es.crm.mostrarDatosContacto}
                </Boton>
              )}
            </div>
          )}
          {(contactos?.length ?? 0) > 0 && (
            <div className="mt-3">
              <BarraFiltroContactos
                bucket={bucketContactos}
                onBucket={setBucketContactos}
                busqueda={busquedaContacto}
                onBusqueda={setBusquedaContacto}
                conteos={conteosContactos}
              />
            </div>
          )}
          <div className="mt-3 space-y-2">
            {(contactos?.length ?? 0) === 0 && (
              <EstadoVacio titulo={es.crm.sinContactos} />
            )}
            {(contactos?.length ?? 0) > 0 && contactosFiltrados.length === 0 && (
              <EstadoVacio titulo={es.comunes.sinResultados} />
            )}
            {contactosVisibles.map((contacto) => {
              const revContacto = pii[contacto.id];
              return (
              <div
                key={contacto.id}
                className="flex items-start justify-between rounded-lg border border-borde bg-superficie shadow-sm p-4"
              >
                <div>
                  <p className="font-medium">
                    <Link
                      href={`/contactos/${contacto.id}`}
                      className="hover:text-primario hover:underline"
                      title={es.crm.verFicha}
                    >
                      {contacto.nombre}
                    </Link>{" "}
                    {contacto.es_principal && <Insignia tono="azul">Principal</Insignia>}
                  </p>
                  <p className="text-sm text-tinta-suave">{contacto.cargo ?? ""}</p>
                  <p className="mt-1 text-sm">
                    {revContacto?.opt_out || contacto.opt_out_en ? (
                      <span className="text-xs text-red-700 dark:text-red-300">
                        ⛔ {es.crm.optOutAviso}
                      </span>
                    ) : revContacto && !revContacto.omitido ? (
                      <EnlacesContacto
                        telefono={revContacto.telefono}
                        email={revContacto.email}
                        compacto
                      />
                    ) : (
                      <span
                        className="text-xs text-tinta-tenue"
                        title={es.crm.revelacionRegistrada}
                      >
                        🔒 {es.crm.datosProtegidos}
                      </span>
                    )}
                  </p>
                  {contacto.canal_preferido && (
                    <p className="mt-0.5 text-xs text-tinta-tenue">
                      {es.crm.canalPreferido}: {ETIQUETAS_CANAL[contacto.canal_preferido]}
                    </p>
                  )}
                </div>
                <div className="flex items-start gap-1">
                  {/* Mostrar: revela SOLO este contacto (1 del tope diario,
                      registrado). Revelado → el botón desaparece: re-ocultar
                      sería teatro, la lectura ya quedó registrada. */}
                  {!revContacto && !contacto.opt_out_en && (
                    <Boton
                      variante="fantasma"
                      title={es.crm.revelacionRegistrada}
                      disabled={revelarUno.isPending}
                      onClick={() => revelarUno.mutate(contacto.id)}
                    >
                      🔓 {es.crm.mostrar}
                    </Boton>
                  )}
                  <details className="relative">
                    <summary
                      className="cursor-pointer list-none rounded-md px-2.5 py-1.5 text-sm hover:bg-superficie-2"
                      title={es.crm.masAcciones}
                      aria-label={es.crm.masAcciones}
                    >
                      ⋯
                    </summary>
                    <div className="absolute right-0 z-10 mt-1 w-36 overflow-hidden rounded-md border border-borde bg-superficie shadow-lg">
                      <button
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-superficie-2"
                        onClick={(e) => {
                          e.currentTarget.closest("details")?.removeAttribute("open");
                          void abrirEdicion(contacto);
                        }}
                      >
                        {es.comunes.editar}
                      </button>
                      <button
                        className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-superficie-2 dark:text-red-400"
                        onClick={(e) => {
                          e.currentTarget.closest("details")?.removeAttribute("open");
                          if (confirm(es.comunes.confirmarEliminar))
                            borrarContacto.mutate(contacto.id);
                        }}
                      >
                        {es.comunes.eliminar}
                      </button>
                    </div>
                  </details>
                </div>
              </div>
              );
            })}
            {contactosRestantes > 0 && (
              <button
                onClick={() => setVerTodosContactos(true)}
                className="w-full rounded-lg border border-dashed border-borde py-2 text-center text-sm font-medium text-primario hover:bg-superficie-2"
              >
                {es.crm.verRestantesContactos(contactosRestantes)}
              </button>
            )}
            {verTodosContactos && !filtroContactosActivo &&
              (contactos?.length ?? 0) > MUCHOS_CONTACTOS && (
                <button
                  onClick={() => setVerTodosContactos(false)}
                  className="w-full rounded-lg py-1.5 text-center text-xs font-medium text-tinta-suave hover:bg-superficie-2"
                >
                  {es.crm.verMenosContactos}
                </button>
              )}
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
              <EstadoVacio titulo={es.crm.sinOportunidades} />
            )}
            {oportunidades?.map((op) => (
              <div
                key={op.id}
                className="rounded-lg border border-borde bg-superficie shadow-sm p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate font-medium">{op.nombre}</p>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Insignia
                      tono={op.cerrada_en ? (op.motivo_perdida_id ? "rojo" : "verde") : "azul"}
                    >
                      {nombreEtapa(op.etapa_id)}
                    </Insignia>
                    <Boton
                      variante="fantasma"
                      title={es.notas.titulo}
                      onClick={() => setNotasDeOportunidad({ id: op.id, nombre: op.nombre })}
                    >
                      💬
                    </Boton>
                  </span>
                </div>
                <p className="mt-1 text-sm text-tinta-suave">
                  {formatearMonto(op.monto, op.moneda)} ·{" "}
                  {ETIQUETAS_MODALIDAD[op.modalidad_contrato]}
                  {op.servicio?.nombre ? ` · ${op.servicio.nombre}` : ""}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Análisis de gestión + notas internas de la cuenta */}
      <div className="mt-10 grid gap-8 lg:grid-cols-[2fr_1fr]">
        <AnalisisGestion
          cuenta={{ id: cuenta.id, razon_social: cuenta.razon_social }}
          creadoEn={cuenta.creado_en}
        />
        <NotasInternas entidad="cuenta" entidadId={cuenta.id} />
      </div>

      {/* Notas internas de una oportunidad */}
      <Dialogo
        abierto={notasDeOportunidad !== null}
        titulo={es.notas.notasDeOportunidad(notasDeOportunidad?.nombre ?? "")}
        onCerrar={() => setNotasDeOportunidad(null)}
      >
        {notasDeOportunidad && (
          <>
            <p className="text-sm text-tinta-suave">{es.notas.descripcion}</p>
            <NotasInternas
              entidad="oportunidad"
              entidadId={notasDeOportunidad.id}
              compacto
            />
          </>
        )}
      </Dialogo>

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
          <div className="grid gap-4 sm:grid-cols-2">
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
            <Campo etiqueta={`${es.crm.linkedin} (${es.comunes.opcional})`}>
              <Entrada
                name="linkedin"
                placeholder="linkedin.com/in/usuario"
                defaultValue={contactoForm?.contacto?.linkedin ?? ""}
              />
            </Campo>
            <Campo etiqueta={`${es.crm.mejorHorario} (${es.comunes.opcional})`}>
              <Entrada
                name="mejor_horario"
                placeholder={es.crm.mejorHorarioPlaceholder}
                defaultValue={contactoForm?.contacto?.mejor_horario ?? ""}
              />
            </Campo>
          </div>
          <Campo etiqueta={`${es.crm.notasPrivadas} (${es.comunes.opcional})`}>
            <AreaTexto
              name="notas_privadas"
              defaultValue={contactoForm?.contacto?.notas_privadas ?? ""}
            />
          </Campo>
          <p className="-mt-2 text-xs text-tinta-tenue">{es.crm.notasPrivadasAyuda}</p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="es_principal"
              defaultChecked={contactoForm?.contacto?.es_principal ?? false}
            />
            {es.crm.contactoPrincipal}
          </label>

          {errorContacto && <p className="text-sm text-red-600 dark:text-red-400">{errorContacto}</p>}

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
