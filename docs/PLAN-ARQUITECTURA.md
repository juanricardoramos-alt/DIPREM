# 🏗️ Plan de Arquitectura — DIPREM CRM

> **Estado: ✅ APROBADO (2026-07-09).** Decisión adicional: se desarrolla contra
> **Supabase local (CLI)**; el proyecto de producción se conecta más adelante.

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
- **Edge Functions** para: envío de push programado (recordatorios/seguimientos) leyendo tokens de `dispositivos_push`, generación de PDF de propuestas desde `propuesta_items`, resumen de fin de día.
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
│   │   │   │   └── admin/         # embudo, servicios, usuarios, metas,
│   │   │   │                      #   motivos de pérdida, campos personalizados
│   │   │   └── layout.tsx
│   │   └── components/
│   ├── mobile/                    # Expo (iOS/Android)
│   │   ├── app/                   # expo-router
│   │   │   ├── (auth)/login.tsx
│   │   │   └── (tabs)/
│   │   │       ├── index.tsx      # ⭐ Mi Día (pantalla por defecto)
│   │   │       ├── cuentas.tsx
│   │   │       ├── oportunidades.tsx
│   │   │       ├── reportes.tsx   # KPIs y avance de metas del ejecutivo
│   │   │       └── perfil.tsx
│   │   └── components/
├── packages/
│   ├── core/                      # dominio compartido
│   │   ├── src/types/             # tipos generados de la BD + de dominio
│   │   ├── src/schemas/           # Zod: validaciones de formularios y API
│   │   ├── src/strings/           # textos de UI centralizados (es hoy; i18n futuro)
│   │   └── src/lib/               # lógica pura: KPIs, formato moneda, fechas
│   ├── api/                       # cliente Supabase tipado + hooks TanStack Query
│   │   └── src/hooks/             # useOportunidades, useMiDia, useMetas...
│   └── config/                    # eslint, tsconfig, tailwind preset compartidos
├── supabase/
│   ├── migrations/                # SQL versionado (esquema §4)
│   ├── seed.sql                   # pilares, líneas, servicios, etapas, motivos
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
create type canal_contacto     as enum ('llamada','email','whatsapp','reunion');
create type estado_actividad   as enum ('pendiente','completada','cancelada');
create type modalidad_contrato as enum ('proyecto','mensual_recurrente','outsourcing');
create type estado_propuesta   as enum ('borrador','pendiente_aprobacion','aprobada',
                                        'enviada','aceptada','rechazada');
create type estado_adjudicacion as enum ('vigente','finalizada','cancelada');
create type tipo_meta          as enum ('monto_adjudicado','propuestas_enviadas',
                                        'actividades','oportunidades_nuevas');
-- Monedas de los 14 países DIPREM (Panamá y Puerto Rico operan en USD)
create type moneda             as enum ('USD','CLP','ARS','COP','BRL','MXN','PEN',
                                        'CAD','UYU','BOB','GTQ','DOP','EUR');
