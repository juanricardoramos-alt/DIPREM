import type { Moneda } from "../types/dominio";
import { MONEDAS } from "./moneda";

/**
 * Importación masiva de proyectos del mercado nacional desde Excel/CSV.
 * El archivo se lee en el cliente (CSV aquí; XLSX con SheetJS en la web,
 * que entrega la misma matriz de celdas) y se valida ANTES de importar
 * para mostrar el preview: cuántos van a cargarse y qué filas tienen errores.
 */

export interface FilaProyecto {
  nombre: string;
  empresa: string;
  rubro: string | null;
  region: string | null;
  monto_estimado: number | null;
  moneda: Moneda;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  contacto_email: string | null;
  fuente: string | null;
}

export interface ErrorFila {
  fila: number; // número de fila en el archivo (1 = encabezado)
  motivo: string;
}

export interface ResultadoValidacion {
  validos: FilaProyecto[];
  errores: ErrorFila[];
  duplicadosEnArchivo: number;
  columnasDetectadas: string[];
  columnasFaltantes: string[];
}

// ---------------------------------------------------------------------------
// Parseo CSV (separador ; o , autodetectado; comillas y BOM soportados)
// ---------------------------------------------------------------------------
export function parsearCSV(texto: string): string[][] {
  const contenido = texto.replace(/^﻿/, "");
  const primeraLinea = contenido.split(/\r?\n/, 1)[0] ?? "";
  const separador =
    (primeraLinea.match(/;/g)?.length ?? 0) >= (primeraLinea.match(/,/g)?.length ?? 0)
      ? ";"
      : ",";

  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let enComillas = false;

  for (let i = 0; i < contenido.length; i++) {
    const c = contenido[i];
    if (enComillas) {
      if (c === '"') {
        if (contenido[i + 1] === '"') {
          celda += '"';
          i++;
        } else {
          enComillas = false;
        }
      } else {
        celda += c;
      }
    } else if (c === '"') {
      enComillas = true;
    } else if (c === separador) {
      fila.push(celda);
      celda = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && contenido[i + 1] === "\n") i++;
      fila.push(celda);
      celda = "";
      filas.push(fila);
      fila = [];
    } else {
      celda += c;
    }
  }
  if (celda !== "" || fila.length > 0) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas.filter((f) => f.some((v) => v.trim() !== ""));
}

// ---------------------------------------------------------------------------
// Mapeo de encabezados: acepta los nombres habituales de las planillas DIPREM
// ---------------------------------------------------------------------------
type CampoProyecto = keyof FilaProyecto;

const ALIAS_ENCABEZADOS: Record<CampoProyecto, string[]> = {
  nombre: ["nombre", "proyecto", "nombre del proyecto", "nombre proyecto", "obra"],
  empresa: ["empresa", "cliente", "mandante", "razon social", "compania"],
  rubro: ["rubro", "sector", "vertical", "industria"],
  region: ["region", "pais", "region/pais", "ubicacion", "zona"],
  monto_estimado: ["monto", "monto estimado", "presupuesto", "valor", "monto (clp)"],
  moneda: ["moneda", "divisa"],
  contacto_nombre: ["contacto", "nombre contacto", "contacto nombre", "persona de contacto"],
  contacto_telefono: ["telefono", "fono", "celular", "movil", "telefono contacto"],
  contacto_email: ["correo", "email", "e-mail", "mail", "correo electronico", "correo contacto"],
  fuente: ["fuente", "origen", "portal"],
};

const CAMPOS_OBLIGATORIOS: CampoProyecto[] = ["nombre", "empresa"];

