-- ============================================================================
-- DIPREM CRM — Setup completo para proyecto Supabase en la nube (entorno de PRUEBA)
-- Pegar TODO este archivo en: Supabase Dashboard → SQL Editor → Run
-- Incluye: esquema, seguridad RLS, lógica CRM, métricas y datos demo (usuarios *@diprem.local, clave diprem123)
-- ⚠️ Solo para entorno de prueba: antes de producción real se eliminan los usuarios demo.
-- Generado desde supabase/migrations/*.sql + seed.sql — no editar a mano.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- >>> supabase/migrations/20260709000001_esquema_inicial.sql
-- ────────────────────────────────────────────────────────────────────────────
-- ============================================================================
-- DIPREM CRM — Migración 0001: esquema inicial
-- Fuente: docs/PLAN-ARQUITECTURA.md §4 (aprobado 2026-07-09)
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
  values (auth.uid(), tg_op, tg_table_name, v_id, v_cambios);

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

-- ---------------------------------------------------------------------------
-- Alta automática de perfil al crear usuario en Supabase Auth
-- ---------------------------------------------------------------------------
create function public.crear_perfil_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.usuarios (id, nombre, email, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data->>'rol')::rol_usuario, 'ejecutivo')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger crear_perfil_al_registrar
  after insert on auth.users
  for each row execute function public.crear_perfil_usuario();

-- ────────────────────────────────────────────────────────────────────────────
-- >>> supabase/migrations/20260709000002_rls.sql
-- ────────────────────────────────────────────────────────────────────────────
-- ============================================================================
-- DIPREM CRM — Migración 0002: RBAC con Row Level Security
-- Matriz de permisos: docs/PLAN-ARQUITECTURA.md §4.4
--   ejecutivo: CRUD de sus registros · gerente: CRUD de su equipo
--   admin: todo · lectura: SELECT global
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Funciones auxiliares (SECURITY DEFINER evita recursión de RLS sobre usuarios)
-- ---------------------------------------------------------------------------
create function public.rol_actual()
returns rol_usuario language sql stable security definer set search_path = public as
$$ select rol from usuarios where id = auth.uid() $$;

create function public.equipo_actual()
returns uuid language sql stable security definer set search_path = public as
$$ select equipo_id from usuarios where id = auth.uid() $$;

create function public.equipo_de(u uuid)
returns uuid language sql stable security definer set search_path = public as
$$ select equipo_id from usuarios where id = u $$;

create function public.es_admin()
returns boolean language sql stable as
$$ select public.rol_actual() = 'admin' $$;

create function public.es_lectura()
returns boolean language sql stable as
$$ select public.rol_actual() = 'lectura' $$;

-- ¿El usuario actual es gerente del equipo al que pertenece `u`?
create function public.gerencia_a(u uuid)
returns boolean language sql stable as
$$
  select public.rol_actual() = 'gerente'
     and public.equipo_de(u) is not null
     and public.equipo_de(u) = public.equipo_actual()
$$;

-- ---------------------------------------------------------------------------
-- Habilitar RLS en TODAS las tablas (ninguna queda expuesta sin política)
-- ---------------------------------------------------------------------------
alter table equipos            enable row level security;
alter table usuarios           enable row level security;
alter table dispositivos_push  enable row level security;
alter table pilares            enable row level security;
alter table lineas_servicio    enable row level security;
alter table servicios          enable row level security;
alter table cuentas            enable row level security;
alter table contactos          enable row level security;
alter table motivos_perdida    enable row level security;
alter table etapas_embudo      enable row level security;
alter table oportunidades      enable row level security;
alter table leads              enable row level security;
alter table actividades        enable row level security;
alter table notas              enable row level security;
alter table propuestas         enable row level security;
alter table propuesta_items    enable row level security;
alter table adjudicaciones     enable row level security;
alter table metas              enable row level security;
alter table notificaciones     enable row level security;
alter table definiciones_campo enable row level security;
alter table auditoria          enable row level security;

-- ---------------------------------------------------------------------------
-- Catálogos: SELECT autenticado, escritura solo admin
-- (pilares, lineas_servicio, servicios, etapas_embudo, motivos_perdida,
--  definiciones_campo, equipos)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'pilares','lineas_servicio','servicios','etapas_embudo',
    'motivos_perdida','definiciones_campo','equipos'
  ] loop
    execute format(
      'create policy %I on %I for select to authenticated using (true)',
      t || '_select', t);
    execute format(
      'create policy %I on %I for insert to authenticated with check (public.es_admin())',
      t || '_insert', t);
    execute format(
      'create policy %I on %I for update to authenticated using (public.es_admin())',
      t || '_update', t);
    execute format(
      'create policy %I on %I for delete to authenticated using (public.es_admin())',
      t || '_delete', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- usuarios: perfil propio + compañeros de equipo; gerente administra su equipo
-- ---------------------------------------------------------------------------
create policy usuarios_select on usuarios for select to authenticated using (
  id = auth.uid()
  or public.es_admin()
  or public.es_lectura()
  or (public.equipo_de(id) is not null and public.equipo_de(id) = public.equipo_actual())
);
create policy usuarios_insert on usuarios for insert to authenticated
  with check (public.es_admin());
create policy usuarios_update on usuarios for update to authenticated using (
  id = auth.uid() or public.es_admin() or public.gerencia_a(id)
);
create policy usuarios_delete on usuarios for delete to authenticated
  using (public.es_admin());

-- ---------------------------------------------------------------------------
-- Registros comerciales con propietario directo:
-- cuentas, leads, oportunidades, actividades
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['cuentas','leads','oportunidades','actividades'] loop
    execute format($p$
      create policy %1$s_select on %1$I for select to authenticated using (
        propietario_id = auth.uid()
        or public.es_admin()
        or public.es_lectura()
        or public.gerencia_a(propietario_id)
      )$p$, t);
    execute format($p$
      create policy %1$s_insert on %1$I for insert to authenticated with check (
        (propietario_id = auth.uid() and not public.es_lectura())
        or public.es_admin()
        or public.gerencia_a(propietario_id)
      )$p$, t);
    execute format($p$
      create policy %1$s_update on %1$I for update to authenticated using (
        (propietario_id = auth.uid() and not public.es_lectura())
        or public.es_admin()
        or public.gerencia_a(propietario_id)
      )$p$, t);
    execute format($p$
      create policy %1$s_delete on %1$I for delete to authenticated using (
        (propietario_id = auth.uid() and not public.es_lectura())
        or public.es_admin()
        or public.gerencia_a(propietario_id)
      )$p$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- contactos: visibilidad heredada de la cuenta (la RLS de cuentas filtra)
-- ---------------------------------------------------------------------------
create policy contactos_select on contactos for select to authenticated using (
  exists (select 1 from cuentas c where c.id = cuenta_id)
);
create policy contactos_insert on contactos for insert to authenticated with check (
  not public.es_lectura()
  and exists (select 1 from cuentas c where c.id = cuenta_id)
);
create policy contactos_update on contactos for update to authenticated using (
  not public.es_lectura()
  and exists (select 1 from cuentas c where c.id = cuenta_id)
);
create policy contactos_delete on contactos for delete to authenticated using (
  not public.es_lectura()
  and exists (select 1 from cuentas c where c.id = cuenta_id)
);

-- ---------------------------------------------------------------------------
-- propuestas / adjudicaciones: visibilidad heredada de la oportunidad
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['propuestas','adjudicaciones'] loop
    execute format($p$
      create policy %1$s_select on %1$I for select to authenticated using (
        exists (select 1 from oportunidades o where o.id = oportunidad_id)
      )$p$, t);
    execute format($p$
      create policy %1$s_insert on %1$I for insert to authenticated with check (
        not public.es_lectura()
        and exists (select 1 from oportunidades o where o.id = oportunidad_id)
      )$p$, t);
    execute format($p$
      create policy %1$s_update on %1$I for update to authenticated using (
        not public.es_lectura()
        and exists (select 1 from oportunidades o where o.id = oportunidad_id)
      )$p$, t);
    execute format($p$
      create policy %1$s_delete on %1$I for delete to authenticated using (
        not public.es_lectura()
        and exists (select 1 from oportunidades o where o.id = oportunidad_id)
      )$p$, t);
  end loop;
end $$;

-- propuesta_items: visibilidad heredada de la propuesta
create policy propuesta_items_select on propuesta_items for select to authenticated using (
  exists (select 1 from propuestas p where p.id = propuesta_id)
);
create policy propuesta_items_insert on propuesta_items for insert to authenticated with check (
  not public.es_lectura()
  and exists (select 1 from propuestas p where p.id = propuesta_id)
);
create policy propuesta_items_update on propuesta_items for update to authenticated using (
  not public.es_lectura()
  and exists (select 1 from propuestas p where p.id = propuesta_id)
);
create policy propuesta_items_delete on propuesta_items for delete to authenticated using (
  not public.es_lectura()
  and exists (select 1 from propuestas p where p.id = propuesta_id)
);

-- ---------------------------------------------------------------------------
-- notas: visibilidad heredada de la entidad padre; escribe su autor
-- ---------------------------------------------------------------------------
create policy notas_select on notas for select to authenticated using (
  case entidad
    when 'cuenta'      then exists (select 1 from cuentas x where x.id = entidad_id)
    when 'oportunidad' then exists (select 1 from oportunidades x where x.id = entidad_id)
    when 'contacto'    then exists (select 1 from contactos x where x.id = entidad_id)
    when 'lead'        then exists (select 1 from leads x where x.id = entidad_id)
    else false
  end
);
create policy notas_insert on notas for insert to authenticated with check (
  autor_id = auth.uid()
  and not public.es_lectura()
  and case entidad
    when 'cuenta'      then exists (select 1 from cuentas x where x.id = entidad_id)
    when 'oportunidad' then exists (select 1 from oportunidades x where x.id = entidad_id)
    when 'contacto'    then exists (select 1 from contactos x where x.id = entidad_id)
    when 'lead'        then exists (select 1 from leads x where x.id = entidad_id)
    else false
  end
);
create policy notas_update on notas for update to authenticated using (
  autor_id = auth.uid() or public.es_admin()
);
create policy notas_delete on notas for delete to authenticated using (
  autor_id = auth.uid() or public.es_admin()
);

-- ---------------------------------------------------------------------------
-- metas: el ejecutivo ve las suyas; gerente define las de su equipo
-- ---------------------------------------------------------------------------
create policy metas_select on metas for select to authenticated using (
  usuario_id = auth.uid()
  or public.es_admin()
  or public.es_lectura()
  or public.gerencia_a(usuario_id)
);
create policy metas_insert on metas for insert to authenticated with check (
  public.es_admin() or public.gerencia_a(usuario_id)
);
create policy metas_update on metas for update to authenticated using (
  public.es_admin() or public.gerencia_a(usuario_id)
);
create policy metas_delete on metas for delete to authenticated using (
  public.es_admin() or public.gerencia_a(usuario_id)
);

-- ---------------------------------------------------------------------------
-- notificaciones y dispositivos_push: estrictamente propios
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['notificaciones','dispositivos_push'] loop
    execute format($p$
      create policy %1$s_select on %1$I for select to authenticated using (
        usuario_id = auth.uid() or public.es_admin()
      )$p$, t);
    execute format($p$
      create policy %1$s_insert on %1$I for insert to authenticated with check (
        usuario_id = auth.uid() or public.es_admin()
      )$p$, t);
    execute format($p$
      create policy %1$s_update on %1$I for update to authenticated using (
        usuario_id = auth.uid() or public.es_admin()
      )$p$, t);
    execute format($p$
      create policy %1$s_delete on %1$I for delete to authenticated using (
        usuario_id = auth.uid() or public.es_admin()
      )$p$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- auditoria: solo lectura para admin y gerentes (su equipo); nadie escribe
-- directamente (escribe el trigger SECURITY DEFINER)
-- ---------------------------------------------------------------------------
create policy auditoria_select on auditoria for select to authenticated using (
  public.es_admin()
  or (public.rol_actual() = 'gerente' and public.gerencia_a(usuario_id))
);

-- ────────────────────────────────────────────────────────────────────────────
-- >>> supabase/migrations/20260709000003_crm_core.sql
-- ────────────────────────────────────────────────────────────────────────────
-- ============================================================================
-- DIPREM CRM — Migración 0003: lógica de CRM Core (Fase 1)
--   1. Cierre automático de oportunidades al mover a etapa ganada/perdida
--   2. Conversión atómica de lead → cuenta + oportunidad
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Al cambiar de etapa: sincronizar cerrada_en, motivo y probabilidad
-- ---------------------------------------------------------------------------
create function public.sincronizar_cierre_oportunidad()
returns trigger language plpgsql as $$
declare
  v_ganada boolean;
  v_perdida boolean;
  v_prob smallint;
begin
  select es_ganada, es_perdida, probabilidad_default
    into v_ganada, v_perdida, v_prob
    from etapas_embudo where id = new.etapa_id;

  if v_ganada or v_perdida then
    new.cerrada_en := coalesce(new.cerrada_en, now());
  else
    new.cerrada_en := null;
    new.motivo_perdida_id := null;
    new.motivo_perdida_detalle := null;
  end if;

  -- Si no es perdida, limpiar motivo (solo aplica a perdidas)
  if not v_perdida then
    new.motivo_perdida_id := null;
    new.motivo_perdida_detalle := null;
  end if;

  -- Probabilidad automática de la etapa cuando no viene explícita o cambió de etapa
  if tg_op = 'INSERT' then
    new.probabilidad := coalesce(new.probabilidad, v_prob);
  elsif new.etapa_id is distinct from old.etapa_id then
    new.probabilidad := v_prob;
  end if;

  return new;
end $$;

create trigger oportunidades_sincronizar_cierre
  before insert or update of etapa_id on oportunidades
  for each row execute function public.sincronizar_cierre_oportunidad();

-- ---------------------------------------------------------------------------
-- 2. Conversión de lead → cuenta + oportunidad (atómica)
--    SECURITY INVOKER: la RLS del usuario aplica (solo convierte leads que ve).
-- ---------------------------------------------------------------------------
create function public.convertir_lead(
  p_lead_id             uuid,
  p_razon_social        text default null,   -- si null usa leads.empresa
  p_nombre_oportunidad  text default null,   -- si null se genera
  p_monto               numeric default 0,
  p_moneda              moneda default null, -- si null usa la del equipo del dueño
  p_pilar_id            smallint default null,
  p_linea_servicio_id   uuid default null,
  p_servicio_id         uuid default null,
  p_modalidad           modalidad_contrato default 'proyecto',
  p_vertical            vertical_cuenta default 'otro'
)
returns table (cuenta_id uuid, oportunidad_id uuid)
language plpgsql security invoker as $$
declare
  v_lead leads%rowtype;
  v_razon text;
  v_moneda moneda;
  v_etapa uuid;
  v_cuenta uuid;
  v_oportunidad uuid;
begin
  select * into v_lead from leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead no encontrado o sin permisos';
  end if;
  if v_lead.estado = 'convertido' then
    raise exception 'El lead ya fue convertido';
  end if;

  v_razon := nullif(trim(coalesce(p_razon_social, v_lead.empresa, '')), '');
  if v_razon is null then
    raise exception 'Se requiere la razón social de la cuenta';
  end if;

  -- Moneda: explícita > moneda del equipo del dueño del lead > USD
  select coalesce(p_moneda, e.moneda_default, 'USD')
    into v_moneda
    from usuarios u
    left join equipos e on e.id = u.equipo_id
   where u.id = v_lead.propietario_id;

  -- Primera etapa activa del embudo (no ganada ni perdida)
  select id into v_etapa
    from etapas_embudo
   where activa and not es_ganada and not es_perdida
   order by orden
   limit 1;
  if v_etapa is null then
    raise exception 'No hay etapas de embudo activas configuradas';
  end if;

  insert into cuentas (razon_social, vertical, propietario_id, equipo_id, estado)
  values (
    v_razon, p_vertical, v_lead.propietario_id,
    (select equipo_id from usuarios where id = v_lead.propietario_id),
    'prospecto'
  )
  returning id into v_cuenta;

  -- Contacto principal a partir de los datos del lead
  if v_lead.nombre is not null then
    insert into contactos (cuenta_id, nombre, telefono, email, es_principal)
    values (v_cuenta, v_lead.nombre, v_lead.telefono, v_lead.email, true);
  end if;

  insert into oportunidades
    (nombre, cuenta_id, propietario_id, etapa_id, pilar_id, linea_servicio_id,
     servicio_id, modalidad_contrato, monto, moneda)
  values (
    coalesce(nullif(trim(p_nombre_oportunidad), ''), 'Oportunidad — ' || v_razon),
    v_cuenta, v_lead.propietario_id, v_etapa, p_pilar_id, p_linea_servicio_id,
    p_servicio_id, p_modalidad, coalesce(p_monto, 0), v_moneda
  )
  returning id into v_oportunidad;

  update leads
     set estado = 'convertido',
         convertido_cuenta_id = v_cuenta,
         convertido_oportunidad_id = v_oportunidad
   where id = p_lead_id;

  return query select v_cuenta, v_oportunidad;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- >>> supabase/migrations/20260709000004_metricas.sql
-- ────────────────────────────────────────────────────────────────────────────
-- ============================================================================
-- DIPREM CRM — Migración 0004: métricas para metas y dashboards (Fase 3)
-- Vistas con SECURITY INVOKER: la RLS de las tablas base aplica según quién
-- consulta (ejecutivo → lo suyo; gerente → su equipo; admin/lectura → todo).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Avance real de cada meta (calculado desde los datos, nunca guardado)
-- ---------------------------------------------------------------------------
create view public.v_avance_metas
with (security_invoker = true) as
select
  m.id,
  m.usuario_id,
  u.nombre as ejecutivo,
  u.equipo_id,
  m.periodo,
  m.tipo,
  m.objetivo,
  m.moneda,
  case m.tipo
    when 'monto_adjudicado' then coalesce((
      select sum(o.monto)
        from oportunidades o
        join etapas_embudo e on e.id = o.etapa_id
       where o.propietario_id = m.usuario_id
         and e.es_ganada
         and to_char(o.cerrada_en, 'YYYY-MM') = m.periodo
         and (m.moneda is null or o.moneda = m.moneda)
    ), 0)
    when 'actividades' then (
      select count(*)::numeric
        from actividades a
       where a.propietario_id = m.usuario_id
         and a.estado = 'completada'
         and to_char(a.completada_en, 'YYYY-MM') = m.periodo
    )
    when 'oportunidades_nuevas' then (
      select count(*)::numeric
        from oportunidades o
       where o.propietario_id = m.usuario_id
         and to_char(o.creado_en, 'YYYY-MM') = m.periodo
    )
    when 'propuestas_enviadas' then (
      select count(*)::numeric
        from propuestas p
        join oportunidades o on o.id = p.oportunidad_id
       where o.propietario_id = m.usuario_id
         and p.enviada_en is not null
         and to_char(p.enviada_en, 'YYYY-MM') = m.periodo
    )
  end as avance
from metas m
join usuarios u on u.id = m.usuario_id;

-- ---------------------------------------------------------------------------
-- 2. Ranking / actividad del equipo (mes en curso)
-- ---------------------------------------------------------------------------
create view public.v_ranking_equipo
with (security_invoker = true) as
select
  u.id as usuario_id,
  u.nombre,
  u.rol,
  u.equipo_id,
  eq.nombre as equipo,
  eq.pais,
  (select count(*) from actividades a
    where a.propietario_id = u.id and a.estado = 'completada'
      and a.completada_en >= date_trunc('month', now())) as actividades_mes,
  (select count(*) from actividades a
    where a.propietario_id = u.id and a.estado = 'completada'
      and a.completada_en >= date_trunc('day', now())) as actividades_hoy,
  (select count(*) from oportunidades o
    where o.propietario_id = u.id and o.cerrada_en is null) as oportunidades_abiertas,
  (select count(*) from oportunidades o
    join etapas_embudo e on e.id = o.etapa_id
    where o.propietario_id = u.id and e.es_ganada
      and o.cerrada_en >= date_trunc('month', now())) as adjudicadas_mes,
  (select count(*) from oportunidades o
    join etapas_embudo e on e.id = o.etapa_id
    where o.propietario_id = u.id and e.es_perdida
      and o.cerrada_en >= date_trunc('month', now())) as perdidas_mes,
  (select count(*) from oportunidades o
    where o.propietario_id = u.id
      and o.creado_en >= date_trunc('month', now())) as nuevas_mes
from usuarios u
left join equipos eq on eq.id = u.equipo_id
where u.activo and u.rol in ('ejecutivo', 'gerente');

-- ---------------------------------------------------------------------------
-- 3. Pipeline detallado (para embudo agregado, estancadas y reportes por país)
-- ---------------------------------------------------------------------------
create view public.v_pipeline_detalle
with (security_invoker = true) as
select
  o.id,
  o.nombre,
  o.monto,
  o.moneda,
  o.modalidad_contrato,
  o.probabilidad,
  o.creado_en,
  o.cerrada_en,
  o.ultimo_contacto_en,
  o.fecha_cierre_estimada,
  e.id as etapa_id,
  e.nombre as etapa,
  e.orden as etapa_orden,
  e.es_ganada,
  e.es_perdida,
  u.id as propietario_id,
  u.nombre as ejecutivo,
  eq.id as equipo_id,
  eq.nombre as equipo,
  eq.pais,
  c.razon_social as cuenta,
  c.vertical
from oportunidades o
join etapas_embudo e on e.id = o.etapa_id
join usuarios u on u.id = o.propietario_id
left join equipos eq on eq.id = u.equipo_id
join cuentas c on c.id = o.cuenta_id;

grant select on public.v_avance_metas, public.v_ranking_equipo,
                public.v_pipeline_detalle to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- >>> supabase/migrations/20260709000005_mercado_gestion.sql
-- ────────────────────────────────────────────────────────────────────────────
-- ============================================================================
-- DIPREM CRM — Migración 0005: Mercado nacional + análisis de gestión
--   1. Base de proyectos del mercado (importación masiva + asignación a leads)
--   2. Gestión por lead (actividades.lead_id) y triggers de estado
--   3. Vistas de análisis de gestión por contacto y por ejecutivo
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Proyectos del mercado nacional
-- ---------------------------------------------------------------------------
create type estado_proyecto_mercado as enum ('sin_asignar','asignado','convertido');

create table proyectos_mercado (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  empresa           text not null,
  rubro             text,                    -- texto libre del archivo (Minería, Energía…)
  region            text,                    -- región / país
  monto_estimado    numeric(14,2),
  moneda            moneda not null default 'CLP',
  contacto_nombre   text,
  contacto_telefono text,
  contacto_email    text,
  fuente            text,                    -- Mercado Público, minería, energía, etc.
  estado            estado_proyecto_mercado not null default 'sin_asignar',
  asignado_a        uuid references usuarios(id),
  asignado_en       timestamptz,
  lead_id           uuid references leads(id),
  importado_por     uuid not null references usuarios(id),
  creado_en         timestamptz not null default now()
);

-- Dedup de importación: mismo nombre + empresa (sin distinguir mayúsculas) = mismo proyecto
create unique index proyectos_mercado_unicos
  on proyectos_mercado (lower(trim(nombre)), lower(trim(empresa)));
create index proyectos_mercado_estado_idx   on proyectos_mercado (estado);
create index proyectos_mercado_asignado_idx on proyectos_mercado (asignado_a);

alter table proyectos_mercado enable row level security;

-- Solo admin y gerente ven/gestionan el mercado (el ejecutivo recibe leads, no proyectos)
create policy proyectos_mercado_select on proyectos_mercado for select to authenticated
  using (public.es_admin() or public.rol_actual() = 'gerente');
create policy proyectos_mercado_insert on proyectos_mercado for insert to authenticated
  with check (public.es_admin() or public.rol_actual() = 'gerente');
create policy proyectos_mercado_update on proyectos_mercado for update to authenticated
  using (public.es_admin() or public.rol_actual() = 'gerente');
create policy proyectos_mercado_delete on proyectos_mercado for delete to authenticated
  using (public.es_admin() or public.rol_actual() = 'gerente');

create trigger proyectos_mercado_auditoria
  after insert or update or delete on proyectos_mercado
  for each row execute function public.registrar_auditoria();

-- ---------------------------------------------------------------------------
-- 1a. Importación masiva con dedup (SECURITY INVOKER: aplica la RLS de arriba)
--     p_proyectos: array JSON con {nombre, empresa, rubro, region, monto_estimado,
--                  moneda, contacto_nombre, contacto_telefono, contacto_email, fuente}
-- ---------------------------------------------------------------------------
create function public.importar_proyectos_mercado(p_proyectos jsonb)
returns table (insertados int, duplicados int, invalidos int)
language plpgsql security invoker as $$
declare
  fila jsonb;
  v_insertados int := 0;
  v_duplicados int := 0;
  v_invalidos  int := 0;
  v_count int;
begin
  if jsonb_typeof(p_proyectos) is distinct from 'array' then
    raise exception 'Se espera un arreglo JSON de proyectos';
  end if;

  for fila in select * from jsonb_array_elements(p_proyectos) loop
    if nullif(trim(fila->>'nombre'), '') is null
       or nullif(trim(fila->>'empresa'), '') is null then
      v_invalidos := v_invalidos + 1;
      continue;
    end if;

    insert into proyectos_mercado
      (nombre, empresa, rubro, region, monto_estimado, moneda,
       contacto_nombre, contacto_telefono, contacto_email, fuente, importado_por)
    values (
      trim(fila->>'nombre'),
      trim(fila->>'empresa'),
      nullif(trim(coalesce(fila->>'rubro', '')), ''),
      nullif(trim(coalesce(fila->>'region', '')), ''),
      nullif(trim(coalesce(fila->>'monto_estimado', '')), '')::numeric,
      coalesce(nullif(trim(coalesce(fila->>'moneda', '')), '')::moneda, 'CLP'),
      nullif(trim(coalesce(fila->>'contacto_nombre', '')), ''),
      nullif(trim(coalesce(fila->>'contacto_telefono', '')), ''),
      nullif(trim(coalesce(fila->>'contacto_email', '')), ''),
      nullif(trim(coalesce(fila->>'fuente', '')), ''),
      auth.uid()
    )
    on conflict (lower(trim(nombre)), lower(trim(empresa))) do nothing;

    get diagnostics v_count = row_count;
    if v_count > 0 then
      v_insertados := v_insertados + 1;
    else
      v_duplicados := v_duplicados + 1;
    end if;
  end loop;

  return query select v_insertados, v_duplicados, v_invalidos;
end $$;

-- ---------------------------------------------------------------------------
-- 1b. Asignación de proyectos a un ejecutivo como leads (uno o en lote).
--     SECURITY INVOKER: la RLS de leads garantiza que un gerente solo asigna
--     a ejecutivos de su equipo (el admin, a cualquiera).
-- ---------------------------------------------------------------------------
create function public.asignar_proyectos_mercado(
  p_proyecto_ids uuid[],
  p_ejecutivo_id uuid
)
returns table (asignados int, omitidos int)
language plpgsql security invoker as $$
declare
  v_proyecto proyectos_mercado%rowtype;
  v_lead uuid;
  v_fuente fuente_lead;
  v_asignados int := 0;
  v_omitidos  int := 0;
  v_ejecutivo usuarios%rowtype;
begin
  select * into v_ejecutivo from usuarios where id = p_ejecutivo_id;
  if not found or not v_ejecutivo.activo then
    raise exception 'Ejecutivo no encontrado o inactivo';
  end if;
  if v_ejecutivo.rol = 'lectura' then
    raise exception 'No se pueden asignar leads a un usuario de solo lectura';
  end if;

  for v_proyecto in
    select * from proyectos_mercado
     where id = any(p_proyecto_ids)
       and estado = 'sin_asignar'
     for update
  loop
    -- Mapeo de la fuente libre del archivo al catálogo de fuentes de lead
    v_fuente := case
      when v_proyecto.fuente ilike '%mercado p%'  then 'licitacion'
      when v_proyecto.fuente ilike '%licitaci%'   then 'licitacion'
      when v_proyecto.fuente ilike '%web%'        then 'web'
      when v_proyecto.fuente ilike '%referido%'   then 'referido'
      when v_proyecto.fuente ilike '%evento%'     then 'evento'
      when v_proyecto.fuente ilike '%linkedin%'   then 'linkedin'
      else 'otro'
    end;

    insert into leads
      (nombre, empresa, telefono, email, fuente, calificacion,
       propietario_id, estado, notas, atributos)
    values (
      coalesce(v_proyecto.contacto_nombre, 'Contacto ' || v_proyecto.empresa),
      v_proyecto.empresa,
      v_proyecto.contacto_telefono,
      v_proyecto.contacto_email,
      v_fuente,
      'tibio',
      p_ejecutivo_id,
      'nuevo',
      concat_ws(' · ',
        'Proyecto de mercado: ' || v_proyecto.nombre,
        'Rubro: '  || v_proyecto.rubro,
        'Región: ' || v_proyecto.region,
        case when v_proyecto.monto_estimado is not null
          then 'Monto estimado: ' || v_proyecto.monto_estimado || ' ' || v_proyecto.moneda
        end,
        'Fuente: ' || v_proyecto.fuente
      ),
      jsonb_build_object(
        'proyecto_mercado_id', v_proyecto.id,
        'proyecto_nombre', v_proyecto.nombre,
        'rubro', v_proyecto.rubro,
        'region', v_proyecto.region,
        'monto_estimado', v_proyecto.monto_estimado,
        'moneda', v_proyecto.moneda
      )
    )
    returning id into v_lead;

    update proyectos_mercado
       set estado = 'asignado',
           asignado_a = p_ejecutivo_id,
           asignado_en = now(),
           lead_id = v_lead
     where id = v_proyecto.id;

    v_asignados := v_asignados + 1;
  end loop;

  v_omitidos := coalesce(array_length(p_proyecto_ids, 1), 0) - v_asignados;
  return query select v_asignados, v_omitidos;
end $$;

-- ---------------------------------------------------------------------------
-- 1c. Cuando el lead asignado se convierte, el proyecto queda "convertido".
--     SECURITY DEFINER: el ejecutivo que convierte no ve proyectos_mercado.
-- ---------------------------------------------------------------------------
create function public.marcar_proyecto_convertido()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'convertido' then
    update proyectos_mercado
       set estado = 'convertido'
     where lead_id = new.id and estado = 'asignado';
  end if;
  return new;
end $$;

create trigger leads_marcar_proyecto
  after update of estado on leads
  for each row execute function public.marcar_proyecto_convertido();

-- ---------------------------------------------------------------------------
-- 2. Gestión por lead: las actividades pueden ligarse a un lead
-- ---------------------------------------------------------------------------
alter table actividades add column lead_id uuid references leads(id);
create index actividades_lead_idx on actividades (lead_id);

-- Primera gestión completada sobre un lead nuevo → pasa a "en gestión".
-- SECURITY DEFINER: el update de leads no depende de la RLS del usuario.
create function public.registrar_gestion_lead()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'completada' and new.lead_id is not null then
    update leads set estado = 'en_gestion'
     where id = new.lead_id and estado = 'nuevo';
  end if;
  return new;
end $$;

create trigger actividades_gestion_lead
  after insert or update of estado on actividades
  for each row execute function public.registrar_gestion_lead();

-- ---------------------------------------------------------------------------
-- 3. Vistas de análisis de gestión (SECURITY INVOKER: cada rol ve lo suyo)
-- ---------------------------------------------------------------------------

-- Una fila por lead activo y por cuenta activa/prospecto, con su última gestión
create view public.v_gestion_contactos
with (security_invoker = true) as
select
  'lead'::text        as entidad,
  l.id                as entidad_id,
  l.nombre,
  l.empresa           as detalle,
  l.telefono,
  l.email,
  l.propietario_id,
  u.nombre            as ejecutivo,
  u.equipo_id,
  l.creado_en,
  (select max(a.completada_en) from actividades a
    where a.lead_id = l.id and a.estado = 'completada') as ultima_gestion,
  (select count(*) from actividades a
    where a.lead_id = l.id and a.estado = 'completada') as total_gestiones
from leads l
join usuarios u on u.id = l.propietario_id
where l.estado in ('nuevo','en_gestion')
union all
select
  'cuenta',
  c.id,
  c.razon_social,
  c.pais,
  (select ct.telefono from contactos ct
    where ct.cuenta_id = c.id and ct.telefono is not null
    order by ct.es_principal desc, ct.creado_en limit 1),
  (select ct.email from contactos ct
    where ct.cuenta_id = c.id and ct.email is not null
    order by ct.es_principal desc, ct.creado_en limit 1),
  c.propietario_id,
  u.nombre,
  u.equipo_id,
  c.creado_en,
  (select max(a.completada_en) from actividades a
    where a.cuenta_id = c.id and a.estado = 'completada'),
  (select count(*) from actividades a
    where a.cuenta_id = c.id and a.estado = 'completada')
from cuentas c
join usuarios u on u.id = c.propietario_id
where c.estado in ('prospecto','activa');

-- Distribución de tipos de gestión por ejecutivo (últimos 90 días)
create view public.v_distribucion_gestion
with (security_invoker = true) as
select
  a.propietario_id,
  u.nombre  as ejecutivo,
  u.equipo_id,
  a.tipo,
  count(*)  as total
from actividades a
join usuarios u on u.id = a.propietario_id
where a.estado = 'completada'
  and a.completada_en >= now() - interval '90 days'
group by a.propietario_id, u.nombre, u.equipo_id, a.tipo;

grant select on public.v_gestion_contactos, public.v_distribucion_gestion
  to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- >>> supabase/seed.sql
-- ────────────────────────────────────────────────────────────────────────────
-- ============================================================================
-- DIPREM CRM — Seed
-- Parte 1: catálogos DIPREM (válidos en cualquier entorno)
-- Parte 2: datos demo SOLO para desarrollo local (usuarios y cuentas de prueba)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Catálogos DIPREM
-- ---------------------------------------------------------------------------
insert into pilares (id, numero, nombre) values
 (1, 1, 'Dirección y Gestión de Proyectos + QA/QC'),
 (2, 2, 'Seguridad, Salud Ocupacional y Medio Ambiente'),
 (3, 3, 'Evaluación de Proveedores, Control de Contratistas y Desarrollo Tecnológico');

insert into lineas_servicio (pilar_id, nombre) values
 (1, 'Gestión de Proyectos y QA/QC'),
 (2, 'Seguridad y Salud Ocupacional'),
 (2, 'Medio Ambiente'),
 (2, 'Sistema de Gestión de Calidad'), -- nombrada en brochure global; catálogo por confirmar
 (3, 'Control de Contratistas y Desarrollo Tecnológico');

insert into etapas_embudo (nombre, orden, probabilidad_default, es_ganada, es_perdida) values
 ('Prospecto',               1,  10, false, false),
 ('Contactado',              2,  20, false, false),
 ('Reunión / Levantamiento', 3,  40, false, false),
 ('Propuesta enviada',       4,  60, false, false),
 ('Negociación',             5,  80, false, false),
 ('Adjudicado',              6, 100, true,  false),
 ('Perdido',                 7,   0, false, true);

insert into motivos_perdida (nombre) values
 ('Precio'), ('Competencia'), ('Sin presupuesto'), ('Proyecto cancelado'),
 ('Sin respuesta'), ('Tiempos de entrega'), ('Otro');

-- Servicios semilla (catálogo por pilar/línea — precios referenciales pendientes
-- de confirmar con DIPREM, ver docs/CONTEXTO-DIPREM.md §5)
with ls as (select id, pilar_id, nombre from lineas_servicio)
insert into servicios (pilar_id, linea_servicio_id, nombre, unidad)
select v.pilar, ls.id, v.servicio, v.unidad
from (values
  -- Pilar 1
  (1, 'Gestión de Proyectos y QA/QC', 'Supervisión técnica de obras',            'mes'),
  (1, 'Gestión de Proyectos y QA/QC', 'Control de calidad (QA/QC) construcción y montaje', 'mes'),
  (1, 'Gestión de Proyectos y QA/QC', 'Precomisionamiento y comisionamiento',    'proyecto'),
  (1, 'Gestión de Proyectos y QA/QC', 'Puesta en marcha',                        'proyecto'),
  (1, 'Gestión de Proyectos y QA/QC', 'Auditoría técnica',                       'proyecto'),
  (1, 'Gestión de Proyectos y QA/QC', 'Outsourcing de personal especializado',   'HH'),
  (1, 'Gestión de Proyectos y QA/QC', 'Outsourcing de inspectores',              'HH'),
  -- Pilar 2 — SSO
  (2, 'Seguridad y Salud Ocupacional', 'Sistema de gestión SSO',                 'proyecto'),
  (2, 'Seguridad y Salud Ocupacional', 'Higiene y seguridad para obras en construcción', 'mes'),
  (2, 'Seguridad y Salud Ocupacional', 'Seguridad en procesos',                  'proyecto'),
  (2, 'Seguridad y Salud Ocupacional', 'Capacitación SSO (plan anual)',          'hora'),
  (2, 'Seguridad y Salud Ocupacional', 'Auditoría HSE',                          'proyecto'),
  (2, 'Seguridad y Salud Ocupacional', 'Medicina laboral in situ',               'mes'),
  (2, 'Seguridad y Salud Ocupacional', 'Supervisión SSO de personal propio y subcontratistas', 'mes'),
  (2, 'Seguridad y Salud Ocupacional', 'Verificación de elementos de protección personal', 'proyecto'),
  (2, 'Seguridad y Salud Ocupacional', 'Inscripciones y trámites ante organismos reguladores', 'proyecto'),
  -- Pilar 2 — Medio Ambiente
  (2, 'Medio Ambiente', 'Huella de carbono',                                     'proyecto'),
  (2, 'Medio Ambiente', 'Permisos ambientales y cumplimiento legal',             'proyecto'),
  (2, 'Medio Ambiente', 'Evaluación de impactos ambientales',                    'proyecto'),
  (2, 'Medio Ambiente', 'Auditoría y diagnóstico ambiental',                     'proyecto'),
  (2, 'Medio Ambiente', 'Plan de gestión ambiental y social (PGA)',              'proyecto'),
  (2, 'Medio Ambiente', 'Asesoría profesional ambiental mensual',                'mes'),
  (2, 'Medio Ambiente', 'Educación ambiental',                                   'hora'),
  -- Pilar 3
  (3, 'Control de Contratistas y Desarrollo Tecnológico', 'Control documental digital', 'mes'),
  (3, 'Control de Contratistas y Desarrollo Tecnológico', 'Evaluación y auditoría de proveedores', 'proyecto'),
  (3, 'Control de Contratistas y Desarrollo Tecnológico', 'Control de contratistas', 'mes'),
  (3, 'Control de Contratistas y Desarrollo Tecnológico', 'Gestión contractual',     'mes'),
  (3, 'Control de Contratistas y Desarrollo Tecnológico', 'Plataforma de registro y cumplimiento', 'mes'),
  (3, 'Control de Contratistas y Desarrollo Tecnológico', 'Trazabilidad de equipos, vehículos y personal', 'mes')
) as v(pilar, linea, servicio, unidad)
join ls on ls.pilar_id = v.pilar and ls.nombre = v.linea;

-- ---------------------------------------------------------------------------
-- 2. Datos demo — SOLO DESARROLLO LOCAL (contraseña de todos: diprem123)
--    En producción los usuarios se crean por invitación desde Administración.
-- ---------------------------------------------------------------------------

-- Equipos demo
insert into equipos (id, nombre, pais, moneda_default) values
 ('a0000000-0000-4000-8000-000000000001', 'Chile — Santiago',       'Chile',     'CLP'),
 ('a0000000-0000-4000-8000-000000000002', 'Argentina — Buenos Aires','Argentina', 'ARS');

-- Usuarios demo en Supabase Auth (el trigger crear_perfil_al_registrar genera
-- la fila en public.usuarios con nombre y rol desde raw_user_meta_data)
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change, email_change_token_new)
select
  '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated',
  v.email, extensions.crypt('diprem123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('nombre', v.nombre, 'rol', v.rol),
  now(), now(), '', '', '', ''
from (values
  ('b0000000-0000-4000-8000-000000000001'::uuid, 'admin@diprem.local',     'Administración DIPREM', 'admin'),
  ('b0000000-0000-4000-8000-000000000002'::uuid, 'gerente.cl@diprem.local','Gabriela Rojas',        'gerente'),
  ('b0000000-0000-4000-8000-000000000003'::uuid, 'ejecutivo.cl@diprem.local','Esteban Vidal',       'ejecutivo'),
  ('b0000000-0000-4000-8000-000000000004'::uuid, 'gerente.ar@diprem.local','Marina López',          'gerente'),
  ('b0000000-0000-4000-8000-000000000005'::uuid, 'ejecutivo.ar@diprem.local','Julián Pereyra',      'ejecutivo'),
  ('b0000000-0000-4000-8000-000000000006'::uuid, 'lectura@diprem.local',   'Gerencia General',      'lectura')
) as v(id, email, nombre, rol);

insert into auth.identities
  (id, user_id, provider_id, identity_data, provider,
   last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email,
                          'email_verified', true, 'phone_verified', false),
       'email', now(), now(), now()
from auth.users u
where u.email like '%@diprem.local';

-- Asignar equipos y gerentes
update usuarios set equipo_id = 'a0000000-0000-4000-8000-000000000001'
 where email in ('gerente.cl@diprem.local', 'ejecutivo.cl@diprem.local');
update usuarios set equipo_id = 'a0000000-0000-4000-8000-000000000002'
 where email in ('gerente.ar@diprem.local', 'ejecutivo.ar@diprem.local');
update equipos set gerente_id = 'b0000000-0000-4000-8000-000000000002'
 where id = 'a0000000-0000-4000-8000-000000000001';
update equipos set gerente_id = 'b0000000-0000-4000-8000-000000000004'
 where id = 'a0000000-0000-4000-8000-000000000002';

-- Cuentas demo (casos de éxito del brochure Minería 2026, cartera Argentina)
insert into cuentas (razon_social, vertical, pais, propietario_id, equipo_id, estado) values
 ('MILICIC',       'mineria', 'Argentina', 'b0000000-0000-4000-8000-000000000005',
  'a0000000-0000-4000-8000-000000000002', 'activa'),
 ('GANFENG',       'mineria', 'Argentina', 'b0000000-0000-4000-8000-000000000005',
  'a0000000-0000-4000-8000-000000000002', 'activa'),
 ('WORLEY',        'mineria', 'Argentina', 'b0000000-0000-4000-8000-000000000005',
  'a0000000-0000-4000-8000-000000000002', 'activa'),
 ('FIRST QUANTUM', 'mineria', 'Argentina', 'b0000000-0000-4000-8000-000000000005',
  'a0000000-0000-4000-8000-000000000002', 'activa'),
 ('CAN II',        'mineria', 'Argentina', 'b0000000-0000-4000-8000-000000000005',
  'a0000000-0000-4000-8000-000000000002', 'prospecto');

-- Oportunidades demo para poblar el embudo (cartera Argentina; dos quedan
-- "estancadas" a propósito para demostrar la alerta de >14 días sin actividad)
insert into oportunidades
  (nombre, cuenta_id, propietario_id, etapa_id, pilar_id, modalidad_contrato,
   monto, moneda, creado_en, ultimo_contacto_en)
select v.nombre,
       (select id from cuentas where razon_social = v.cuenta),
       'b0000000-0000-4000-8000-000000000005',
       (select id from etapas_embudo where nombre = v.etapa),
       v.pilar, v.modalidad::modalidad_contrato, v.monto, 'ARS',
       now() - (v.dias_creada || ' days')::interval,
       case when v.dias_contacto is null then null
            else now() - (v.dias_contacto || ' days')::interval end
from (values
  ('Outsourcing de inspectores — WORLEY',            'WORLEY',        'Contactado',              1, 'outsourcing',        12000000, 30, 2),
  ('Auditoría HSE — MILICIC',                        'MILICIC',       'Reunión / Levantamiento', 2, 'proyecto',            3500000, 10, 1),
  ('Plan de seguridad — GANFENG Salta',              'GANFENG',       'Propuesta enviada',       2, 'proyecto',            8000000, 45, 21),
  ('Asesoría ambiental mensual — FIRST QUANTUM',     'FIRST QUANTUM', 'Negociación',             2, 'mensual_recurrente',  2400000, 25, 2),
  ('Control documental de contratistas — CAN II',    'CAN II',        'Prospecto',               3, 'proyecto',            1500000, 16, null)
) as v(nombre, cuenta, etapa, pilar, modalidad, monto, dias_creada, dias_contacto)
where exists (select 1 from cuentas where razon_social = v.cuenta)
  and not exists (select 1 from oportunidades o where o.nombre = v.nombre);

-- Metas demo del MES EN CURSO (el admin las edita en Administración → Metas)
insert into metas (usuario_id, periodo, tipo, objetivo, moneda)
select v.usuario_id::uuid, to_char(now(), 'YYYY-MM'), v.tipo::tipo_meta, v.objetivo, v.moneda::moneda
from (values
  ('b0000000-0000-4000-8000-000000000005', 'monto_adjudicado',    5000000, 'ARS'),
  ('b0000000-0000-4000-8000-000000000005', 'actividades',              40, null),
  ('b0000000-0000-4000-8000-000000000005', 'oportunidades_nuevas',      5, null),
  ('b0000000-0000-4000-8000-000000000005', 'propuestas_enviadas',       3, null),
  ('b0000000-0000-4000-8000-000000000003', 'monto_adjudicado',   20000000, 'CLP'),
  ('b0000000-0000-4000-8000-000000000003', 'actividades',              40, null),
  ('b0000000-0000-4000-8000-000000000003', 'oportunidades_nuevas',      5, null)
) as v(usuario_id, tipo, objetivo, moneda)
where exists (select 1 from usuarios where id = v.usuario_id::uuid)
on conflict (usuario_id, periodo, tipo) do nothing;

