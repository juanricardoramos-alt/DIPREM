"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  es,
  parsearCSV,
  validarProyectos,
  type ResultadoValidacion,
} from "@diprem/core";
import { importarProyectosMercado } from "@diprem/api";
import { useSupabase } from "@/lib/hooks";
import { Boton, Dialogo } from "@/components/ui";

/** Lee el archivo a una matriz de celdas: CSV con el parser propio, XLSX con SheetJS. */
async function leerArchivo(archivo: File): Promise<string[][]> {
  if (/\.csv$/i.test(archivo.name)) {
    return parsearCSV(await archivo.text());
  }
  const XLSX = await import("xlsx");
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
  const primeraHoja = libro.Sheets[libro.SheetNames[0] ?? ""];
  if (!primeraHoja) return [];
  const celdas = XLSX.utils.sheet_to_json(primeraHoja, {
    header: 1,
    raw: false,
    defval: "",
  }) as string[][];
  return celdas.map((fila) => fila.map((celda) => String(celda ?? "")));
}

export function ImportadorMercado({
  abierto,
  onCerrar,
}: {
  abierto: boolean;
  onCerrar: () => void;
}) {
  const supabase = useSupabase();
  const queryClient = useQueryClient();

  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [validacion, setValidacion] = useState<ResultadoValidacion | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const limpiar = () => {
    setNombreArchivo(null);
    setValidacion(null);
    setResultado(null);
    setError(null);
  };

  const cerrar = () => {
    limpiar();
    onCerrar();
  };

  const analizar = async (archivo: File) => {
    limpiar();
    setNombreArchivo(archivo.name);
    setAnalizando(true);
    try {
      const celdas = await leerArchivo(archivo);
      setValidacion(validarProyectos(celdas));
    } catch (e) {
      setError((e as Error).message || es.comunes.errorGenerico);
    } finally {
      setAnalizando(false);
    }
  };

  const importar = useMutation({
    mutationFn: async () => {
      if (!validacion || validacion.validos.length === 0) {
        throw new Error(es.comunes.errorGenerico);
      }
      return importarProyectosMercado(supabase, validacion.validos);
    },
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ["mercado"] });
      setResultado(es.mercado.resultadoImportacion(r.insertados, r.duplicados));
      setValidacion(null);
      setError(null);
    },
    onError: (e: Error) => setError(e.message || es.comunes.errorGenerico),
  });

  return (
    <Dialogo abierto={abierto} titulo={es.mercado.importarTitulo} onCerrar={cerrar}>
      <div className="space-y-4">
        <p className="text-sm text-tinta-suave">{es.mercado.formatoAyuda}</p>

        <label className="block cursor-pointer rounded-lg border-2 border-dashed border-borde p-6 text-center text-sm text-tinta-suave hover:border-primario">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const archivo = e.target.files?.[0];
              if (archivo) void analizar(archivo);
              e.target.value = "";
            }}
          />
          {nombreArchivo ? `📄 ${nombreArchivo}` : `📂 ${es.mercado.seleccionarArchivo}`}
        </label>

        {analizando && <p className="text-sm text-tinta-tenue">{es.mercado.analizando}</p>}

        {/* Preview de validación antes de importar */}
        {validacion && (
          <div className="space-y-2 rounded-lg border border-borde bg-superficie-2 p-4 text-sm">
            <p className="font-semibold">{es.mercado.previewTitulo}</p>
            <p className="text-emerald-700 dark:text-emerald-300">
              ✓ {es.mercado.filasValidas(validacion.validos.length)}
            </p>
            {validacion.duplicadosEnArchivo > 0 && (
              <p className="text-amber-700 dark:text-amber-300">
                ⚠ {es.mercado.duplicadosArchivo(validacion.duplicadosEnArchivo)}
              </p>
            )}
            {validacion.errores.length > 0 && (
              <div className="text-red-700 dark:text-red-400">
                <p>✗ {es.mercado.filasConError(validacion.errores.length)}</p>
                <ul className="mt-1 max-h-32 list-inside list-disc overflow-y-auto text-xs">
                  {validacion.errores.slice(0, 15).map((e) => (
                    <li key={`${e.fila}-${e.motivo}`}>
                      Fila {e.fila}: {e.motivo}
                    </li>
                  ))}
                  {validacion.errores.length > 15 && (
                    <li>… y {validacion.errores.length - 15} más</li>
                  )}
                </ul>
              </div>
            )}

            {/* Muestra de los primeros proyectos válidos */}
            {validacion.validos.length > 0 && (
              <div className="overflow-x-auto">
                <table className="mt-2 w-full text-xs">
                  <thead className="text-left uppercase text-tinta-tenue">
                    <tr>
                      <th className="py-1 pr-3">{es.mercado.proyecto}</th>
                      <th className="py-1 pr-3">{es.mercado.empresa}</th>
                      <th className="py-1 pr-3">{es.mercado.contacto}</th>
                      <th className="py-1">{es.mercado.fuente}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validacion.validos.slice(0, 5).map((p) => (
                      <tr key={`${p.nombre}-${p.empresa}`} className="border-t border-borde">
                        <td className="py-1 pr-3">{p.nombre}</td>
                        <td className="py-1 pr-3">{p.empresa}</td>
                        <td className="py-1 pr-3">
                          {[p.contacto_nombre, p.contacto_telefono, p.contacto_email]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </td>
                        <td className="py-1">{p.fuente ?? "—"}</td>
                      </tr>
                    ))}
                    {validacion.validos.length > 5 && (
                      <tr className="border-t border-borde text-tinta-tenue">
                        <td colSpan={4} className="py-1">
                          … y {validacion.validos.length - 5} más
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {resultado && (
          <p className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2 text-sm text-emerald-800 dark:text-emerald-300">
            ✓ {resultado}
          </p>
        )}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Boton type="button" variante="secundario" onClick={cerrar}>
            {resultado ? "Cerrar" : es.comunes.cancelar}
          </Boton>
          {validacion && validacion.validos.length > 0 && (
            <Boton onClick={() => importar.mutate()} disabled={importar.isPending}>
              {importar.isPending
                ? es.mercado.importando
                : `${es.mercado.confirmarImportar} (${validacion.validos.length})`}
            </Boton>
          )}
        </div>
      </div>
    </Dialogo>
  );
}
