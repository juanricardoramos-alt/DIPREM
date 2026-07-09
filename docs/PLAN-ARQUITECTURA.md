# 🏗️ Plan de Arquitectura — DIPREM CRM

> **Estado: 🟡 PENDIENTE DE APROBACIÓN.** Este es el plan que se presenta antes de
> escribir código de aplicación (regla del prompt maestro). Al aprobarse, se marca
> ✅ y arranca la Fase 0.

---

## 1. Decisión de stack

**Elegido: monorepo TypeScript — Turborepo + Next.js (web) + Expo (móvil) + Supabase.**

| Criterio | Por qué esta opción gana |
|---|---|
| Un solo lenguaje | TypeScript de punta a punta: menos errores, tipos compartidos entre BD ↔ API ↔ web ↔ móvil. |
| Velocidad al MVP | Supabase entrega Auth + PostgreSQL + RLS + Storage + Realtime sin construir backend propio. |
| Móvil real | Expo da apps nativas iOS/Android con push (Expo Notifications) — clave para "Mi Día" y recordatorios en terreno. |
| Reutilización | Esquemas Zod, tipos y hooks de datos viven en `packages/` y los usan ambas apps. |
| Trazabilidad | RLS + triggers de auditoría en PostgreSQL: la seguridad vive en la BD, no solo en la UI. |

**Alternativas evaluadas y descartadas (por ahora):**
- *PWA única (solo Next.js):* más rápida de lanzar, pero push en iOS es limitado y el modo offline en terreno (faenas mineras) es más frágil. Se pierde la experiencia nativa que el brief prioriza.
- *NestJS + Prisma propio:* máximo control/on-premise, pero duplica trabajo de auth, realtime y storage sin necesidad actual. Migrable después: el esquema SQL es PostgreSQL estándar.
- *Flutter:* excluido por consistencia con el ecosistema TS y las recomendaciones del brief.

---

## 2. Arquitectura general

```
┌─────────────────┐      ┌─────────────────┐
│   apps/web       │      │   apps/mobile   │
│   Next.js 14     │      │   Expo RN       │
│   (PC/navegador) │      │   (iOS/Android) │
└────────┬────────┘      └────────┬────────┘
         │    packages/core · api  │
         │    (tipos, Zod, hooks)  │
         └───────────┬─────────────┘
                     ▼
        ┌─────────────────────────┐
        │        SUPABASE          │
        │  PostgreSQL + RLS        │
        │  Auth (email/password)   │
        │  Storage (PDFs)          │
        │  Realtime (dashboards)   │
        │  Edge Functions (push,   │
        │   recordatorios, PDF)    │
        └─────────────────────────┘
```

- **Autorización en la BD (RLS):** ejecutivo ve lo suyo; gerente ve su equipo; admin todo; lectura solo consulta. La UI jamás es la única barrera.
- **Realtime** para dashboards del gerente y Kanban colaborativo.
- **Edge Functions** para: envío de push programado (recordatorios/seguimientos), generación de PDF de propuestas, resumen de fin de día.
- **Cron de Supabase (pg_cron)** para detectar "sin contacto hace N días" y "propuesta estancada" → inserta notificaciones → Edge Function envía push.

---

## 3. Estructura del monorepo

```
DIPREM/
├── apps/
│   ├── web/                       # Next.js App Router (PC)
│   │   ├── app/
│   │   │   ├── (auth)/login/
│   │   │   ├── (app)/
│   │   │   │   ├── mi-dia/        # también en web, home del ejecutivo
│   │   │   │   ├── cuentas/
│   │   │   │   ├── oportunidades/ # Kanban
│   │   │   │   ├── actividades/
│   │   │   │   ├── propuestas/
│   │   │   │   ├── reportes/
│   │   │   │   └── admin/         # embudo, servicios, usuarios, metas
│   │   │   └── layout.tsx
│   │   └── components/
│   ├── mobile/                    # Expo (iOS/Android)
│   │   ├── app/                   # expo-router
│   │   │   ├── (auth)/login.tsx
│   │   │   └── (tabs)/
│   │   │       ├── index.tsx      # ⭐ Mi Día (pantalla por defecto)
│   │   │       ├── cuentas.tsx
│   │   │       ├── oportunidades.tsx
│   │   │       └── perfil.tsx
│   │   └── components/
├── packages/
│   ├── core/                      # dominio compartido
│   │   ├── src/types/             # tipos generados de la BD + de dominio
│   │   ├── src/schemas/           # Zod: validaciones de formularios y API
│   │   └── src/lib/               # lógica pura: KPIs, formato moneda, fechas
│   ├── api/                       # cliente Supabase tipado + hooks TanStack Query
│   │   └── src/hooks/             # useOportunidades, useMiDia, useMetas...
│   └── config/                    # eslint, tsconfig, tailwind preset compartidos
├── supabase/
│   ├── migrations/                # SQL versionado (esquema §4)
│   ├── seed.sql                   # pilares, servicios, etapas DIPREM, datos demo
│   └── functions/                 # edge functions (push, pdf, resumen-dia)
├── docs/
│   ├── CONTEXTO-DIPREM.md
│   └── PLAN-ARQUITECTURA.md
├── CLAUDE.md
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 4. Esquema de base de datos (PostgreSQL / Supabase)

### 4.1 Enums

```sql
create type rol_usuario        as enum ('ejecutivo','gerente','admin','lectura');
create type vertical_cuenta    as enum ('mineria','energia','infraestructura',
                                        'construccion','industrial','oil_gas','otro');
