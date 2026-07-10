-- ============================================================================
-- DIPREM CRM — Migración 0007: Asignación mejorada
--   1. Prioridad, fecha límite de primer contacto, nota privada del dueño y
--      umbral de alerta configurable por asignación
--   2. RPC de asignación v3 (copia la información al lead del ejecutivo)
--   3. Alertas automáticas al dueño cuando no hay gestión en X días
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Nuevos campos de la asignación
-- ---------------------------------------------------------------------------
create type prioridad_proyecto as enum ('alta', 'media', 'baja');

alter table proyectos_mercado
  add column prioridad prioridad_proyecto not null default 'media',
  add column fecha_limite_contacto date,
  add column nota_asignacion text,          -- nota privada del dueño al ejecutivo
  add column dias_alerta_sin_gestion smallint not null default 5
    check (dias_alerta_sin_gestion between 1 and 60),
  add column alerta_enviada_en timestamptz; -- evita alertas duplicadas

-- ---------------------------------------------------------------------------
-- 2. RPC de asignación v3. La firma cambia → se elimina la anterior para no
--    dejar una sobrecarga ambigua en PostgREST.
-- ---------------------------------------------------------------------------
drop function if exists public.asignar_proyectos_mercado(uuid[], uuid);

create function public.asignar_proyectos_mercado(
  p_proyecto_ids uuid[],
  p_ejecutivo_id uuid,
  p_prioridad    prioridad_proyecto default 'media',
  p_fecha_limite date default null,
  p_nota         text default null,
  p_dias_alerta  smallint default 5
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

    -- El lead lleva la información de la asignación en atributos: el
    -- ejecutivo no ve proyectos_mercado, pero sí su lead (prioridad,
    -- fecha límite y nota del dueño viajan con él).
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
      jsonb_strip_nulls(jsonb_build_object(
        'proyecto_mercado_id', v_proyecto.id,
        'proyecto_nombre', v_proyecto.nombre,
        'rubro', v_proyecto.rubro,
        'region', v_proyecto.region,
        'monto_estimado', v_proyecto.monto_estimado,
        'moneda', v_proyecto.moneda,
        'prioridad', p_prioridad,
        'fecha_limite_contacto', p_fecha_limite,
        'nota_asignacion', nullif(trim(coalesce(p_nota, '')), '')
      ))
    )
    returning id into v_lead;

    update proyectos_mercado
       set estado = 'asignado',
           asignado_a = p_ejecutivo_id,
           asignado_en = now(),
           asignado_por = auth.uid(),
           lead_id = v_lead,
           prioridad = p_prioridad,
           fecha_limite_contacto = p_fecha_limite,
           nota_asignacion = nullif(trim(coalesce(p_nota, '')), ''),
           dias_alerta_sin_gestion = coalesce(p_dias_alerta, 5),
           alerta_enviada_en = null
     where id = v_proyecto.id;

    v_asignados := v_asignados + 1;
  end loop;

  v_omitidos := coalesce(array_length(p_proyecto_ids, 1), 0) - v_asignados;
  return query select v_asignados, v_omitidos;
end $$;

-- ---------------------------------------------------------------------------
-- 3. La vista del panel expone los campos nuevos (columnas al final)
-- ---------------------------------------------------------------------------
create or replace view public.v_gestion_proyectos
with (security_invoker = true) as
select
  pm.id,
  pm.nombre     as proyecto,
  pm.empresa,
  pm.estado,
  pm.asignado_a,
  ua.nombre     as ejecutivo,
  pm.asignado_en,
  pm.lead_id,
  (select max(a.completada_en) from actividades a
    where a.lead_id = pm.lead_id and a.estado = 'completada') as ultima_gestion,
  pm.prioridad,
  pm.fecha_limite_contacto,
  pm.nota_asignacion,
  pm.dias_alerta_sin_gestion
from proyectos_mercado pm
left join usuarios ua on ua.id = pm.asignado_a
where pm.estado in ('asignado', 'convertido');

-- ---------------------------------------------------------------------------
-- 4. Alertas automáticas: proyectos asignados sin gestión en X días → aviso
--    a quien los asignó. SECURITY DEFINER: corre desde pg_cron sin sesión.
--    También puede ejecutarse a mano: select public.alertar_proyectos_vencidos();
-- ---------------------------------------------------------------------------
create function public.alertar_proyectos_vencidos()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_fila record;
  v_enviadas int := 0;
begin
  for v_fila in
    select pm.*,
           (select max(a.completada_en) from actividades a
             where a.lead_id = pm.lead_id and a.estado = 'completada') as ultima_gestion
      from proyectos_mercado pm
     where pm.estado = 'asignado'
       and pm.asignado_por is not null
       and pm.alerta_enviada_en is null
  loop
    if now() - coalesce(v_fila.ultima_gestion, v_fila.asignado_en)
         >= make_interval(days => v_fila.dias_alerta_sin_gestion) then
      insert into notificaciones (usuario_id, tipo, titulo, mensaje, entidad, entidad_id)
      values (
        v_fila.asignado_por,
        'alerta_gerencial',
        'Proyecto sin gestión',
        format('"%s" (%s) lleva %s días sin gestión de %s.',
               v_fila.nombre, v_fila.empresa,
               v_fila.dias_alerta_sin_gestion,
               coalesce((select nombre from usuarios where id = v_fila.asignado_a), 'el ejecutivo')),
        'proyecto_mercado',
        v_fila.id
      );
      update proyectos_mercado set alerta_enviada_en = now() where id = v_fila.id;
      v_enviadas := v_enviadas + 1;
    end if;
  end loop;
  return v_enviadas;
end $$;

-- Al registrarse gestión nueva sobre el lead, la alerta se re-arma
create or replace function public.registrar_gestion_lead()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'completada' and new.lead_id is not null then
    update leads set estado = 'en_gestion'
     where id = new.lead_id and estado = 'nuevo';
    update proyectos_mercado set alerta_enviada_en = null
     where lead_id = new.lead_id and alerta_enviada_en is not null;
  end if;
  return new;
end $$;

-- Programación diaria con pg_cron SI la extensión está habilitada
-- (Supabase Dashboard → Database → Extensions → pg_cron). Si no lo está,
-- el panel de Control igual muestra los vencidos; solo faltará el aviso
-- automático, que puede dispararse a mano con la función de arriba.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('diprem-alertas-diarias');
    exception when others then
      null; -- no existía
    end;
    -- 11:00 UTC ≈ 07:00–08:00 en Chile según horario de verano/invierno
    perform cron.schedule(
      'diprem-alertas-diarias',
      '0 11 * * *',
      'select public.alertar_proyectos_vencidos()'
    );
  end if;
end $$;
