-- ============================================================================
-- DIPREM CRM — Migración 0001 (Neon): esquema inicial
-- Port del esquema aprobado (docs/PLAN-ARQUITECTURA.md §4) desde Supabase.
-- Cambios respecto del original — todos de la capa de identidad:
--   · usuarios.id ya no referencia auth.users (Supabase); la identidad vive en
--     Neon Auth y se enlaza vía usuarios.auth_id (claim sub del JWT).
--   · public.usuario_actual() reemplaza a auth.uid().
--   · Sin trigger de alta automática de perfil: el alta es por allowlist del
--     admin (el registro público de Neon Auth NO crea perfiles).
--   · Políticas RLS y grants: en la migración de seguridad (F1). Aquí solo se
--     habilita RLS, lo que deja las tablas cerradas para roles no-owner.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

-- Equipos = oficina/país (multi-equipo desde el día 1)
create table equipos (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  pais           text not null,
  moneda_default moneda not null default 'USD',
  gerente_id     uuid, -- FK diferida (dependencia circular con usuarios)
  creado_en      timestamptz not null default now()
);

-- Perfil de usuario. La identidad (login/JWT) vive en Neon Auth; auth_id
-- guarda el id Better Auth (claim sub) y se enlaza al primer login contra el
-- email verificado. Solo el admin crea filas aquí (allowlist).
create table usuarios (
  id         uuid primary key default gen_random_uuid(),
  auth_id    text unique,
  nombre     text not null,
  email      text not null unique,
  rol        rol_usuario not null default 'ejecutivo',
  equipo_id  uuid references equipos(id),
  telefono   text,
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

alter table equipos
  add constraint equipos_gerente_fk
  foreign key (gerente_id) references usuarios(id);

-- Dispositivos móviles del usuario para Expo Notifications (N por usuario)
create table dispositivos_push (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references usuarios(id) on delete cascade,
  expo_push_token text not null unique,
  plataforma      text not null check (plataforma in ('ios','android')),
  actualizado_en  timestamptz not null default now()
);

-- Los 3 pilares DIPREM
create table pilares (
  id     smallint primary key,
  numero smallint not null unique,
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
  unidad             text not null default 'proyecto', -- hora | mes | proyecto | HH
  precio_referencial numeric(14,2),
  moneda             moneda not null default 'USD',
  activo             boolean not null default true
);

-- Cuentas (empresas cliente)
create table cuentas (
  id             uuid primary key default gen_random_uuid(),
  razon_social   text not null,
  tax_id         text, -- RUT / CUIT / NIT según país
  vertical       vertical_cuenta not null default 'otro',
  pais           text,
  ciudad         text,
  sitio_web      text,
  propietario_id uuid not null references usuarios(id),
  equipo_id      uuid references equipos(id),
  estado         estado_cuenta not null default 'prospecto',
  atributos      jsonb not null default '{}',
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
  nombre                 text not null,
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
  ultimo_contacto_en     timestamptz,
  atributos              jsonb not null default '{}',
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now()
);

create table leads (
  id                        uuid primary key default gen_random_uuid(),
  nombre                    text not null,
  empresa                   text,
  telefono                  text,
  email                     text,
  fuente                    fuente_lead not null default 'otro',
  calificacion              calificacion_lead not null default 'frio',
  propietario_id            uuid not null references usuarios(id),
  estado                    estado_lead not null default 'nuevo',
  convertido_cuenta_id      uuid references cuentas(id),
  convertido_oportunidad_id uuid references oportunidades(id),
  atributos                 jsonb not null default '{}',
  notas                     text,
  creado_en                 timestamptz not null default now()
);

create table actividades (
  id                uuid primary key default gen_random_uuid(),
  tipo              tipo_actividad not null,
  asunto            text not null,
  cuenta_id         uuid references cuentas(id),
  oportunidad_id    uuid references oportunidades(id),
  contacto_id       uuid references contactos(id),
  propietario_id    uuid not null references usuarios(id),
  fecha_programada  timestamptz,
  fecha_vencimiento timestamptz,
  estado            estado_actividad not null default 'pendiente',
  resultado         text,
  notas             text,
  proxima_accion    text,
  completada_en     timestamptz,
  creado_en         timestamptz not null default now()
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
  total          numeric(14,2) not null default 0,
  moneda         moneda not null,
  estado         estado_propuesta not null default 'borrador',
  pdf_url        text,
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

-- Contrato resultante de una oportunidad adjudicada
create table adjudicaciones (
  id             uuid primary key default gen_random_uuid(),
  oportunidad_id uuid not null unique references oportunidades(id),
  propuesta_id   uuid references propuestas(id),
  modalidad      modalidad_contrato not null,
  fecha_inicio   date not null,
  fecha_fin      date, -- null = recurrente sin término definido
  estado         estado_adjudicacion not null default 'vigente',
  monto          numeric(14,2) not null,
  moneda         moneda not null,
  creado_en      timestamptz not null default now()
);

create table metas (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id),
  periodo    text not null check (periodo ~ '^\d{4}-\d{2}$'), -- 'YYYY-MM'
  tipo       tipo_meta not null,
  objetivo   numeric(14,2) not null,
  moneda     moneda, -- solo para monto_adjudicado
  unique (usuario_id, periodo, tipo)
);

create table notificaciones (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  tipo       text not null, -- recordatorio | seguimiento | aprobacion | alerta_gerencial
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
  clave    text not null,
  etiqueta text not null,
  tipo     text not null check (tipo in ('texto','numero','fecha','opcion','booleano')),
  opciones jsonb,
  activo   boolean not null default true,
  unique (entidad, clave)
);

create table auditoria (
  id         bigint generated always as identity primary key,
  usuario_id uuid,
  accion     text not null, -- INSERT | UPDATE | DELETE
  entidad    text not null,
  entidad_id text,          -- PK serializado (soporta uuid y smallint)
  cambios    jsonb,
  creado_en  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Índices de acceso frecuente
-- ---------------------------------------------------------------------------
create index cuentas_propietario_idx        on cuentas (propietario_id);
create index cuentas_equipo_idx             on cuentas (equipo_id);
create index contactos_cuenta_idx           on contactos (cuenta_id);
create index leads_propietario_idx          on leads (propietario_id);
create index oportunidades_propietario_idx  on oportunidades (propietario_id);
create index oportunidades_cuenta_idx       on oportunidades (cuenta_id);
create index oportunidades_etapa_idx        on oportunidades (etapa_id);
create index actividades_propietario_fecha_idx
  on actividades (propietario_id, fecha_programada);
create index actividades_oportunidad_idx    on actividades (oportunidad_id);
create index notas_entidad_idx              on notas (entidad, entidad_id);
create index notificaciones_usuario_idx     on notificaciones (usuario_id, leida);
create index auditoria_entidad_idx          on auditoria (entidad, entidad_id);

-- ---------------------------------------------------------------------------
-- Triggers de mantenimiento
-- ---------------------------------------------------------------------------

-- actualizado_en automático
create function public.tocar_actualizado_en()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

create trigger cuentas_tocar before update on cuentas
  for each row execute function public.tocar_actualizado_en();
create trigger oportunidades_tocar before update on oportunidades
  for each row execute function public.tocar_actualizado_en();

-- Al completarse una actividad ligada a una oportunidad, registrar último contacto.
-- SECURITY DEFINER: el update sobre oportunidades no depende de la RLS del usuario.
create function public.registrar_ultimo_contacto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'completada' and new.oportunidad_id is not null then
    update oportunidades
       set ultimo_contacto_en = coalesce(new.completada_en, now())
     where id = new.oportunidad_id
       and (ultimo_contacto_en is null
            or ultimo_contacto_en < coalesce(new.completada_en, now()));
  end if;
  return new;
end $$;

create trigger actividades_ultimo_contacto
  after insert or update of estado on actividades
  for each row execute function public.registrar_ultimo_contacto();

-- Identidad: usuario de la app a partir del JWT de Neon Auth.
-- auth.user_id() la provee pg_session_jwt (instalada al activar la Data API);
-- fuera de la Data API (migraciones, scripts con DATABASE_URL) no existe y esta
-- función devuelve null — por eso es plpgsql con manejo de excepción.
-- También devuelve null si el sub del JWT no está en usuarios o el usuario está
-- inactivo: esta allowlist neutraliza el registro abierto de Neon Auth.
create function public.usuario_actual()
returns uuid language plpgsql stable as $$
begin
  return (select u.id from usuarios u
           where u.auth_id = auth.user_id() and u.activo);
exception when undefined_function or invalid_schema_name then
  return null;
end $$;

-- Auditoría genérica (todas las tablas tienen PK `id`).
-- SECURITY DEFINER: el INSERT en auditoria no depende de políticas RLS.
create function public.registrar_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cambios jsonb;
  v_id text;
begin
  if tg_op = 'INSERT' then
    v_cambios := jsonb_build_object('despues', to_jsonb(new));
    v_id := to_jsonb(new)->>'id';
  elsif tg_op = 'UPDATE' then
    v_cambios := jsonb_build_object('antes', to_jsonb(old), 'despues', to_jsonb(new));
    v_id := to_jsonb(new)->>'id';
  else
    v_cambios := jsonb_build_object('antes', to_jsonb(old));
    v_id := to_jsonb(old)->>'id';
  end if;

  insert into auditoria (usuario_id, accion, entidad, entidad_id, cambios)
  values (public.usuario_actual(), tg_op, tg_table_name, v_id, v_cambios);

  return coalesce(new, old);
end $$;

-- Auditar las tablas de negocio y configuración
do $$
declare
  t text;
begin
  foreach t in array array[
    'equipos','usuarios','pilares','lineas_servicio','servicios','cuentas',
    'contactos','motivos_perdida','etapas_embudo','oportunidades','leads',
    'actividades','propuestas','propuesta_items','adjudicaciones','metas',
    'definiciones_campo'
  ] loop
    execute format(
      'create trigger %I_auditoria after insert or update or delete on %I
       for each row execute function public.registrar_auditoria()',
      t, t);
  end loop;
end $$;

-- Nota: en Supabase existía aquí un trigger de alta automática de perfil
-- sobre auth.users. En Neon no se porta a propósito: el registro público de
-- Neon Auth no debe crear perfiles; el alta de usuarios es por allowlist desde
-- Administración (ver migración de seguridad).

-- ---------------------------------------------------------------------------
-- RLS habilitado desde el día cero (en el original vivía en la migración de
-- RLS de Supabase). Sin políticas ni grants todavía: para cualquier rol
-- no-owner (p. ej. `authenticated` de la Data API) esto es DENY-ALL hasta la
-- migración de seguridad (F1).
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'equipos','usuarios','dispositivos_push','pilares','lineas_servicio',
    'servicios','cuentas','contactos','motivos_perdida','etapas_embudo',
    'oportunidades','leads','actividades','notas','propuestas',
    'propuesta_items','adjudicaciones','metas','notificaciones',
    'definiciones_campo','auditoria'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
