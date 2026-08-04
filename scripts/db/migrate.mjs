#!/usr/bin/env node
/**
 * Runner de migraciones DIPREM (Neon / Postgres).
 *
 * Aplica en orden los db/migrations/*.sql pendientes usando psql, registrando
 * cada una en la tabla _migraciones. Cada migración corre en UNA transacción
 * junto con su registro (o entra completa, o no entra).
 *
 * La cadena de conexión SOLO se lee de la variable de entorno DATABASE_URL —
 * nunca de un archivo del repo. Contra Neon, apuntarla a la rama que
 * corresponda (dev para F0–F4; production recién en F5).
 *
 * Uso:  DATABASE_URL=postgresql://... node scripts/db/migrate.mjs [--dry-run]
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "Falta DATABASE_URL en el entorno.\n" +
      "Ejemplo: DATABASE_URL='postgresql://usuario:...@ep-xxx.neon.tech/neondb?sslmode=require' pnpm db:migrate\n" +
      "(la cadena de conexión nunca va en un archivo del repo)",
  );
  process.exit(1);
}
const dryRun = process.argv.includes("--dry-run");

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "db", "migrations");
const archivos = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const a of archivos) {
  if (!/^[0-9]{4}[a-z0-9_]+\.sql$/.test(a)) {
    console.error(`Nombre de migración inválido: ${a} (se espera NNNN_nombre.sql)`);
    process.exit(1);
  }
}

function psql(args, entrada) {
  return execFileSync("psql", [url, "-X", "-q", "-v", "ON_ERROR_STOP=1", ...args], {
    encoding: "utf8",
    input: entrada,
    stdio: [entrada === undefined ? "ignore" : "pipe", "pipe", "inherit"],
  });
}

psql([
  "-c",
  `create table if not exists _migraciones (
     nombre text primary key,
     aplicada_en timestamptz not null default now()
   )`,
]);

const aplicadas = new Set(
  psql(["-tAc", "select nombre from _migraciones"]).split("\n").filter(Boolean),
);

const pendientes = archivos.filter((a) => !aplicadas.has(a));
if (pendientes.length === 0) {
  console.log("Sin migraciones pendientes.");
  process.exit(0);
}

for (const a of pendientes) {
  if (dryRun) {
    console.log(`pendiente: ${a}`);
    continue;
  }
  console.log(`aplicando ${a}…`);
  const sql = readFileSync(join(dir, a), "utf8");
  // Migración + registro en la misma transacción (los .sql no llevan BEGIN/COMMIT propios)
  psql(
    ["-f", "-"],
    `begin;\n${sql}\ninsert into _migraciones (nombre) values ('${a}');\ncommit;\n`,
  );
}
if (!dryRun) console.log(`Listo: ${pendientes.length} migración(es) aplicadas.`);
