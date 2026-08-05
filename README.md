# DIPREM CRM

Plataforma de gestión comercial + CRM para **DIPREM** (servicios industriales:
gestión de proyectos + QA/QC, SSO y medio ambiente, control de contratistas).
Web (Next.js) + móvil (Expo) sobre **Neon** (Postgres + Neon Auth + Data API),
en un monorepo Turborepo.

| Documento | Contenido |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | Especificación funcional completa (memoria del proyecto) |
| [`docs/CONTEXTO-DIPREM.md`](./docs/CONTEXTO-DIPREM.md) | Contexto de negocio extraído de los brochures oficiales |
| [`docs/PLAN-ARQUITECTURA.md`](./docs/PLAN-ARQUITECTURA.md) | Plan técnico aprobado: stack, carpetas, esquema SQL, fases |
| [`docs/RADAR-PROYECTOS.md`](./docs/RADAR-PROYECTOS.md) | Radar de Proyectos: score, mapeo etapa→pilar, requisitos |
| [`docs/DEUDA-TECNICA.md`](./docs/DEUDA-TECNICA.md) | Riesgos aceptados a sabiendas (revisar antes de publicar) |
| [`docs/DEPLOY.md`](./docs/DEPLOY.md) | Publicar en Vercel leyendo una rama de Neon |

**Estado:** Fase 8 — motor comercial sobre Neon: perímetro anti-extracción
(RLS + PII por columna + cuotas), carga iMercados (4.520 cuentas / 422
proyectos / 11.317 contactos), scoring con desglose auditable, Radar de
Proyectos, Control por resultado y demo de gestión sembrada (rama Neon
`demo`).

---

## Estructura

```
apps/web        → Next.js 15 (PC / navegador)
apps/mobile     → Expo SDK 53 (iOS / Android)
packages/core   → tipos, Zod, strings es, navegación RBAC, lógica de dominio
packages/api    → cliente de datos (Neon Data API) + helpers de dominio
db/migrations   → migraciones SQL (fuente de verdad del esquema + RLS)
scripts/db      → runner de migraciones (Node), aplicador de SQL, validador local
scripts/ingesta → dry-run y generador de la carga iMercados (datos fuera del repo)
scripts/demo    → siembra de la demo (solo rama Neon demo)
```

## Cómo correr en local

Requisitos: Node 20+, pnpm 10 y un proyecto Neon (rama `dev`).

```bash
pnpm install

# 1. Variables de entorno (valores reales de la consola Neon, rama dev)
cp apps/web/.env.example apps/web/.env.local

# 2. Migraciones contra la rama que corresponda (la cadena NUNCA va al repo)
DATABASE_URL='postgresql://…' pnpm db:migrate

# 3. Web → https://localhost:3000 (HTTPS: la cookie de sesión lo exige)
pnpm --filter @diprem/web dev
```

Los usuarios se crean por **allowlist**: el registro público de Neon Auth no
otorga acceso a datos; un admin crea el perfil en `usuarios` y lo enlaza al
`auth_id`. No existen usuarios ni contraseñas de prueba en el repositorio.

### Comandos útiles

```bash
pnpm typecheck    # typecheck de todo el monorepo
pnpm build        # build de producción
pnpm db:migrate   # aplicar migraciones pendientes (usa DATABASE_URL del entorno)
pnpm db:aplicar   # aplicar archivos .sql sueltos (p. ej. la carga iMercados)
pnpm db:validar   # suite completa en un Postgres local desechable
```