create type estado_cuenta      as enum ('prospecto','activa','inactiva');
create type fuente_lead        as enum ('referido','licitacion','web','evento',
                                        'linkedin','red_comercial','otro');
create type calificacion_lead  as enum ('frio','tibio','caliente');
create type estado_lead        as enum ('nuevo','en_gestion','convertido','descartado');
create type tipo_actividad     as enum ('llamada','reunion','visita_terreno',
                                        'email','whatsapp','tarea');
create type estado_actividad   as enum ('pendiente','completada','cancelada');
create type modalidad_contrato as enum ('proyecto','mensual_recurrente','outsourcing');
create type estado_propuesta   as enum ('borrador','pendiente_aprobacion','aprobada',
                                        'enviada','aceptada','rechazada');
create type tipo_meta          as enum ('monto_adjudicado','propuestas_enviadas',
                                        'actividades','oportunidades_nuevas');
create type moneda             as enum ('USD','CLP','ARS','COP','BRL','MXN','PEN','EUR');
```

### 4.2 Tablas núcleo

```sql
-- Equipos = oficina/país (multi-equipo desde el día 1)
create table equipos (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,               -- "Chile - Santiago", "Argentina - BsAs"
  pais           text not null,
  moneda_default moneda not null default 'USD',
  gerente_id     uuid,                        -- fk a usuarios (alter luego)
  creado_en      timestamptz not null default now()
);

