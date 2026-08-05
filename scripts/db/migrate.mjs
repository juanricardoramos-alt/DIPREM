#!/usr/bin/env node
/**
 * Runner de migraciones DIPREM (Neon / Postgres) — 100% Node, sin psql.
 *
 * Aplica en orden los db/migrations/*.sql pendientes usando la librería `pg`,
 * registrando cada una en la tabla _migraciones. Cada migración corre en UNA
 * transacción junto con su registro (o entra completa, o no entra).
 *
 * La cadena de conexión SOLO se lee de la variable de entorno DATABASE_URL —
 * nunca de un archivo del repo. Contra Neon, apuntarla a la rama que
 * corresponda (dev para F0–F4; production recién en F5).
 *
 * Uso:  DATABASE_URL=postgresql://... node scripts/db/migrate.mjs [--dry-run]
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

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

// Neon exige TLS (sslmode=require en la cadena) y usa certificados públicos
// → verificación completa. El validador local (socket unix) va sin TLS.
const config = { connectionString: url };
if (/\bsslmode=require\b/.test(url)) config.ssl = { rejectUnauthorized: true };

const cliente = new pg.Client(config);
await cliente.connect();

try {
  await cliente.query(
    `create table if not exists _migraciones (
       nombre text primary key,
       aplicada_en timestamptz not null default now()
     )`,
  );

  const { rows } = await cliente.query("select nombre from _migraciones");
  const aplicadas = new Set(rows.map((r) => r.nombre));

  const pendientes = archivos.filter((a) => !aplicadas.has(a));
  if (pendientes.length === 0) {
    console.log("Sin migraciones pendientes.");
  } else {
    for (const a of pendientes) {
      if (dryRun) {
        console.log(`pendiente: ${a}`);
        continue;
      }
      console.log(`aplicando ${a}…`);
      const sql = readFileSync(join(dir, a), "utf8");
      // Una sola query multi-sentencia (protocolo simple): migración + registro
      // en la misma transacción. Los .sql no llevan BEGIN/COMMIT propios.
      try {
        await cliente.query(
          `begin;\n${sql}\ninsert into _migraciones (nombre) values ('${a}');\ncommit;\n`,
        );
      } catch (e) {
        await cliente.query("rollback").catch(() => {});
        console.error(`\nERROR en ${a}: ${e.message}`);
        if (e.position) console.error(`(posición ${e.position} del SQL combinado)`);
        process.exitCode = 1;
        break;
      }
    }
    if (!dryRun && process.exitCode !== 1)
      console.log(`Listo: ${pendientes.length} migración(es) aplicadas.`);
  }
} finally {
  await cliente.end();
}
