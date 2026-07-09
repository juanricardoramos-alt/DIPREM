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