function normalizarEncabezado(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // sin tildes
    .toLowerCase()
    .replace(/[^a-z0-9/() ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectarColumnas(encabezados: string[]): Partial<Record<CampoProyecto, number>> {
  const indices: Partial<Record<CampoProyecto, number>> = {};
  encabezados.forEach((encabezado, i) => {
    const normalizado = normalizarEncabezado(encabezado);
    if (!normalizado) return;
    for (const [campo, alias] of Object.entries(ALIAS_ENCABEZADOS) as [
      CampoProyecto,
      string[],
    ][]) {
      if (indices[campo] !== undefined) continue;
      if (alias.some((a) => normalizado === a || normalizado.startsWith(`${a} `))) {
        indices[campo] = i;
        return;
      }
    }
  });
  return indices;
}

/** "1.500.000", "$ 2,500.50", "1500000" → número (o null si no se entiende). */
export function parsearMonto(texto: string): number | null {
  const limpio = texto.replace(/[^0-9.,-]/g, "");
  if (!limpio) return null;
  const ultimoPunto = limpio.lastIndexOf(".");
  const ultimaComa = limpio.lastIndexOf(",");
  let normalizado = limpio;
  if (ultimoPunto >= 0 && ultimaComa >= 0) {
    // Ambos presentes: el último es el separador decimal
    normalizado =
      ultimaComa > ultimoPunto
        ? limpio.replace(/\./g, "").replace(",", ".")
        : limpio.replace(/,/g, "");
  } else if (ultimaComa >= 0) {
    // Solo coma: decimal si deja 1-2 dígitos; si no, miles
    const decimales = limpio.length - ultimaComa - 1;
    normalizado =
      decimales <= 2 && limpio.indexOf(",") === ultimaComa
        ? limpio.replace(",", ".")
        : limpio.replace(/,/g, "");
  } else if (ultimoPunto >= 0) {
    const decimales = limpio.length - ultimoPunto - 1;
    normalizado =
      decimales <= 2 && limpio.indexOf(".") === ultimoPunto
        ? limpio
        : limpio.replace(/\./g, "");
  }
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Valida la matriz de celdas (primera fila = encabezados) y arma el preview.
 * No importa nada: solo clasifica filas en válidas / con error / duplicadas.
 */
export function validarProyectos(celdas: string[][]): ResultadoValidacion {
  const [encabezados, ...filas] = celdas;
  if (!encabezados) {
    return {
      validos: [],
      errores: [{ fila: 1, motivo: "El archivo está vacío" }],
      duplicadosEnArchivo: 0,
      columnasDetectadas: [],
      columnasFaltantes: [...CAMPOS_OBLIGATORIOS],
    };
  }

  const indices = detectarColumnas(encabezados);
  const columnasFaltantes = CAMPOS_OBLIGATORIOS.filter((c) => indices[c] === undefined);
  const columnasDetectadas = Object.keys(indices);
  if (columnasFaltantes.length > 0) {
    return {
      validos: [],
      errores: [
        {
          fila: 1,
          motivo: `No se encontraron las columnas obligatorias: ${columnasFaltantes.join(", ")}`,
        },
      ],
      duplicadosEnArchivo: 0,
      columnasDetectadas,
      columnasFaltantes,
    };
  }

  const valor = (fila: string[], campo: CampoProyecto): string =>
    indices[campo] === undefined ? "" : (fila[indices[campo]] ?? "").trim();

  const validos: FilaProyecto[] = [];
  const errores: ErrorFila[] = [];
  const vistos = new Set<string>();
  let duplicadosEnArchivo = 0;

  filas.forEach((fila, i) => {
    const numeroFila = i + 2; // +1 por el encabezado, +1 por índice base 1
    const nombre = valor(fila, "nombre");
    const empresa = valor(fila, "empresa");
    if (!nombre || !empresa) {
      errores.push({
        fila: numeroFila,
        motivo: !nombre ? "Falta el nombre del proyecto" : "Falta la empresa",
      });
      return;
    }

    const email = valor(fila, "contacto_email");
    if (email && !EMAIL_VALIDO.test(email)) {
      errores.push({ fila: numeroFila, motivo: `Correo inválido: ${email}` });
      return;
    }

    const clave = `${nombre.toLowerCase()}|${empresa.toLowerCase()}`;
    if (vistos.has(clave)) {
      duplicadosEnArchivo++;
      return;
    }
    vistos.add(clave);

    const monedaTexto = valor(fila, "moneda").toUpperCase();
    const moneda: Moneda = (MONEDAS as readonly string[]).includes(monedaTexto)
      ? (monedaTexto as Moneda)
      : "CLP";

    validos.push({
      nombre,
      empresa,
      rubro: valor(fila, "rubro") || null,
      region: valor(fila, "region") || null,
      monto_estimado: parsearMonto(valor(fila, "monto_estimado")),
      moneda,
      contacto_nombre: valor(fila, "contacto_nombre") || null,
      contacto_telefono: valor(fila, "contacto_telefono") || null,
      contacto_email: email || null,
      fuente: valor(fila, "fuente") || null,
    });
  });

  return { validos, errores, duplicadosEnArchivo, columnasDetectadas, columnasFaltantes: [] };
}