-- Perfil de usuario (1:1 con auth.users de Supabase)
create table usuarios (
  id         uuid primary key references auth.users(id) on delete cascade,
  nombre     text not null,
  email      text not null unique,
  rol        rol_usuario not null default 'ejecutivo',
  equipo_id  uuid references equipos(id),
  telefono   text,
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

-- Los 3 pilares DIPREM (semilla fija, editable por admin)
create table pilares (
  id     smallint primary key,
  numero smallint not null unique,             -- 1, 2, 3
  nombre text not null
);

-- Catálogo de servicios por pilar
create table servicios (
  id                 uuid primary key default gen_random_uuid(),
  pilar_id           smallint not null references pilares(id),
  nombre             text not null,
  descripcion        text,
  unidad             text not null default 'proyecto',  -- hora | mes | proyecto | HH
  precio_referencial numeric(14,2),
  moneda             moneda not null default 'USD',
  activo             boolean not null default true
);

-- Cuentas (empresas cliente)
create table cuentas (
  id             uuid primary key default gen_random_uuid(),
  razon_social   text not null,
  tax_id         text,                         -- RUT / CUIT / NIT según país
  vertical       vertical_cuenta not null default 'otro',
  pais           text,
  ciudad         text,
  sitio_web      text,
  propietario_id uuid not null references usuarios(id),
  equipo_id      uuid references equipos(id),
  estado         estado_cuenta not null default 'prospecto',
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table contactos (
  id              uuid primary key default gen_random_uuid(),
  cuenta_id       uuid not null references cuentas(id) on delete cascade,
  nombre          text not null,
  cargo           text,
  telefono        text,
  email           text,
  canal_preferido tipo_actividad default 'email',
  es_principal    boolean not null default false,
  creado_en       timestamptz not null default now()
);

create table leads (
  id                   uuid primary key default gen_random_uuid(),
  nombre               text not null,          -- persona de contacto
  empresa              text,
  telefono             text,
  email                text,
  fuente               fuente_lead not null default 'otro',
  calificacion         calificacion_lead not null default 'frio',
  propietario_id       uuid not null references usuarios(id),
  estado               estado_lead not null default 'nuevo',
  convertido_cuenta_id uuid references cuentas(id),
  notas                text,
  creado_en            timestamptz not null default now()
);

-- Embudo configurable; semilla = etapas DIPREM
create table etapas_embudo (
  id                   uuid primary key default gen_random_uuid(),
  nombre               text not null,
  orden                smallint not null,
  probabilidad_default smallint not null check (probabilidad_default between 0 and 100),
  es_ganada            boolean not null default false,
  es_perdida           boolean not null default false,
  activa               boolean not null default true
);

create table oportunidades (
  id                     uuid primary key default gen_random_uuid(),
  nombre                 text not null,        -- "Plan de seguridad — GANFENG Salta"
  cuenta_id              uuid not null references cuentas(id),
  propietario_id         uuid not null references usuarios(id),
  etapa_id               uuid not null references etapas_embudo(id),
  pilar_id               smallint references pilares(id),
  servicio_id            uuid references servicios(id),
  modalidad_contrato     modalidad_contrato not null default 'proyecto',
  monto                  numeric(14,2) not null default 0,
  moneda                 moneda not null default 'USD',
  probabilidad           smallint check (probabilidad between 0 and 100),
  fecha_cierre_estimada  date,
  motivo_perdida         text,
  cerrada_en             timestamptz,
  ultimo_contacto_en     timestamptz,          -- para alertas "sin contacto hace N días"
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now()
);

create table actividades (
  id               uuid primary key default gen_random_uuid(),
  tipo             tipo_actividad not null,
  asunto           text not null,
  cuenta_id        uuid references cuentas(id),
  oportunidad_id   uuid references oportunidades(id),
  contacto_id      uuid references contactos(id),
  propietario_id   uuid not null references usuarios(id),
  fecha_programada timestamptz,                -- cuándo ocurre (agenda Mi Día)
  fecha_vencimiento timestamptz,               -- límite para tareas
  estado           estado_actividad not null default 'pendiente',
  resultado        text,
  notas            text,
  proxima_accion   text,                       -- siembra el siguiente seguimiento
  completada_en    timestamptz,
  creado_en        timestamptz not null default now()
);

create table notas (
  id         uuid primary key default gen_random_uuid(),
  entidad    text not null check (entidad in ('cuenta','oportunidad','contacto','lead')),
  entidad_id uuid not null,
  autor_id   uuid not null references usuarios(id),
  contenido  text not null,
  creado_en  timestamptz not null default now()
);

create table propuestas (
  id             uuid primary key default gen_random_uuid(),
  oportunidad_id uuid not null references oportunidades(id) on delete cascade,
  version        smallint not null default 1,
  total          numeric(14,2) not null,
  moneda         moneda not null,
  estado         estado_propuesta not null default 'borrador',
  pdf_url        text,                         -- Supabase Storage
  aprobada_por   uuid references usuarios(id),
  enviada_en     timestamptz,
  creado_en      timestamptz not null default now(),
  unique (oportunidad_id, version)
);

create table metas (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id),
  periodo    text not null,                    -- '2026-07' (YYYY-MM)
  tipo       tipo_meta not null,
  objetivo   numeric(14,2) not null,
  moneda     moneda,                           -- solo para monto_adjudicado
  unique (usuario_id, periodo, tipo)
);
-- El avance NO se guarda: se calcula con vistas sobre oportunidades/actividades
-- (una sola fuente de verdad, sin desincronización).

create table notificaciones (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  tipo       text not null,        -- recordatorio | seguimiento | aprobacion | alerta_gerencial
  titulo     text not null,
  mensaje    text not null,
  entidad    text,
  entidad_id uuid,
  leida      boolean not null default false,
  creado_en  timestamptz not null default now()
);

create table auditoria (
  id         bigint generated always as identity primary key,
  usuario_id uuid,
  accion     text not null,        -- INSERT | UPDATE | DELETE
  entidad    text not null,
  entidad_id uuid,
  cambios    jsonb,                -- {antes: {...}, despues: {...}}
  creado_en  timestamptz not null default now()
);
```

### 4.3 Semillas DIPREM (seed.sql)

```sql
insert into pilares (id, numero, nombre) values
 (1, 1, 'Dirección y Gestión de Proyectos + QA/QC'),
 (2, 2, 'Seguridad, Salud Ocupacional y Medio Ambiente'),
 (3, 3, 'Evaluación de Proveedores, Control de Contratistas y Tecnología');

insert into etapas_embudo (nombre, orden, probabilidad_default, es_ganada, es_perdida) values
 ('Prospecto',              1, 10, false, false),
 ('Contactado',             2, 20, false, false),
 ('Reunión / Levantamiento',3, 40, false, false),
 ('Propuesta enviada',      4, 60, false, false),
 ('Negociación',            5, 80, false, false),
 ('Adjudicado',             6, 100, true, false),
 ('Perdido',                7, 0, false, true);

-- Servicios semilla por pilar (extracto; lista completa desde docs/CONTEXTO-DIPREM.md §2):
-- P1: Supervisión técnica · QA/QC construcción y montaje · Precom y comisionamiento ·
--     Puesta en marcha · Auditorías técnicas · Outsourcing de personal especializado ·
--     Outsourcing de inspectores
-- P2: Sistema de gestión SSO · Higiene y seguridad en obra · Seguridad en procesos ·
--     Capacitación SSO · Auditoría HSE · Medicina laboral in situ · Huella de carbono ·
--     Permisos ambientales · Evaluación de impactos · Auditoría ambiental · PGA ·
--     Asesoría ambiental mensual · Educación ambiental
-- P3: Control documental digital · Evaluación de proveedores · Control de contratistas ·
--     Gestión contractual · Plataforma de registro y cumplimiento · Trazabilidad
```

### 4.4 Seguridad (RLS) — política por rol

| Tabla | Ejecutivo | Gerente | Admin | Lectura |
|---|---|---|---|---|
| cuentas / leads / oportunidades / actividades / propuestas | CRUD de **sus** registros (`propietario_id = auth.uid()`) | CRUD de registros de **su equipo** | todo | SELECT global |
| metas | SELECT propias | CRUD de su equipo | todo | SELECT global |
| servicios / etapas / pilares / equipos | SELECT | SELECT | CRUD | SELECT |
| notificaciones | CRUD propias | CRUD propias | todo | propias |
| auditoria | — | SELECT su equipo | SELECT | — |

Implementación: función `es_gerente_de(usuario)` + políticas RLS por tabla, en migración
dedicada. Triggers `on update` mantienen `actualizado_en` y escriben en `auditoria`.
Trigger en `actividades` (completada) actualiza `oportunidades.ultimo_contacto_en`.

### 4.5 Vistas para dashboards

```sql
-- v_mi_dia: actividades de hoy + seguimientos vencidos por usuario
-- v_avance_metas: metas del periodo vs avance real (adjudicado, actividades, propuestas)
-- v_pipeline_equipo: valor de pipeline por etapa/ejecutivo/moneda (gerente)
-- v_kpis_ejecutivo: conversión, ciclo promedio, actividades del periodo
```

---

## 5. Plan por fases (entregables verificables)

| Fase | Entregable verificable | Cierre |
|---|---|---|
| **0 — Base** | Monorepo compila; migraciones + seeds aplican; login funciona en web y móvil; navegación por rol | tag `v0.1` |
| **1 — CRM Core** | CRUD cuentas/contactos/leads/oportunidades; Kanban web con drag&drop; tarjetas móvil; conversión lead→cuenta+oportunidad | tag `v0.2` |
| **2 — Mi Día** ⭐ | Pantalla Mi Día por defecto en móvil; registro rápido ≤2 toques; seguimientos con alerta "N días sin contacto"; push de recordatorios | tag `v0.3` |
| **3 — Metas y dashboards** | Barras de avance vs cuota; dashboard gerente (ranking, embudo, forecast); export Excel/PDF | tag `v0.4` |
| **4 — Gestión comercial** | Catálogo servicios; propuestas con versiones + aprobación gerencial + PDF en Storage | tag `v0.5` |
| **5 — Refinamiento** | Offline móvil (cola local + sync); enlaces WhatsApp; auditoría visible; pruebas E2E | tag `v1.0` |

**Definición de "hecho" por fase:** funciona en web y móvil (Expo Go), datos reales de
prueba DIPREM (cuentas MILICIC/GANFENG/WORLEY como demo), commit + tag en Git.

---

## 6. Decisiones pendientes del usuario

1. **Aprobación de este plan** (arquitectura, carpetas, esquema §4, embudo §4.3).
2. Datos de `docs/CONTEXTO-DIPREM.md §5` (nº ejecutivos, metas reales, precios) —
   no bloquean Fase 0–1; se configuran por admin cuando estén.
3. Proyecto Supabase: ¿creas tú el proyecto en supabase.com y compartes las claves
   (URL + anon key) como variables de entorno, o desarrollamos primero contra
   Supabase local (CLI) y conectamos producción después? *(Recomendado: local primero.)*