```

### 4.2 Tablas núcleo

```sql
-- Equipos = oficina/país (multi-equipo desde el día 1)
create table equipos (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,               -- "Chile - Santiago", "Argentina - BsAs"
  pais           text not null,
  moneda_default moneda not null default 'USD',
  gerente_id     uuid,                        -- FK diferida: ver ALTER al final de §4.2
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

-- Dispositivos móviles del usuario para Expo Notifications (N por usuario)
create table dispositivos_push (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references usuarios(id) on delete cascade,
  expo_push_token text not null unique,
  plataforma      text not null check (plataforma in ('ios','android')),
  actualizado_en  timestamptz not null default now()
);

-- Los 3 pilares DIPREM (semilla fija, editable por admin)
create table pilares (
  id     smallint primary key,
  numero smallint not null unique,             -- 1, 2, 3
  nombre text not null
);

-- Líneas de servicio dentro de cada pilar (ej. P2: SSO / Medio Ambiente / SGC)
create table lineas_servicio (
  id       uuid primary key default gen_random_uuid(),
  pilar_id smallint not null references pilares(id),
  nombre   text not null,
  activa   boolean not null default true,
  unique (pilar_id, nombre)
);

-- Catálogo de servicios por pilar y línea
create table servicios (
  id                 uuid primary key default gen_random_uuid(),
  pilar_id           smallint not null references pilares(id),
  linea_servicio_id  uuid references lineas_servicio(id),
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
  atributos      jsonb not null default '{}',  -- valores de campos personalizados
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
  canal_preferido canal_contacto default 'email',
  es_principal    boolean not null default false,
  creado_en       timestamptz not null default now()
);

-- Motivos de pérdida: catálogo administrable → KPIs agregables (no texto libre)
create table motivos_perdida (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true
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
  linea_servicio_id      uuid references lineas_servicio(id),
  servicio_id            uuid references servicios(id),
  modalidad_contrato     modalidad_contrato not null default 'proyecto',
  monto                  numeric(14,2) not null default 0,
  moneda                 moneda not null default 'USD',
  probabilidad           smallint check (probabilidad between 0 and 100),
  fecha_cierre_estimada  date,
  motivo_perdida_id      uuid references motivos_perdida(id),
  motivo_perdida_detalle text,
  cerrada_en             timestamptz,
  ultimo_contacto_en     timestamptz,          -- para alertas "sin contacto hace N días"
  atributos              jsonb not null default '{}',
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now()
);

create table leads (
  id                        uuid primary key default gen_random_uuid(),
  nombre                    text not null,     -- persona de contacto
  empresa                   text,
  telefono                  text,
  email                     text,
  fuente                    fuente_lead not null default 'otro',
  calificacion              calificacion_lead not null default 'frio',
  propietario_id            uuid not null references usuarios(id),
  estado                    estado_lead not null default 'nuevo',
  convertido_cuenta_id      uuid references cuentas(id),
  convertido_oportunidad_id uuid references oportunidades(id),  -- trazabilidad completa
  atributos                 jsonb not null default '{}',
  notas                     text,
  creado_en                 timestamptz not null default now()
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
  total          numeric(14,2) not null default 0,  -- calculado desde propuesta_items
  moneda         moneda not null,
  estado         estado_propuesta not null default 'borrador',
  pdf_url        text,                         -- Supabase Storage
  aprobada_por   uuid references usuarios(id),
  enviada_en     timestamptz,
  creado_en      timestamptz not null default now(),
  unique (oportunidad_id, version)
);

-- Líneas de detalle de la propuesta (alimentan el PDF con formato DIPREM)
create table propuesta_items (
  id              uuid primary key default gen_random_uuid(),
  propuesta_id    uuid not null references propuestas(id) on delete cascade,
  servicio_id     uuid references servicios(id),
  descripcion     text not null,
  cantidad        numeric(10,2) not null default 1,
  unidad          text not null default 'proyecto',
  precio_unitario numeric(14,2) not null,
  subtotal        numeric(14,2) generated always as (cantidad * precio_unitario) stored
);

-- Contrato resultante de una oportunidad adjudicada (registro, modalidad, estado)
create table adjudicaciones (
  id             uuid primary key default gen_random_uuid(),
  oportunidad_id uuid not null unique references oportunidades(id),
  propuesta_id   uuid references propuestas(id),
  modalidad      modalidad_contrato not null,
  fecha_inicio   date not null,
  fecha_fin      date,                         -- null = recurrente sin término definido
  estado         estado_adjudicacion not null default 'vigente',
  monto          numeric(14,2) not null,
  moneda         moneda not null,
  creado_en      timestamptz not null default now()
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

-- Definición de campos personalizados por entidad (valores en columnas `atributos`)
create table definiciones_campo (
  id       uuid primary key default gen_random_uuid(),
  entidad  text not null check (entidad in ('cuenta','oportunidad','lead')),
  clave    text not null,                      -- clave dentro del jsonb `atributos`
  etiqueta text not null,                      -- label visible en la UI
  tipo     text not null check (tipo in ('texto','numero','fecha','opcion','booleano')),
  opciones jsonb,                              -- para tipo 'opcion': ["A","B",...]
  activo   boolean not null default true,
  unique (entidad, clave)
);

create table auditoria (
  id         bigint generated always as identity primary key,
  usuario_id uuid,
  accion     text not null,        -- INSERT | UPDATE | DELETE
  entidad    text not null,
  entidad_id text,                 -- PK serializado (soporta uuid y smallint, ej. pilares)
  cambios    jsonb,                -- {antes: {...}, despues: {...}}
  creado_en  timestamptz not null default now()
);

-- FK diferida por dependencia circular equipos ↔ usuarios:
alter table equipos
  add constraint equipos_gerente_fk
  foreign key (gerente_id) references usuarios(id);
```

### 4.3 Semillas DIPREM (seed.sql)

```sql
insert into pilares (id, numero, nombre) values
 (1, 1, 'Dirección y Gestión de Proyectos + QA/QC'),
 (2, 2, 'Seguridad, Salud Ocupacional y Medio Ambiente'),
 (3, 3, 'Evaluación de Proveedores, Control de Contratistas y Desarrollo Tecnológico');

-- Líneas de servicio documentadas en los brochures (docs/CONTEXTO-DIPREM.md §2).
-- El Pilar 2 tiene sub-líneas explícitas; P1 y P3 arrancan con una línea general
-- que el admin puede subdividir después.
insert into lineas_servicio (pilar_id, nombre) values
 (1, 'Gestión de Proyectos y QA/QC'),
 (2, 'Seguridad y Salud Ocupacional'),
 (2, 'Medio Ambiente'),
 (2, 'Sistema de Gestión de Calidad'),   -- nombrada en brochure global; catálogo por confirmar
 (3, 'Control de Contratistas y Desarrollo Tecnológico');

insert into etapas_embudo (nombre, orden, probabilidad_default, es_ganada, es_perdida) values
 ('Prospecto',              1, 10, false, false),
 ('Contactado',             2, 20, false, false),
 ('Reunión / Levantamiento',3, 40, false, false),
 ('Propuesta enviada',      4, 60, false, false),
 ('Negociación',            5, 80, false, false),
 ('Adjudicado',             6, 100, true, false),
 ('Perdido',                7, 0, false, true);

insert into motivos_perdida (nombre) values
 ('Precio'), ('Competencia'), ('Sin presupuesto'), ('Proyecto cancelado'),
 ('Sin respuesta'), ('Tiempos de entrega'), ('Otro');

-- Servicios semilla por pilar (extracto; lista completa desde docs/CONTEXTO-DIPREM.md §2):
-- P1: Supervisión técnica · QA/QC construcción y montaje · Precom y comisionamiento ·
--     Puesta en marcha · Auditorías técnicas · Outsourcing de personal especializado ·
--     Outsourcing de inspectores
-- P2/SSO: Sistema de gestión SSO · Higiene y seguridad en obra · Seguridad en procesos ·
--     Capacitación SSO · Auditoría HSE · Medicina laboral in situ · Supervisión SSO de
--     personal propio y subcontratistas · Verificación de EPP · Inscripciones y trámites
--     ante organismos
-- P2/MA: Huella de carbono · Permisos ambientales · Evaluación de impactos ·
--     Auditoría ambiental · PGA · Asesoría ambiental mensual · Educación ambiental
-- P3: Control documental digital · Evaluación de proveedores · Control de contratistas ·
--     Gestión contractual · Plataforma de registro y cumplimiento · Trazabilidad
```

### 4.4 Seguridad (RLS) — política por rol

| Tabla | Ejecutivo | Gerente | Admin | Lectura |
|---|---|---|---|---|
| cuentas / leads / oportunidades / actividades | CRUD de **sus** registros (`propietario_id = auth.uid()`) | CRUD de registros de **su equipo** | todo | SELECT global |
| contactos | visibilidad heredada de la cuenta (`cuenta_id in (select id from cuentas …)`) | ídem, alcance equipo | todo | SELECT global |
| propuestas / propuesta_items / adjudicaciones | CRUD vía subconsulta a la oportunidad (`oportunidad_id in (select id from oportunidades where propietario_id = auth.uid())`) | ídem, alcance equipo + aprobar | todo | SELECT global |
| notas | SELECT según entidad padre; INSERT/UPDATE con `autor_id = auth.uid()` | ídem, alcance equipo | todo | SELECT global |
| usuarios | SELECT su propio perfil + compañeros de equipo | SELECT su equipo; UPDATE datos de su equipo | CRUD | SELECT global |
| metas | SELECT propias | CRUD de su equipo | todo | SELECT global |
| servicios / lineas_servicio / etapas / pilares / equipos / motivos_perdida / definiciones_campo | SELECT | SELECT | CRUD | SELECT |
| notificaciones / dispositivos_push | CRUD propias | CRUD propias | todo | propias |
| auditoria | — | SELECT su equipo | SELECT | — |

Implementación: función `es_gerente_de(usuario)` + políticas RLS por tabla, en migración
dedicada. **Toda tabla del schema `public` se crea con `enable row level security`**
— ninguna queda expuesta sin política.

Triggers:
- `on update` mantiene `actualizado_en`.
- Función de auditoría **`security definer`** (con `set search_path = public`) escribe
  en `auditoria` — así el INSERT de auditoría no depende de políticas RLS del usuario
  que dispara el cambio.
- Trigger en `actividades` (al completarse) actualiza `oportunidades.ultimo_contacto_en`.

### 4.5 Vistas para dashboards

```sql
-- v_mi_dia: actividades de hoy + seguimientos vencidos por usuario
-- v_avance_metas: metas del periodo vs avance real (adjudicado, actividades,
--                 propuestas enviadas, oportunidades nuevas)
-- v_pipeline_equipo: valor de pipeline por etapa/ejecutivo/moneda (gerente)
-- v_kpis_ejecutivo: conversión, ciclo promedio, actividades del periodo
-- v_motivos_perdida: pérdidas agrupadas por motivo/periodo/pilar (KPI del brief)
```

---

## 5. Plan por fases (entregables verificables)

| Fase | Entregable verificable | Cierre |
|---|---|---|
| **0 — Base** | Monorepo compila; migraciones + seeds aplican (esquema §4 completo, incl. RLS); login funciona en web y móvil; navegación por rol | tag `v0.1` |
| **1 — CRM Core** | CRUD cuentas/contactos/leads/oportunidades; Kanban web con drag&drop; tarjetas móvil; conversión lead→cuenta+oportunidad (con trazabilidad `convertido_*`) | tag `v0.2` |
| **2 — Mi Día** ⭐ | Pantalla Mi Día por defecto en móvil; registro rápido ≤2 toques; seguimientos con alerta "N días sin contacto"; registro de `dispositivos_push` y push de recordatorios | tag `v0.3` |
| **3 — Metas y dashboards** | Barras de avance vs cuota; dashboard gerente (ranking, embudo, forecast); reporte de motivos de pérdida; export Excel/PDF | tag `v0.4` |
| **4 — Gestión comercial** | Catálogo servicios por pilar/línea; propuestas con `propuesta_items`, versiones, aprobación gerencial y PDF en Storage; registro de `adjudicaciones` (modalidad, vigencia, estado) | tag `v0.5` |
| **5 — Refinamiento** | Offline móvil (cola local + sync); enlaces WhatsApp; UI admin de campos personalizados (`definiciones_campo` + `atributos`); integración facturación (SII/AFIP) o ERP *si se confirma* (CONTEXTO §5); auditoría visible; pruebas E2E | tag `v1.0` |

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
