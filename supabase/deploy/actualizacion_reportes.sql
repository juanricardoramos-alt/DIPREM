-- ============================================================================
-- DIPREM CRM — ACTUALIZACIÓN: Reportes para el dueño
-- Pegar TODO en: Supabase Dashboard → SQL Editor → Run.
-- Se puede ejecutar más de una vez sin duplicar datos.
-- ============================================================================
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

-- ✅ Listo. Verifica con:
--   select * from v_conversion_proyectos limit 5;
--   select public.notificar_reporte_semanal(); -- dispara el aviso a mano
