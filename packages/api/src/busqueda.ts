import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Buscador global: cuentas, leads, oportunidades, proyectos del mercado y
 * ejecutivos en una sola consulta paralela. La RLS decide qué encuentra cada
 * rol; las fuentes que fallen (p. ej. tabla de mercado sin migrar o sin
 * permiso) se omiten en silencio.
 */

export type TipoResultado = "cuenta" | "lead" | "oportunidad" | "proyecto" | "ejecutivo";

export interface ResultadoBusqueda {
  tipo: TipoResultado;
  id: string;
  titulo: string;
  subtitulo: string | null;
  ruta: string;
}

const LIMITE_POR_TIPO = 5;

export async function busquedaGlobal(
  sb: SupabaseClient,
  texto: string,
): Promise<ResultadoBusqueda[]> {
  const limpio = texto.trim();
  if (limpio.length < 2) return [];
  const b = `%${limpio}%`;

  const [cuentas, leads, oportunidades, proyectos, ejecutivos] =
    await Promise.allSettled([
      sb
        .from("cuentas")
        .select("id, razon_social, pais")
        .ilike("razon_social", b)
        .limit(LIMITE_POR_TIPO),
      sb
        .from("leads")
        .select("id, nombre, empresa")
        .or(`nombre.ilike.${b},empresa.ilike.${b}`)
        .limit(LIMITE_POR_TIPO),
      sb
        .from("oportunidades")
        .select("id, nombre, cuenta_id, cuenta:cuentas!oportunidades_cuenta_id_fkey(razon_social)")
        .ilike("nombre", b)
        .limit(LIMITE_POR_TIPO),
      sb
        .from("proyectos_mercado")
        .select("id, nombre, empresa")
        .or(`nombre.ilike.${b},empresa.ilike.${b}`)
        .limit(LIMITE_POR_TIPO),
      sb
        .from("usuarios")
        .select("id, nombre, rol")
        .ilike("nombre", b)
        .eq("activo", true)
        .limit(LIMITE_POR_TIPO),
    ]);

  const filas = <T>(r: PromiseSettledResult<{ data: unknown; error: unknown }>): T[] =>
    r.status === "fulfilled" && !r.value.error && Array.isArray(r.value.data)
      ? (r.value.data as T[])
      : [];

  const resultados: ResultadoBusqueda[] = [];

  for (const c of filas<{ id: string; razon_social: string; pais: string | null }>(cuentas)) {
    resultados.push({
      tipo: "cuenta",
      id: c.id,
      titulo: c.razon_social,
      subtitulo: c.pais,
      ruta: `/cuentas/${c.id}`,
    });
  }
  for (const l of filas<{ id: string; nombre: string; empresa: string | null }>(leads)) {
    resultados.push({
      tipo: "lead",
      id: l.id,
      titulo: l.nombre,
      subtitulo: l.empresa,
      ruta: `/leads/${l.id}`,
    });
  }
  for (const o of filas<{
    id: string;
    nombre: string;
    cuenta_id: string;
    cuenta: { razon_social: string } | null;
  }>(oportunidades)) {
    resultados.push({
      tipo: "oportunidad",
      id: o.id,
      titulo: o.nombre,
      subtitulo: o.cuenta?.razon_social ?? null,
      // Sin página propia de oportunidad: se abre desde la cuenta
      ruta: `/cuentas/${o.cuenta_id}`,
    });
  }
  for (const p of filas<{ id: string; nombre: string; empresa: string }>(proyectos)) {
    resultados.push({
      tipo: "proyecto",
      id: p.id,
      titulo: p.nombre,
      subtitulo: p.empresa,
      ruta: `/mercado?buscar=${encodeURIComponent(p.nombre)}`,
    });
  }
  for (const u of filas<{ id: string; nombre: string; rol: string }>(ejecutivos)) {
    resultados.push({
      tipo: "ejecutivo",
      id: u.id,
      titulo: u.nombre,
      subtitulo: u.rol,
      ruta: "/reportes",
    });
  }

  return resultados;
}
