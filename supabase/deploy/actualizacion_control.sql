-- ============================================================================
-- DIPREM CRM — ACTUALIZACIÓN: Panel de Control del dueño
-- Para proyectos que ya corrieron actualizacion_mercado.sql.
-- Pegar TODO en: Supabase Dashboard → SQL Editor → Run.
-- Se puede ejecutar más de una vez sin duplicar datos.
-- ============================================================================
-- Migración 0006: Panel de Control del dueño
--   1. Trazabilidad de asignaciones (quién asignó qué, a quién y cuándo)
--   2. Vistas del panel: gestión de proyectos asignados e historial
--   3. Botón "Recordar": notificación in-app al ejecutivo responsable
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Quién asignó cada proyecto
-- ---------------------------------------------------------------------------
alter table proyectos_mercado
  add column if not exists asignado_por uuid references usuarios(id);

-- La RPC de asignación ahora registra quién asigna
create or replace function public.asignar_proyectos_mercado(
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
           asignado_por = auth.uid(),
           lead_id = v_lead
     where id = v_proyecto.id;

    v_asignados := v_asignados + 1;
  end loop;

  v_omitidos := coalesce(array_length(p_proyecto_ids, 1), 0) - v_asignados;
  return query select v_asignados, v_omitidos;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Vistas del panel de Control (SECURITY INVOKER: solo admin/gerente ven
--    proyectos_mercado, así que las vistas heredan esa barrera)
-- ---------------------------------------------------------------------------

-- Proyectos asignados/convertidos con su última gestión real (vía el lead)
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
    where a.lead_id = pm.lead_id and a.estado = 'completada') as ultima_gestion
from proyectos_mercado pm
left join usuarios ua on ua.id = pm.asignado_a
where pm.estado in ('asignado', 'convertido');

-- Historial: quién asignó qué proyecto, a quién y cuándo
create or replace view public.v_historial_asignaciones
with (security_invoker = true) as
select
  pm.id,
  pm.nombre      as proyecto,
  pm.empresa,
  pm.estado,
  pm.asignado_en,
  pm.asignado_a,
  ua.nombre      as asignado_a_nombre,
  pm.asignado_por,
  up.nombre      as asignado_por_nombre,
  pm.lead_id
from proyectos_mercado pm
left join usuarios ua on ua.id = pm.asignado_a
left join usuarios up on up.id = pm.asignado_por
where pm.asignado_en is not null;

grant select on public.v_gestion_proyectos, public.v_historial_asignaciones
  to authenticated;

-- El semáforo del panel necesita la actividad de los últimos 7 días:
-- se recrea v_ranking_equipo (migración 0004) agregando la columna al final.
create or replace view public.v_ranking_equipo
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
      and o.creado_en >= date_trunc('month', now())) as nuevas_mes,
  (select count(*) from actividades a
    where a.propietario_id = u.id and a.estado = 'completada'
      and a.completada_en >= now() - interval '7 days') as actividades_7d
from usuarios u
left join equipos eq on eq.id = u.equipo_id
where u.activo and u.rol in ('ejecutivo', 'gerente');

-- ---------------------------------------------------------------------------
-- 3. Botón "Recordar": crea una notificación in-app para el ejecutivo.
--    SECURITY DEFINER porque se inserta una notificación de OTRO usuario;
--    se valida el rol y (para gerentes) que el ejecutivo sea de su equipo.
-- ---------------------------------------------------------------------------
create or replace function public.recordar_proyecto(p_proyecto_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_rol rol_usuario := public.rol_actual();
  v_proyecto proyectos_mercado%rowtype;
begin
  if v_rol not in ('admin', 'gerente') then
    raise exception 'Solo administradores y gerentes pueden enviar recordatorios';
  end if;

  select * into v_proyecto from proyectos_mercado where id = p_proyecto_id;
  if not found or v_proyecto.asignado_a is null then
    raise exception 'Proyecto no encontrado o sin asignar';
  end if;
  if v_rol = 'gerente' and not public.gerencia_a(v_proyecto.asignado_a) then
    raise exception 'Solo puedes recordar proyectos de tu equipo';
  end if;

  insert into notificaciones (usuario_id, tipo, titulo, mensaje, entidad, entidad_id)
  values (
    v_proyecto.asignado_a,
    'recordatorio',
    'Recordatorio de gestión',
    format('El proyecto "%s" (%s) espera tu gestión. Registra el primer contacto.',
           v_proyecto.nombre, v_proyecto.empresa),
    'lead',
    v_proyecto.lead_id
  );
end $$;

-- ✅ Listo. Verifica con:
--   select * from v_historial_asignaciones limit 5;
--   select nombre, actividades_7d from v_ranking_equipo;
