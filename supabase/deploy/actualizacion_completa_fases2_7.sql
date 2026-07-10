-- ============================================================================
-- DIPREM CRM — ACTUALIZACIÓN COMPLETA FASES 2–7 (todo en un solo script)
-- Combina, en orden y sin duplicar definiciones intermedias:
--   1. actualizacion_control.sql       (Panel de Control del dueño)
--   2. actualizacion_asignacion.sql    (prioridad, fecha límite, nota, alertas)
--   3. actualizacion_contactos.sql     (LinkedIn, horario, notas privadas)
--   4. actualizacion_reportes.sql      (conversión + reporte semanal)
--   5. actualizacion_comunicacion.sql  (notas internas + notificación)
--
-- Pegar TODO en: Supabase Dashboard → SQL Editor → Run.
-- IDEMPOTENTE: se puede ejecutar más de una vez sin riesgo.
-- Requisito: haber corrido antes actualizacion_mercado.sql (módulo Mercado).
-- pg_cron (opcional): habilítalo ANTES en Database → Extensions para que las
-- alertas diarias y el reporte de los lunes queden programados; si lo habilitas
-- después, vuelve a correr este script.
-- ============================================================================

-- Verificación de prerequisito: el módulo Mercado debe existir
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'proyectos_mercado'
  ) then
    raise exception
      'Falta el módulo Mercado: ejecuta primero supabase/deploy/actualizacion_mercado.sql';
  end if;
end $$;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  SECCIÓN 1 · Panel de Control del dueño (migración 0006)                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
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

-- (La RPC asignar_proyectos_mercado se define más abajo, en su versión final
--  con prioridad/fecha límite/nota — sección Asignación mejorada.)


-- ---------------------------------------------------------------------------
-- 2. Vistas del panel de Control (SECURITY INVOKER: solo admin/gerente ven
--    proyectos_mercado, así que las vistas heredan esa barrera)
-- ---------------------------------------------------------------------------

-- (La vista v_gestion_proyectos se crea más abajo, en su versión final con
--  prioridad y fecha límite — sección Asignación mejorada.)

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

grant select on public.v_historial_asignaciones to authenticated;

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

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  SECCIÓN 2 · Asignación mejorada (migración 0007)                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Migración 0007: Asignación mejorada
--   1. Prioridad, fecha límite de primer contacto, nota privada del dueño y
--      umbral de alerta configurable por asignación
--   2. RPC de asignación v3 (copia la información al lead del ejecutivo)
--   3. Alertas automáticas al dueño cuando no hay gestión en X días
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Nuevos campos de la asignación
-- ---------------------------------------------------------------------------
do $$ begin
  create type prioridad_proyecto as enum ('alta', 'media', 'baja');
exception when duplicate_object then null;
end $$;

alter table proyectos_mercado
  add column if not exists prioridad prioridad_proyecto not null default 'media';
alter table proyectos_mercado
  add column if not exists fecha_limite_contacto date;
alter table proyectos_mercado
  add column if not exists nota_asignacion text; -- nota privada del dueño al ejecutivo
alter table proyectos_mercado
  add column if not exists dias_alerta_sin_gestion smallint not null default 5;
alter table proyectos_mercado
  add column if not exists alerta_enviada_en timestamptz; -- evita alertas duplicadas

-- ---------------------------------------------------------------------------
-- 2. RPC de asignación v3. La firma cambia → se elimina la anterior para no
--    dejar una sobrecarga ambigua en PostgREST.
-- ---------------------------------------------------------------------------
drop function if exists public.asignar_proyectos_mercado(uuid[], uuid);

