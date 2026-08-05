# Base de datos DIPREM en Neon

Migraciones SQL de la plataforma sobre **Neon Postgres**. La carpeta
`supabase/` del repo queda solo como **referencia histórica** del modelo
aprobado (era Supabase); lo vigente es esto.

## Reglas

- **`DATABASE_URL` solo por variable de entorno.** Nunca en un archivo del
  repo, nunca en git. La cadena de `neondb_owner` bypasea RLS: es únicamente
  para migraciones y scripts de carga aprobados, jamás para la aplicación.
- **Ramas de Neon:** F0–F4 corren contra la rama `dev` del proyecto Neon.
  `production` no se toca hasta F5.
- **Cero datos demo.** Las migraciones cargan solo catálogos de negocio
  (pilares, líneas, servicios, embudo, motivos, reglas de clasificación).
  Usuarios, cuentas y contactos entran únicamente por la aplicación o por el
  pipeline de carga aprobado (Fase 8, Bloque A).

## Uso

```bash
# Aplicar migraciones pendientes (la URL apunta a la rama de Neon que toque)
DATABASE_URL='postgresql://…@ep-….neon.tech/neondb?sslmode=require' pnpm db:migrate

# Ver qué está pendiente sin aplicar nada
DATABASE_URL='…' pnpm db:migrate -- --dry-run

# Validar todo el set en un Postgres 16 local desechable (no toca nada remoto)
pnpm db:validar
```

El runner (`scripts/db/migrate.mjs`) aplica `db/migrations/*.sql` en orden,
cada migración en una transacción junto con su registro en `_migraciones`.

## Estado por fases (migración Supabase → Neon)

- **F0 (esto):** esquema completo portado (0001–0011) con RLS habilitado en
  todas las tablas y **cero políticas/grants** → deny-all para la Data API
  hasta F1. Identidad: `usuarios.auth_id` (claim `sub` de Neon Auth) +
  `public.usuario_actual()`, que reemplaza al `auth.uid()` de Supabase.
- **F1 (siguiente):** helpers de rol, grants explícitos mínimos y las
  políticas RLS por rol. Incluye la prueba bloqueante: un usuario registrado
  desde internet sin fila en `usuarios` no ve **nada**.
