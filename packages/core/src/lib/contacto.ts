/**
 * Datos de contacto accionables: el teléfono abre WhatsApp o llama con un
 * toque; el correo abre el cliente de email. Compartido web/móvil.
 */

/** Código de país por defecto cuando el número viene sin "+" (Chile). */
export const CODIGO_PAIS_DEFAULT = "56";

/** Deja solo dígitos, conservando el "+" inicial si existe. */
export function normalizarTelefono(telefono: string): string {
  const limpio = telefono.trim();
  const digitos = limpio.replace(/[^\d]/g, "");
  return limpio.startsWith("+") ? `+${digitos}` : digitos;
}

/** Teléfono con código de país: +XX seguido de 8 a 14 dígitos en total. */
export function esTelefonoValido(telefono: string): boolean {
  return /^\+\d{8,15}$/.test(normalizarTelefono(telefono));
}

/**
 * Dígitos internacionales para wa.me. Si el número no trae "+", se antepone
 * el código de país por defecto (los archivos del mercado suelen traer
 * números locales).
 */
function digitosInternacionales(telefono: string, codigoPais = CODIGO_PAIS_DEFAULT): string {
  const normalizado = normalizarTelefono(telefono);
  if (normalizado.startsWith("+")) return normalizado.slice(1);
  // Número local chileno tipo 912345678 → 56912345678
  return `${codigoPais}${normalizado.replace(/^0+/, "")}`;
}

export function enlaceWhatsApp(telefono: string, mensaje?: string): string {
  const base = `https://wa.me/${digitosInternacionales(telefono)}`;
  return mensaje ? `${base}?text=${encodeURIComponent(mensaje)}` : base;
}

/** tel: — en móvil marca con un toque; en escritorio abre la app de llamadas. */
export function enlaceLlamada(telefono: string): string {
  return `tel:+${digitosInternacionales(telefono)}`;
}

export function enlaceCorreo(email: string, asunto?: string): string {
  const base = `mailto:${email.trim()}`;
  return asunto ? `${base}?subject=${encodeURIComponent(asunto)}` : base;
}
