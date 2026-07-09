# DIPREM CRM

Plataforma de gestión comercial + CRM para **DIPREM** (servicios industriales:
gestión de proyectos + QA/QC, SSO y medio ambiente, control de contratistas).
Web (Next.js) + móvil (Expo) sobre Supabase, en un monorepo Turborepo.

| Documento | Contenido |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | Especificación funcional completa (memoria del proyecto) |
| [`docs/CONTEXTO-DIPREM.md`](./docs/CONTEXTO-DIPREM.md) | Contexto de negocio extraído de los brochures oficiales |
| [`docs/PLAN-ARQUITECTURA.md`](./docs/PLAN-ARQUITECTURA.md) | Plan técnico aprobado: stack, carpetas, esquema SQL, fases |

**Estado:** ✅ Fase 0 — base del monorepo, BD con RLS, autenticación y navegación por rol.

---

## Estructura

```
apps/web       → Next.js 15 (PC / navegador)
apps/mobile    → Expo SDK 53 (iOS / Android)
packages/core  → tipos, Zod, strings es, navegación RBAC
packages/api   → cliente Supabase + helpers de dominio
supabase/      → migraciones SQL, RLS, seed DIPREM
```

## Cómo correr en local

Requisitos: Node 20+, pnpm 10, Docker y [Supabase CLI](https://supabase.com/docs/guides/local-development).

```bash
pnpm install

# 1. Base de datos local (aplica migraciones + seed automáticamente)
supabase start
supabase db reset

# 2. Variables de entorno (la anon key la muestra `supabase status`)
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env

# 3. Web → http://localhost:3000
pnpm --filter @diprem/web dev

# 4. Móvil (Expo Go; usa la IP LAN en EXPO_PUBLIC_SUPABASE_URL)
pnpm --filter @diprem/mobile dev
```

### Usuarios demo (solo local — contraseña: `diprem123`)

| Email | Rol | Equipo |
|---|---|---|
| `admin@diprem.local` | Administrador | — |
| `gerente.cl@diprem.local` | Gerente | Chile — Santiago |
| `ejecutivo.cl@diprem.local` | Ejecutivo | Chile — Santiago |
| `gerente.ar@diprem.local` | Gerente | Argentina — Buenos Aires |
| `ejecutivo.ar@diprem.local` | Ejecutivo (cartera minera demo) | Argentina — Buenos Aires |
| `lectura@diprem.local` | Solo lectura | — |

### Comandos útiles

```bash
pnpm typecheck   # typecheck de todo el monorepo
pnpm build       # build de producción
pnpm db:reset    # reaplicar migraciones + seed
```
