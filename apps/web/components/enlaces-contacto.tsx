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
  if (!telefono && !email) return <span className="text-slate-400">—</span>;

  const clase = compacto
    ? "inline-flex items-center gap-1 text-xs hover:underline"
    : "inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm hover:bg-slate-50";

  return (
    <span className={`flex flex-wrap items-center ${compacto ? "gap-x-3 gap-y-0.5" : "gap-2"}`}>
      {telefono && (
        <>
          <a
            className={`${clase} text-emerald-700`}
            href={enlaceWhatsApp(telefono)}
            target="_blank"
            rel="noreferrer"
            title={es.gestion.whatsapp}
          >
            💬 {compacto ? telefono : `${es.gestion.whatsapp} ${telefono}`}
          </a>
          <a
            className={`${clase} text-slate-700`}
            href={enlaceLlamada(telefono)}
            title={es.gestion.llamar}
          >
            📞 {compacto ? "" : es.gestion.llamar}
          </a>
        </>
      )}
      {email && (
        <a
          className={`${clase} text-[var(--color-diprem)]`}
          href={enlaceCorreo(email)}
          title={es.gestion.escribirCorreo}
        >
          ✉️ {email}
        </a>
      )}
    </span>
  );
}
