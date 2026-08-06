"use client";

/**
 * Ficha del proyecto (Fase B): el clic del Radar aterriza aquí.
 * Ecosistema completo — mandante + EPC/contratistas vinculados — y los
 * contactos clave de cada empresa, filtrables por cargo con el MISMO
 * componente FiltroCargo de la pantalla Empresas. Sin PII: nombre y cargo;
 * teléfonos y correos siguen solo detrás de la revelación con cuota.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ETIQUETAS_ETAPA_PROYECTO,
  bucketDeRol,
  conteosPorBucket,
  es,
  formatearFechaCorta,
  mensajeError,
  rutaInicial,
  type BucketContacto,
} from "@diprem/core";
import {
  desvincularEmpresaProyecto,
  directorioProspectos,
  listarContactosDelProyecto,
  listarEmpresasDelProyecto,
  obtenerProyectoMercado,
  vincularEmpresaProyecto,
  type EmpresaDelProyecto,
} from "@diprem/api";
import { usePerfil, useSupabase } from "@/lib/hooks";
import { useAvisar } from "@/components/avisos";
import {
  BannerError,
  Boton,
  Entrada,
  EstadoVacio,
  Insignia,
  Selector,
  TarjetasEsqueleto,
} from "@/components/ui";
import { FiltroCargo } from "@/components/filtro-cargo";

const ROLES_VINCULABLES = ["epc", "contratista", "proveedor", "mandante"] as const;
const TONO_VINCULO = {
  mandante: "azul",
  epc: "verde",
  contratista: "ambar",
  proveedor: "gris",
} as const;

export default function PaginaFichaProyecto() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const avisar = useAvisar();
  const { data: perfil } = usePerfil();

  // RBAC de UI: mismo público del Radar (la RLS + el guard DEFINER son la barrera real)
  const permitido =
    !!perfil &&
    (perfil.rol === "admin" || perfil.rol === "gerente" || perfil.rol === "revisor");
  useEffect(() => {
    if (perfil && !permitido) router.replace(rutaInicial(perfil.rol));
  }, [perfil, permitido, router]);

  const puedeVincular = perfil?.rol === "admin" || perfil?.rol === "gerente";
  // El gerente no ve cuentas del pool por tabla: su clic a la ficha de empresa
  // caería en vacío — solo admin y revisor navegan a /empresas desde aquí.
  const puedeAbrirEmpresa = perfil?.rol === "admin" || perfil?.rol === "revisor";

  const [bucket, setBucket] = useState<BucketContacto | "">("");
  const [busqueda, setBusqueda] = useState("");
  const [rolVinculo, setRolVinculo] = useState<(typeof ROLES_VINCULABLES)[number]>("epc");
  const [error, setError] = useState<string | null>(null);

  const { data: proyecto, isLoading: cargandoProyecto } = useQuery({
    queryKey: ["proyecto_mercado", id],
    queryFn: () => obtenerProyectoMercado(supabase, id),
    enabled: permitido,
  });
  const { data: empresas, isLoading: cargandoEmpresas } = useQuery({
    queryKey: ["proyecto_empresas", id],
    queryFn: () => listarEmpresasDelProyecto(supabase, id),
    enabled: permitido,
  });
  const { data: contactos } = useQuery({
    queryKey: ["proyecto_contactos", id],
    queryFn: () => listarContactosDelProyecto(supabase, id),
    enabled: permitido,
  });
  const { data: candidatas } = useQuery({
    queryKey: ["directorio_vincular", busqueda],
    queryFn: () =>
      directorioProspectos(supabase, {
        busqueda,
        incluirProveedores: true,
        limite: 8,
      }),
    enabled: puedeVincular && busqueda.trim().length >= 2,
  });

  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: ["proyecto_empresas", id] });
    void queryClient.invalidateQueries({ queryKey: ["proyecto_contactos", id] });
  };
  const vincular = useMutation({
    mutationFn: (cuentaId: string) =>
      vincularEmpresaProyecto(supabase, {
        proyecto_id: id,
        cuenta_id: cuentaId,
        rol_vinculo: rolVinculo,
      }),
    onSuccess: () => {
      invalidar();
      setBusqueda("");
      setError(null);
      avisar(es.mercado.vinculada);
    },
    onError: (e: Error) => setError(mensajeError(e)),
  });
  const desvincular = useMutation({
    mutationFn: (vinculoId: string) => desvincularEmpresaProyecto(supabase, vinculoId),
    onSuccess: () => {
      invalidar();
      avisar(es.mercado.vinculoQuitado);
    },
    onError: (e: Error) => setError(mensajeError(e)),
  });

  // Contactos filtrados por bucket (mismo criterio que la pantalla Empresas)
  const contactosFiltrados = useMemo(
    () =>
      (contactos ?? []).filter(
        (c) => !bucket || bucketDeRol(c.rol) === bucket,
      ),
    [contactos, bucket],
  );
  const conteos = useMemo(
    () => conteosPorBucket((contactos ?? []).map((c) => c.rol)),
    [contactos],
  );

  const yaVinculadas = new Set((empresas ?? []).map((e) => e.cuenta_id));

  if (!perfil || !permitido) return null;

  if (!cargandoProyecto && !proyecto) {
    return (
      <div>
        <Link href="/mercado" className="text-sm text-tinta-suave hover:underline">
          {es.mercado.volverRadar}
        </Link>
        <div className="mt-6">
          <EstadoVacio titulo={es.mercado.proyectoNoEncontrado} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link href="/mercado" className="text-sm text-tinta-suave hover:underline">
        {es.mercado.volverRadar}
      </Link>

      {/* Encabezado del proyecto */}
      {cargandoProyecto || !proyecto ? (
        <div className="mt-4">
          <TarjetasEsqueleto cantidad={1} />
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{proyecto.nombre}</h1>
            <p className="mt-0.5 text-sm text-tinta-suave">
              {proyecto.empresa}
              {proyecto.sector ? ` · ${proyecto.sector}` : ""}
              {proyecto.region ? ` · ${proyecto.region}` : ""}
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              {proyecto.score != null && (
                <Insignia tono="azul">
                  {es.mercado.score}: {proyecto.score}
                </Insignia>
              )}
              {proyecto.etapa && (
                <Insignia tono="gris">{ETIQUETAS_ETAPA_PROYECTO[proyecto.etapa]}</Insignia>
              )}
              {proyecto.capex_musd != null && (
                <Insignia tono="gris">
                  {es.mercado.capexCorto}: {Number(proyecto.capex_musd).toLocaleString("es-CL")}
                </Insignia>
              )}
              {proyecto.inicio_construccion && (
                <Insignia tono="gris">
                  🏗 {formatearFechaCorta(proyecto.inicio_construccion)}
                </Insignia>
              )}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4">
          <BannerError mensaje={error} />
        </div>
      )}

      {/* Ecosistema: mandante + vinculadas */}
      <section className="mt-6">
        <h2 className="text-lg font-semibold">{es.mercado.ecosistemaTitulo}</h2>
        <p className="text-sm text-tinta-suave">{es.mercado.ecosistemaNota}</p>

        {cargandoEmpresas ? (
          <div className="mt-3">
            <TarjetasEsqueleto cantidad={2} />
          </div>
        ) : (
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {(empresas ?? []).map((empresa) => (
              <TarjetaEmpresa
                key={empresa.vinculo_id}
                empresa={empresa}
                puedeAbrir={puedeAbrirEmpresa}
                puedeQuitar={puedeVincular && empresa.fuente !== "derivado"}
                onQuitar={() => {
                  if (window.confirm(es.mercado.confirmarQuitarVinculo(empresa.razon_social))) {
                    desvincular.mutate(empresa.vinculo_id);
                  }
                }}
              />
            ))}
            {(empresas ?? []).filter((e) => e.rol_vinculo !== "mandante").length === 0 && (
              <div className="lg:col-span-2">
                <EstadoVacio titulo={es.mercado.sinVinculadas} />
              </div>
            )}
          </div>
        )}

        {/* Vincular empresa (gerente/admin) */}
        {puedeVincular && (
          <div className="mt-4 rounded-xl border border-borde bg-superficie p-4 shadow-sm">
            <p className="font-medium">{es.mercado.vincularTitulo}</p>
            <p className="mt-0.5 text-xs text-tinta-suave">{es.mercado.vincularNota}</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Entrada
                placeholder={es.mercado.buscarEmpresaPlaceholder}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="sm:flex-1"
              />
              <Selector
                value={rolVinculo}
                onChange={(e) =>
                  setRolVinculo(e.target.value as (typeof ROLES_VINCULABLES)[number])
                }
                className="sm:w-40"
              >
                {ROLES_VINCULABLES.map((rol) => (
                  <option key={rol} value={rol}>
                    {es.mercado.rolesVinculo[rol]}
                  </option>
                ))}
              </Selector>
            </div>
            {busqueda.trim().length >= 2 && (
              <ul className="mt-2 divide-y divide-borde rounded-lg border border-borde">
                {(candidatas ?? [])
                  .filter((c) => !yaVinculadas.has(c.cuenta_id))
                  .map((candidata) => (
                    <li
                      key={candidata.cuenta_id}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {candidata.razon_social}
                        </p>
                        <p className="truncate text-xs text-tinta-tenue">
                          {candidata.giro ?? "—"}
                          {candidata.region ? ` · ${candidata.region}` : ""}
                        </p>
                      </div>
                      <Boton
                        variante="secundario"
                        disabled={vincular.isPending}
                        onClick={() => vincular.mutate(candidata.cuenta_id)}
                      >
                        + {es.mercado.vincular}
                      </Boton>
                    </li>
                  ))}
                {(candidatas ?? []).filter((c) => !yaVinculadas.has(c.cuenta_id)).length ===
                  0 && (
                  <li className="px-3 py-2 text-sm text-tinta-tenue">
                    {es.comunes.sinResultados}
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Contactos clave, filtrables por cargo (mismo componente que Empresas) */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">{es.mercado.contactosClaveTitulo}</h2>
        <p className="text-sm text-tinta-suave">{es.mercado.contactosClaveNota}</p>
        <div className="mt-3">
          <FiltroCargo valor={bucket} onCambiar={setBucket} conteos={conteos} />
        </div>
        <div className="mt-3 space-y-1.5">
          {contactosFiltrados.length === 0 && (
            <EstadoVacio titulo={es.mercado.sinContactosEco} />
          )}
          {contactosFiltrados.map((contacto) => (
            <div
              key={contacto.contacto_id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-borde bg-superficie px-3.5 py-2.5 shadow-sm"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {contacto.nombre}
                  {contacto.es_principal && (
                    <span className="ml-1.5 text-xs text-amber-600 dark:text-amber-400">
                      {es.mercado.contactoPrincipalMarca}
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-tinta-suave">
                  {contacto.cargo ?? "—"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 text-xs">
                <InsigniaBucket rol={contacto.rol} />
                <Insignia tono={TONO_VINCULO[contacto.rol_vinculo]}>
                  {es.mercado.rolesVinculo[contacto.rol_vinculo]}
                </Insignia>
                <span className="max-w-40 truncate text-tinta-tenue">
                  {contacto.empresa}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function TarjetaEmpresa({
  empresa,
  puedeAbrir,
  puedeQuitar,
  onQuitar,
}: {
  empresa: EmpresaDelProyecto;
  puedeAbrir: boolean;
  puedeQuitar: boolean;
  onQuitar: () => void;
}) {
  const conteos: string[] = [];
  if (empresa.n_decisores) conteos.push(`✅ ${empresa.n_decisores}`);
  if (empresa.n_gestores) conteos.push(`🛒 ${empresa.n_gestores}`);
  if (empresa.n_puertas) conteos.push(`🚪 ${empresa.n_puertas}`);
  return (
    <div className="rounded-xl border border-borde bg-superficie p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {puedeAbrir ? (
              <Link
                href={`/empresas/${empresa.cuenta_id}`}
                className="text-primario hover:underline"
              >
                {empresa.razon_social}
              </Link>
            ) : (
              empresa.razon_social
            )}
          </p>
          <p className="mt-0.5 text-xs text-tinta-tenue">
            {conteos.length > 0 ? conteos.join(" · ") : es.filtroCargo.sinContactosClave}
            {" · "}
            {es.mercado.fuenteVinculo[empresa.fuente]}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Insignia tono={TONO_VINCULO[empresa.rol_vinculo]}>
            {es.mercado.rolesVinculo[empresa.rol_vinculo]}
          </Insignia>
          {puedeQuitar && (
            <button
              onClick={onQuitar}
              className="rounded-md px-1.5 py-0.5 text-xs text-tinta-tenue hover:bg-superficie-2 hover:text-red-600"
            >
              ✕ {es.mercado.quitarVinculo}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Insignia del bucket del contacto (mismos textos del FiltroCargo). */
function InsigniaBucket({ rol }: { rol: string | null }) {
  const bucket = bucketDeRol(rol);
  if (bucket === "decisor_tecnico")
    return <Insignia tono="verde">{es.filtroCargo.decisor_tecnico}</Insignia>;
  if (bucket === "gestor_compra")
    return <Insignia tono="azul">{es.filtroCargo.gestor_compra}</Insignia>;
  if (bucket === "puerta_entrada")
    return <Insignia tono="ambar">{es.filtroCargo.puerta_entrada}</Insignia>;
  return null;
}
