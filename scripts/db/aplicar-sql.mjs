#!/usr/bin/env node
/**
 * Aplica archivos .sql sueltos contra la base de DATABASE_URL — 100% Node,
 * sin psql. Pensado para los archivos de carga generados fuera del repo
 * (p. ej. la carga iMercados): cada archivo trae su propio begin/commit.
 *
 * Los resultados de los SELECT (p. ej. el archivo de verificación) se
 * muestran en pantalla como tabla.
 *
 * Uso:
 *   DATABASE_URL=postgresql://... node scripts/db/aplicar-sql.mjs a.sql b.sql…
 *   (en PowerShell: node scripts/db/aplicar-sql.mjs (Get-ChildItem carga_0*.sql | Sort-Object Name | ForEach-Object FullName))
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL en el entorno.");
  process.exit(1);
}
const archivos = process.argv.slice(2);
if (archivos.length === 0) {
  console.error("Uso: node scripts/db/aplicar-sql.mjs <archivo.sql> [más archivos…]");
  process.exit(1);
}

const config = { connectionString: url };
if (/\bsslmode=require\b/.test(url)) config.ssl = { rejectUnauthorized: true };

const cliente = new pg.Client(config);
await cliente.connect();

try {
  for (const ruta of archivos) {
    const sql = readFileSync(ruta, "utf8");
    process.stdout.write(`— ${basename(ruta)}… `);
    const inicio = Date.now();
    let res;
    try {
      // Protocolo simple: el archivo completo (multi-sentencia) en una query.
      res = await cliente.query(sql);
    } catch (e) {
      await cliente.query("rollback").catch(() => {});
      console.error(`\nERROR en ${basename(ruta)}: ${e.message}`);
      process.exit(1);
    }
    console.log(`OK (${((Date.now() - inicio) / 1000).toFixed(1)}s)`);
    // Mostrar todo resultado con filas (los SELECT de verificación)
    for (const r of Array.isArray(res) ? res : [res]) {
      if (r?.rows?.length) console.table(r.rows);
    }
  }
  console.log(`Listo: ${archivos.length} archivo(s) aplicados.`);
} finally {
  await cliente.end();
}
