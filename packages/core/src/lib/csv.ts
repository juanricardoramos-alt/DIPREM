/** Generación de CSV compatible con Excel (BOM UTF-8, separador ;). */

export interface ColumnaCSV<T> {
  titulo: string;
  valor: (fila: T) => string | number | null | undefined;
}

export function generarCSV<T>(filas: T[], columnas: ColumnaCSV<T>[]): string {
  const escapar = (v: string | number | null | undefined): string => {
    const s = v == null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const encabezado = columnas.map((c) => escapar(c.titulo)).join(";");
  const cuerpo = filas
    .map((f) => columnas.map((c) => escapar(c.valor(f))).join(";"))
    .join("\n");
  // BOM para que Excel abra UTF-8 con tildes correctas
  return `﻿${encabezado}\n${cuerpo}`;
}