create or replace function public.asignar_proyectos_mercado(
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

grant select on public.v_gestion_proyectos to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Alertas automáticas: proyectos asignados sin gestión en X días → aviso
--    a quien los asignó. SECURITY DEFINER: corre desde pg_cron sin sesión.
--    También puede ejecutarse a mano: select public.alertar_proyectos_vencidos();
-- ---------------------------------------------------------------------------
create or replace function public.alertar_proyectos_vencidos()
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

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  SECCIÓN 3 · Perfil de contacto enriquecido (migración 0008)               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Migración 0008: Perfil de contacto enriquecido
--   LinkedIn, mejor horario para contactar y notas privadas internas.
--   La visibilidad hereda la RLS de la cuenta (sin políticas nuevas).
-- ============================================================================

alter table contactos add column if not exists linkedin text;        -- URL o usuario de LinkedIn
alter table contactos add column if not exists mejor_horario text;   -- ej: "Martes a jueves, 9:00–11:00"
alter table contactos add column if not exists notas_privadas text;  -- internas DIPREM: no salen en la ficha PDF

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  SECCIÓN 4 · Reportes para el dueño (migración 0009)                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Migración 0009: Reportes para el dueño
--   1. Vista de conversión: asignado → contactado → convertido → propuesta
--      enviada → adjudicado, por proyecto del mercado
--   2. Notificación del reporte semanal (lunes) a dueño y gerentes
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Embudo de conversión de proyectos asignados (una fila por proyecto,
--    con la fecha en que alcanzó cada hito; el cliente agrega y filtra).
--    SECURITY INVOKER: hereda la RLS de proyectos_mercado (solo admin/gerente).
-- ---------------------------------------------------------------------------
create or replace view public.v_conversion_proyectos
with (security_invoker = true) as
select
  pm.id,
  pm.nombre  as proyecto,
  pm.empresa,
  pm.rubro,
  pm.region,
  pm.estado,
  pm.asignado_a,
  ua.nombre  as ejecutivo,
  pm.asignado_en,
  -- contactado: primera gestión completada sobre el lead
  (select min(a.completada_en) from actividades a
    where a.lead_id = pm.lead_id and a.estado = 'completada') as contactado_en,
  l.convertido_oportunidad_id as oportunidad_id,
  -- propuesta enviada sobre la oportunidad resultante
  (select min(p.enviada_en) from propuestas p
    where p.oportunidad_id = l.convertido_oportunidad_id
      and p.enviada_en is not null) as propuesta_enviada_en,
  -- adjudicado: la oportunidad resultante quedó en etapa ganada
  (select o.cerrada_en from oportunidades o
    join etapas_embudo e on e.id = o.etapa_id
    where o.id = l.convertido_oportunidad_id and e.es_ganada) as adjudicada_en
from proyectos_mercado pm
left join usuarios ua on ua.id = pm.asignado_a
left join leads l on l.id = pm.lead_id
where pm.asignado_en is not null;

grant select on public.v_conversion_proyectos to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Reporte semanal: cada lunes se avisa a dueño (admin) y gerentes que el
--    resumen de la semana anterior está listo. SECURITY DEFINER: corre desde
--    pg_cron. Los administradores reciben las cifras globales; los gerentes,
--    un aviso genérico (su página de Reportes ya filtra por equipo).
--    También puede dispararse a mano: select public.notificar_reporte_semanal();
-- ---------------------------------------------------------------------------
create or replace function public.notificar_reporte_semanal()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_desde timestamptz := date_trunc('week', now()) - interval '7 days';
  v_hasta timestamptz := date_trunc('week', now());
  v_gestiones int;
  v_adjudicadas int;
  v_usuario record;
  v_total int := 0;
begin
  select count(*) into v_gestiones
    from actividades
   where estado = 'completada'
     and completada_en >= v_desde and completada_en < v_hasta;

  select count(*) into v_adjudicadas
    from oportunidades o
    join etapas_embudo e on e.id = o.etapa_id
   where e.es_ganada
     and o.cerrada_en >= v_desde and o.cerrada_en < v_hasta;

  for v_usuario in
    select id, rol from usuarios where activo and rol in ('admin', 'gerente')
  loop
    insert into notificaciones (usuario_id, tipo, titulo, mensaje, entidad)
    values (
      v_usuario.id,
      'alerta_gerencial',
      'Reporte semanal listo',
      case when v_usuario.rol = 'admin' then
        format('La semana pasada el equipo registró %s gestiones y adjudicó %s oportunidades. Revisa el detalle por ejecutivo en Reportes → Semanal.',
               v_gestiones, v_adjudicadas)
      else
        'El resumen de la semana pasada de tu equipo está listo en Reportes → Semanal.'
      end,
      'reporte_semanal'
    );
    v_total := v_total + 1;
  end loop;

  return v_total;
end $$;

-- Programación con pg_cron SI la extensión está habilitada (lunes 11:00 UTC
-- ≈ 07:00–08:00 en Chile). Igual que las alertas diarias: sin pg_cron, la
-- pestaña Semanal funciona igual; solo falta el aviso automático.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('diprem-reporte-semanal');
    exception when others then
      null; -- no existía
    end;
    perform cron.schedule(
      'diprem-reporte-semanal',
      '0 11 * * 1',
      'select public.notificar_reporte_semanal()'
    );
  end if;
end $$;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  SECCIÓN 5 · Comunicación interna (migración 0010)                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Migración 0010: Comunicación interna
--   Notas internas sobre leads, oportunidades y cuentas (tabla `notas`, que ya
--   existe con RLS heredada del registro padre) + notificación automática al
--   ejecutivo dueño del registro cuando comenta otra persona.
-- ============================================================================

-- SECURITY DEFINER: el autor de la nota (dueño/gerente) inserta una
-- notificación para OTRO usuario (el ejecutivo del registro).
create or replace function public.notificar_nota_interna()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_propietario uuid;
  v_titulo text;
  v_autor text;
  v_entidad_ruta text := new.entidad;
  v_entidad_id uuid := new.entidad_id;
begin
  if new.entidad = 'lead' then
    select propietario_id, nombre into v_propietario, v_titulo
      from leads where id = new.entidad_id;
  elsif new.entidad = 'oportunidad' then
    -- La notificación enlaza a la cuenta (ahí vive el hilo de la oportunidad)
    select o.propietario_id, o.nombre, o.cuenta_id
      into v_propietario, v_titulo, v_entidad_id
      from oportunidades o where o.id = new.entidad_id;
    v_entidad_ruta := 'cuenta';
  elsif new.entidad = 'cuenta' then
    select propietario_id, razon_social into v_propietario, v_titulo
      from cuentas where id = new.entidad_id;
  else
    return new; -- contactos u otras entidades: sin notificación
  end if;

  -- Sin destinatario o el autor comenta en lo suyo → nada que avisar
  if v_propietario is null or v_propietario = new.autor_id then
    return new;
  end if;

  select nombre into v_autor from usuarios where id = new.autor_id;

  insert into notificaciones (usuario_id, tipo, titulo, mensaje, entidad, entidad_id)
  values (
    v_propietario,
    'nota_interna',
    'Nueva nota interna',
    format('%s comentó en "%s": %s',
           coalesce(v_autor, 'Alguien'), v_titulo, left(new.contenido, 140)),
    v_entidad_ruta,
    v_entidad_id
  );
  return new;
end $$;

drop trigger if exists notas_notificar on notas;
create trigger notas_notificar
  after insert on notas
  for each row execute function public.notificar_nota_interna();

-- ============================================================================
-- ✅ Listo. Verificaciones rápidas:
--   select * from v_historial_asignaciones limit 5;
--   select nombre, actividades_7d from v_ranking_equipo;
--   select prioridad, fecha_limite_contacto from proyectos_mercado limit 5;
--   select linkedin, mejor_horario from contactos limit 5;
--   select * from v_conversion_proyectos limit 5;
--   select public.alertar_proyectos_vencidos();   -- alertas de vencidos a mano
--   select public.notificar_reporte_semanal();    -- aviso del reporte a mano
--   select jobname from cron.job;                 -- solo si pg_cron está habilitado
-- ============================================================================
