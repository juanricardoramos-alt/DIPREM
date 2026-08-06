"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Clock, Linkedin, Lock, Printer, Unlock } from "lucide-react";
import {
  ETIQUETAS_CANAL,
  enlaceLinkedIn,
  es,
} from "@diprem/core";
import {
  obtenerContacto,
  revelarContactos,
  type ContactoRevelado,
} from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { Boton, Esqueleto, Insignia } from "@/components/ui";
import { EnlacesContacto } from "@/components/enlaces-contacto";
import { AnalisisGestion } from "@/components/analisis-gestion";

/**
 * Ficha de contacto: todos los datos accionables de la persona + historial
 * completo de interacciones (independiente de proyecto/oportunidad).
 * "Ficha en PDF" imprime una versión limpia (las notas privadas no salen).
 */
export default function PaginaFichaContacto({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const supabase = useSupabase();

  const { data: contacto, isLoading } = useQuery({
    queryKey: ["contacto", id],
    queryFn: () => obtenerContacto(supabase, id),
  });

  // Perímetro 0015: la PII no viene en la ficha; se revela a pedido
  // (queda registrado; la primera vez consume cuota diaria, después es libre).
  const [rev, setRev] = useState<ContactoRevelado | null>(null);
  const [errorRevelado, setErrorRevelado] = useState<string | null>(null);
  const revelar = useMutation({
    mutationFn: () => revelarContactos(supabase, contacto!.cuenta_id),
    onSuccess: (r) => {
      const propio = r.contactos.find((c) => c.id === id) ?? null;
      setRev(propio);
      setErrorRevelado(
        propio?.omitido
          ? es.crm.limiteRevelaciones(r.omitidos_por_limite, r.limite_diario ?? 0)
          : null,
      );
    },
    onError: (e: Error) => setErrorRevelado(e.message || es.comunes.errorGenerico),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Esqueleto className="h-8 w-64" />
        <Esqueleto className="h-4 w-96" />
        <Esqueleto className="mt-4 h-40" />
      </div>
    );
  }
  if (!contacto) return <p className="text-tinta-tenue">{es.comunes.sinResultados}</p>;

  return (
    <div>
      {/* Encabezado visible solo al imprimir */}
      <p className="hidden border-b border-borde pb-2 text-sm font-semibold text-tinta-suave print:block">
        {es.app.nombre} — {es.crm.fichaContacto}
      </p>

      <Link
        href={`/empresas/${contacto.cuenta_id}`}
        className="text-sm text-tinta-suave hover:underline print:hidden"
      >
        ← {contacto.cuenta?.razon_social ?? es.nav.cuentas}
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {contacto.nombre}{" "}
            {contacto.es_principal && <Insignia tono="azul">Principal</Insignia>}
          </h1>
          <p className="mt-0.5 text-sm text-tinta-suave">
            {[contacto.cargo, contacto.cuenta?.razon_social]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>

          {/* Datos accionables: WhatsApp / llamada / correo / LinkedIn.
              La PII llega solo al revelarla (perímetro 0015). */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {rev?.opt_out || contacto.opt_out_en ? (
              <span className="text-sm text-red-700 dark:text-red-300">
                ⛔ {es.crm.optOutAviso}
              </span>
            ) : rev && !rev.omitido ? (
              <>
                <EnlacesContacto telefono={rev.telefono} email={rev.email} />
                {rev.linkedin && (
                  <a
                    href={enlaceLinkedIn(rev.linkedin)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-borde bg-superficie px-2.5 py-1.5 text-sm text-[#0a66c2] hover:bg-superficie-2 dark:text-[#78b1e2]"
                  >
                    <Linkedin className="h-4 w-4" /> {es.crm.linkedin}
                  </a>
                )}
              </>
            ) : (
              <Boton
                variante="secundario"
                className="print:hidden"
                title={es.crm.revelacionRegistrada}
                onClick={() => revelar.mutate()}
                disabled={revelar.isPending}
              >
                <Unlock className="h-4 w-4" />{" "}
                {revelar.isPending ? es.comunes.cargando : es.crm.mostrarDatosContacto}
              </Boton>
            )}
            {errorRevelado && (
              <span className="text-xs text-amber-700 dark:text-amber-300">
                {errorRevelado}
              </span>
            )}
          </div>
        </div>

        <Boton
          variante="secundario"
          className="print:hidden"
          onClick={() => window.print()}
        >
          <Printer className="h-4 w-4" /> {es.crm.exportarPdf}
        </Boton>
      </div>

      {/* Preferencias de contacto */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-borde bg-superficie shadow-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
            {es.crm.canalPreferido}
          </p>
          <p className="mt-1 text-sm font-medium">
            {contacto.canal_preferido
              ? ETIQUETAS_CANAL[contacto.canal_preferido]
              : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-borde bg-superficie shadow-sm p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
            <Clock className="h-3.5 w-3.5" /> {es.crm.mejorHorario}
          </p>
          <p className="mt-1 text-sm font-medium">{contacto.mejor_horario ?? "—"}</p>
        </div>
      </div>

      {/* Notas privadas: internas, nunca en el PDF */}
      {contacto.notas_privadas && (
        <div className="mt-4 rounded-xl border border-borde bg-superficie-2 p-4 print:hidden">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-tinta-tenue">
            <Lock className="h-3.5 w-3.5" /> {es.crm.notasPrivadas}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-tinta-suave">
            {contacto.notas_privadas}
          </p>
        </div>
      )}

      {/* Historial completo con esta persona */}
      <div className="mt-8">
        <AnalisisGestion
          contacto={{ id: contacto.id, nombre: contacto.nombre }}
          creadoEn={contacto.creado_en ?? new Date().toISOString()}
          titulo={es.crm.historialContacto}
        />
        <p className="mt-1 text-xs text-tinta-tenue print:hidden">
          {es.crm.historialContactoNota}
        </p>
      </div>
    </div>
  );
}
