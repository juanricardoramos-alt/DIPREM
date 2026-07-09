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
