"use client";

import { enlaceCorreo, enlaceLlamada, enlaceWhatsApp, es } from "@diprem/core";

/**
 * Datos de contacto accionables: WhatsApp y llamada con un toque (móvil),
 * correo con el cliente de email. Usar SIEMPRE este componente para mostrar
 * teléfono/correo de leads y contactos.
 */
export function EnlacesContacto({
  telefono,
  email,
  compacto = false,
}: {
  telefono?: string | null;
  email?: string | null;
  /** true = solo íconos + dato, en una línea (tablas y tarjetas chicas) */
  compacto?: boolean;
}) {
  if (!telefono && !email) return <span className="text-tinta-tenue">—</span>;

  const clase = compacto
    ? "inline-flex items-center gap-1 text-xs hover:underline"
    : "inline-flex items-center gap-1.5 rounded-md border border-borde bg-superficie px-2.5 py-1.5 text-sm hover:bg-superficie-2";

  return (
    <span className={`flex flex-wrap items-center ${compacto ? "gap-x-3 gap-y-0.5" : "gap-2"}`}>
      {telefono && (
        <>
          <a
            className={`${clase} text-emerald-700 dark:text-emerald-300`}
            href={enlaceWhatsApp(telefono)}
            target="_blank"
            rel="noreferrer"
            title={es.gestion.whatsapp}
          >
            💬 {compacto ? telefono : `${es.gestion.whatsapp} ${telefono}`}
          </a>
          <a
            className={`${clase} text-tinta-suave`}
            href={enlaceLlamada(telefono)}
            title={es.gestion.llamar}
          >
            📞 {compacto ? "" : es.gestion.llamar}
          </a>
        </>
      )}
      {email && (
        <a
          className={`${clase} min-w-0 max-w-full text-primario`}
          href={enlaceCorreo(email)}
          title={es.gestion.escribirCorreo}
        >
          ✉️ <span className="break-all">{email}</span>
        </a>
      )}
    </span>
  );
}
