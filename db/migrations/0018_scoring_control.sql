-- ============================================================================
-- DIPREM CRM — Migración 0018 (Neon): scoring del radar + métricas de control
-- Aprobado 2026-08-05. Dos bloques:
--
-- A. SCORING (Radar): score 0–100 por proyecto con desglose auditable en
--    score_detalle ("por qué puntuó 92") y cubeta = pilar DIPREM primario por
--    etapa. Pesos aprobados: etapa 40 · capex 20 · sector 15 ·
--    contactabilidad 15 · cliente histórico 10. Ajustes del dueño:
--      · etapa pesa más que capex (USD 150M en construcción > USD 2.000M en
--        factibilidad: el primero compra AHORA);
--      · en ventana caliente la contactabilidad NO penaliza (un proyecto
--        grande sin contacto es URGENTE, no malo — al segmento Prospección
--        con su score intacto);
--      · perfil/prefactibilidad/factibilidad = segmento ACTIVO de Pilar 2
--        (compran SEIA y permisos ahora), no siembra.
--    Mapeo etapa → pilar (aprobado): ing. detalle/construcción/comisionamiento
--    → P1 · en licitación → P3 (evaluación de proveedores ANTES de contratar)
--    · perfil→factibilidad → P2-MA (SEIA) · operación → P2 recurrente.
--
-- B. CONTROL (resultado, no actividad): cobertura de cartera 30d · avance
--    puerta→decisor (con autoría por TRIGGER, no falsificable por cliente) ·
--    movimiento de embudo (desde auditoría) · oportunidades huérfanas (sin
--    próximo paso con fecha) · cuentas críticas (CAPEX × días sin gestión;
--    la lista del acaparador) · tasa de respuesta (efectividad, no conteo).
--    El ranking por número de actividades queda proscrito en la UI.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. actividades.con_respuesta — la materia prima de la tasa de respuesta.
--    null = no registrado (histórico); la UI lo pregunta al completar
--    gestiones de contacto. Solo cuenta hacia adelante.
-- ---------------------------------------------------------------------------
alter table actividades add column con_respuesta boolean;
comment on column actividades.con_respuesta is
  'Al completar una gestión de contacto: ¿hubo respuesta/conversación real? null = no registrado (no cuenta en la tasa)';

-- ---------------------------------------------------------------------------
-- 2. Autoría de contactos por trigger (no por cliente): quién consiguió al
--    decisor es una métrica de desempeño — si lo llenara la app, un ejecutivo
--    con el JWT podría falsificarlo. La carga masiva (owner, sin JWT) queda
--    en null a propósito: los importados no son mérito de nadie.
-- ---------------------------------------------------------------------------
create function public.sellar_creado_por_contacto()
returns trigger language plpgsql as $$
begin
  new.creado_por := coalesce(public.usuario_actual(), new.creado_por);
  return new;
end $$;

create trigger contactos_sellar_creado_por
  before insert on contactos
  for each row execute function public.sellar_creado_por_contacto();

-- ---------------------------------------------------------------------------
-- 3. Mapeo etapa → cubeta (pilar primario). Aprobado 2026-08-05.
-- ---------------------------------------------------------------------------
create function public.cubeta_de_etapa(p_etapa etapa_proyecto)
returns cubeta_scoring language sql immutable as $$
  select case p_etapa
    when 'perfil'             then 'objetivo_pilar_2'::cubeta_scoring  -- SEIA/permisos
    when 'prefactibilidad'    then 'objetivo_pilar_2'
    when 'factibilidad'       then 'objetivo_pilar_2'
    when 'ingenieria_basica'  then 'objetivo_pilar_1'
    when 'ingenieria_detalle' then 'objetivo_pilar_1'  -- QA/QC fabricación, ingeniería
    when 'en_licitacion'      then 'objetivo_pilar_3'  -- evaluación de proveedores
    when 'construccion'       then 'objetivo_pilar_1'  -- peak: supervisión/QAQC
    when 'comisionamiento'    then 'objetivo_pilar_1'  -- precom/com/PEM (catálogo)
    when 'operacion'          then 'om_hse_recurrente' -- P2 mensual recurrente
    when 'exploracion'        then 'descarte'          -- watchlist (reversible)
    when 'paralizado'         then 'descarte'
    when 'cerrado'            then 'descarte'
  end
$$;

-- ---------------------------------------------------------------------------
-- 4. Score con desglose auditable. SECURITY DEFINER a propósito: el score es
--    una verdad GLOBAL — debe calcularse viendo todos los contactos e
--    historial, no el recorte RLS de quien dispara el recálculo.
-- ---------------------------------------------------------------------------
create function public.calcular_score_mercado(
  p_etapa    etapa_proyecto,
  p_capex    numeric,
  p_sector   vertical_cuenta,
  p_cuenta_id uuid
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_etapa int; v_capex int; v_sector int; v_contacto int; v_historial int;
  v_det_etapa text; v_det_capex text; v_det_sector text;
  v_det_contacto text; v_det_historial text;
  v_contactos text;      -- mejor bucket presente en la cuenta
  v_cubeta cubeta_scoring := public.cubeta_de_etapa(p_etapa);
  v_secundarios text[];
begin
  -- ETAPA (40): la ventana caliente manda — ese proyecto compra AHORA
  v_etapa := case
    when p_etapa is null then 10
    when public.en_ventana_caliente(p_etapa) then 40
    when p_etapa = 'ingenieria_basica' then 30
    when p_etapa = 'factibilidad'      then 25
    when p_etapa = 'prefactibilidad'   then 22
    when p_etapa = 'perfil'            then 18
    when p_etapa = 'operacion'         then 15
    when p_etapa = 'exploracion'       then 5
    else 0 end;
  v_det_etapa := coalesce(p_etapa::text, 'por clasificar')
    || case when p_etapa is not null and public.en_ventana_caliente(p_etapa)
            then ' (ventana caliente)' else '' end;

  -- CAPEX (20): escala logarítmica; origen iMercados en US$ millones
  v_capex := case
    when p_capex is null   then 2
    when p_capex >= 1000   then 20
    when p_capex >= 100    then 16
    when p_capex >= 10     then 11
    when p_capex >= 1      then 6
    else 2 end;
  v_det_capex := coalesce(p_capex::text || ' MUSD (origen iMercados, US$ millones)',
                          'sin dato');

  -- SECTOR (15): foco comercial 2026
  v_sector := case
    when p_sector in ('mineria','energia')        then 15
    when p_sector in ('infraestructura','oil_gas') then 10
    else 5 end;
  v_det_sector := coalesce(p_sector::text, 'sin sector') ||
    case when p_sector in ('mineria','energia') then ' (foco 2026)' else '' end;

  -- CONTACTABILIDAD (15): mejor bucket presente (sin opt-out)
  select case
      when bool_or(public.bucket_rol(ct.rol) = 'decisor_tecnico') then 'decisor'
      when bool_or(public.bucket_rol(ct.rol) = 'gestor_compra')   then 'gestor'
      when bool_or(public.bucket_rol(ct.rol) = 'puerta_entrada')  then 'puerta'
      else 'ninguno' end
    into v_contactos
    from contactos ct
   where ct.cuenta_id = p_cuenta_id and ct.opt_out_en is null;
  v_contactos := coalesce(v_contactos, 'ninguno');

  if p_etapa is not null and public.en_ventana_caliente(p_etapa) then
    -- Aprobado: en ventana caliente NO penaliza — la urgencia la muestra el
    -- segmento (Prospección), no un score castigado
    v_contacto := 15;
    v_det_contacto := v_contactos || ' — ventana caliente: no penaliza';
  else
    v_contacto := case v_contactos
      when 'decisor' then 15 when 'gestor' then 10
      when 'puerta' then 6 else 0 end;
    v_det_contacto := v_contactos;
  end if;

  -- CLIENTE HISTÓRICO (10): adjudicación > oportunidad > gestión > virgen.
  -- Parte en 0 para toda la carga (recién nacida) y sube solo con gestión real.
  if p_cuenta_id is not null and exists (
       select 1 from adjudicaciones ad
       join oportunidades o on o.id = ad.oportunidad_id
      where o.cuenta_id = p_cuenta_id) then
    v_historial := 10; v_det_historial := 'con adjudicación previa';
  elsif p_cuenta_id is not null and exists (
       select 1 from oportunidades o where o.cuenta_id = p_cuenta_id) then
    v_historial := 7; v_det_historial := 'con oportunidad previa';
  elsif p_cuenta_id is not null and exists (
       select 1 from actividades a
      where a.cuenta_id = p_cuenta_id and a.estado = 'completada') then
    v_historial := 5; v_det_historial := 'con gestión previa';
  else
    v_historial := 0; v_det_historial := 'sin historial';
  end if;

  -- Pilares secundarios del mapeo aprobado (visibles en la ficha)
  v_secundarios := case p_etapa
    when 'factibilidad'       then array['P1: outsourcing de ingeniería para los estudios']
    when 'ingenieria_basica'  then array['P3: control documental y evaluación de proveedores']
    when 'ingenieria_detalle' then array['P3: control documental y evaluación de proveedores']
    when 'en_licitacion'      then array['P1: auditoría técnica / revisión de ofertas']
    when 'construccion'       then array['P2: seguridad de obra y SSO de subcontratistas',
                                         'P3: control de contratistas']
    when 'comisionamiento'    then array['P2: seguridad en procesos para el arranque']
    when 'operacion'          then array['P1: O&M con recursos calificados',
                                         'P3: control de contratistas de la operación']
    else array[]::text[] end;

  return jsonb_build_object(
    'version', 'v1-0018',
    'total', v_etapa + v_capex + v_sector + v_contacto + v_historial,
    'cubeta', v_cubeta,
    'pilar_primario', case v_cubeta
       when 'objetivo_pilar_1' then 'P1' when 'objetivo_pilar_2' then 'P2'
       when 'objetivo_pilar_3' then 'P3' when 'om_hse_recurrente' then 'P2 recurrente'
       else null end,
    'pilares_secundarios', to_jsonb(v_secundarios),
    'factores', jsonb_build_object(
      'etapa',             jsonb_build_object('puntos', v_etapa,    'max', 40, 'detalle', v_det_etapa),
      'capex',             jsonb_build_object('puntos', v_capex,    'max', 20, 'detalle', v_det_capex),
      'sector',            jsonb_build_object('puntos', v_sector,   'max', 15, 'detalle', v_det_sector),
      'contactabilidad',   jsonb_build_object('puntos', v_contacto, 'max', 15, 'detalle', v_det_contacto),
      'cliente_historico', jsonb_build_object('puntos', v_historial,'max', 10, 'detalle', v_det_historial)));
end $$;

-- El score se sella en el INSERT y en cada cambio de los insumos del proyecto
create function public.aplicar_score_mercado()
returns trigger language plpgsql security definer set search_path = public as $$
declare d jsonb;
begin
  d := public.calcular_score_mercado(new.etapa, new.capex_musd, new.sector, new.cuenta_id);
  new.score := (d->>'total')::smallint;
  new.score_detalle := d;
  new.cubeta := (d->>'cubeta')::cubeta_scoring;
  new.score_calculado_en := now();
  return new;
end $$;

create trigger proyectos_mercado_score
  before insert or update of etapa, capex_musd, sector, cuenta_id on proyectos_mercado
  for each row execute function public.aplicar_score_mercado();

-- Recálculo masivo (tras editar reglas, cargar contactos o ganar historial).
-- DEFINER con guardia: dueño de la BD (migraciones/scripts, sin JWT) o
-- admin/gerente vía la app. Cada recálculo queda en auditoría (update real).
create function public.recalcular_scores_mercado()
returns int language plpgsql volatile security definer set search_path = public as $$
declare v int;
begin
  if public.usuario_actual() is not null
     and public.rol_actual() not in ('admin','gerente') then
    raise exception 'Solo admin o gerente recalculan el scoring';
  end if;
  update proyectos_mercado set etapa = etapa;   -- dispara el trigger de score
  get diagnostics v = row_count;
  return v;
end $$;

grant execute on function public.recalcular_scores_mercado() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Vistas de Control — RESULTADO, no actividad (SECURITY INVOKER: heredan
--    la RLS; el ejecutivo ve lo suyo, el gerente su equipo, el admin todo)
-- ---------------------------------------------------------------------------

-- 5a. Cobertura: % de la cartera con gestión en 30 días. 80 cuentas con 12
--     gestionadas = 15%, aunque haya 200 llamadas anotadas.
create view public.v_control_cobertura
with (security_invoker = true) as
select u.id  as usuario_id,
       u.nombre,
       u.rol,
       u.equipo_id,
       eq.nombre as equipo,
       count(c.id) as cartera,
       count(c.id) filter (where g.ultima >= now() - interval '30 days') as gestionadas_30d,
       case when count(c.id) > 0
            then round(100.0 * count(c.id) filter (where g.ultima >= now() - interval '30 days')
                       / count(c.id))
       end as cobertura_pct
from usuarios u
left join equipos eq on eq.id = u.equipo_id
left join cuentas c on c.propietario_id = u.id and c.estado <> 'inactiva'
left join lateral (
  select max(a.completada_en) as ultima
    from actividades a
   where a.cuenta_id = c.id and a.estado = 'completada'
) g on true
where u.activo and not u.es_sistema and u.rol in ('ejecutivo','gerente')
group by u.id, u.nombre, u.rol, u.equipo_id, eq.nombre;

-- 5b. Avance real: cuentas cuyo PRIMER decisor técnico lo consiguió una
--     persona (creado_por sellado por trigger; los importados no cuentan).
create view public.v_control_avance_decisor
with (security_invoker = true) as
select c.id   as cuenta_id,
       c.razon_social,
       c.propietario_id,
       u.nombre  as ejecutivo,
       u.equipo_id,
       pd.logrado_en,
       pd.creado_por,
       ua.nombre as autor
from cuentas c
join lateral (
  select ct.creado_en as logrado_en, ct.creado_por
    from contactos ct
   where ct.cuenta_id = c.id
     and public.bucket_rol(ct.rol) = 'decisor_tecnico'
     and ct.opt_out_en is null
   order by ct.creado_en
   limit 1
) pd on pd.creado_por is not null
join usuarios u on u.id = c.propietario_id
left join usuarios ua on ua.id = pd.creado_por;

-- 5c. Movimiento de embudo: oportunidades que CAMBIARON de etapa (auditoría),
--     no cuántas se crearon. avance=true cuando subió de orden.
create view public.v_control_embudo
with (security_invoker = true) as
select (a.entidad_id)::uuid as oportunidad_id,
       o.nombre  as oportunidad,
       o.monto,
       o.moneda,
       o.propietario_id,
       up.nombre as ejecutivo,
       a.usuario_id as movido_por_id,
       um.nombre as movido_por,
       a.creado_en as movido_en,
       ea.nombre as de_etapa,
       ed.nombre as a_etapa,
       (ed.orden > ea.orden) as avance
from auditoria a
join oportunidades o  on o.id  = (a.entidad_id)::uuid
join etapas_embudo ea on ea.id = ((a.cambios->'antes'->>'etapa_id'))::uuid
join etapas_embudo ed on ed.id = ((a.cambios->'despues'->>'etapa_id'))::uuid
left join usuarios up on up.id = o.propietario_id
left join usuarios um on um.id = a.usuario_id
where a.entidad = 'oportunidades'
  and a.accion  = 'UPDATE'
  and (a.cambios->'antes'->>'etapa_id') is distinct from (a.cambios->'despues'->>'etapa_id');

-- 5d. Huérfanas: abiertas SIN próximo paso con fecha. Eso es abandono.
create view public.v_control_huerfanas
with (security_invoker = true) as
select o.id as oportunidad_id,
       o.nombre as oportunidad,
       o.monto,
       o.moneda,
       o.cuenta_id,
       c.razon_social,
       o.propietario_id,
       u.nombre as ejecutivo,
       u.equipo_id,
       e.nombre as etapa,
       extract(day from now() - coalesce(o.ultimo_contacto_en, o.creado_en))::int
         as dias_sin_contacto
from oportunidades o
join cuentas c        on c.id = o.cuenta_id
join usuarios u       on u.id = o.propietario_id
join etapas_embudo e  on e.id = o.etapa_id
where o.cerrada_en is null
  and not exists (
    select 1 from actividades a
     where a.oportunidad_id = o.id
       and a.estado = 'pendiente'
       and coalesce(a.fecha_programada, a.fecha_vencimiento) >= now());

-- 5e. Cuentas críticas: cartera asignada ordenable por CAPEX vinculado × días
--     sin gestión. Con umbral (7/14/30 en la UI) es la lista del acaparador:
--     arriba y en rojo, imposible de ignorar. Sin gestión nunca → los días
--     corren desde el reclamo (actualizado_en lo sella el propio reclamo).
create view public.v_control_criticas
with (security_invoker = true) as
select c.id as cuenta_id,
       c.razon_social,
       c.rol_mercado,
       c.propietario_id,
       u.nombre as ejecutivo,
       u.equipo_id,
       g.ultima as ultima_gestion,
       extract(day from now() - coalesce(g.ultima, c.actualizado_en))::int
         as dias_sin_gestion,
       pm.n_proyectos,
       pm.capex_max,
       pm.score_max
from cuentas c
join usuarios u on u.id = c.propietario_id and not u.es_sistema
left join lateral (
  select max(a.completada_en) as ultima
    from actividades a
   where a.cuenta_id = c.id and a.estado = 'completada'
) g on true
left join lateral (
  select count(*) as n_proyectos, max(p.capex_musd) as capex_max, max(p.score) as score_max
    from proyectos_mercado p
   where p.cuenta_id = c.id
) pm on true
where c.estado <> 'inactiva';

-- 5f. Tasa de respuesta (30 días): efectividad, no conteo. Solo gestiones de
--     contacto; con_respuesta null queda fuera de la tasa (y visible como
--     sin_registro, para que "no anotar" también se vea).
create view public.v_control_respuesta
with (security_invoker = true) as
select a.propietario_id as usuario_id,
       u.nombre as ejecutivo,
       u.equipo_id,
       count(*) as gestiones_30d,
       count(*) filter (where a.con_respuesta)          as con_respuesta,
       count(*) filter (where a.con_respuesta = false)  as sin_respuesta,
       count(*) filter (where a.con_respuesta is null)  as sin_registro,
       round(100.0 * count(*) filter (where a.con_respuesta)
             / nullif(count(*) filter (where a.con_respuesta is not null), 0))
         as tasa_pct
from actividades a
join usuarios u on u.id = a.propietario_id
where a.estado = 'completada'
  and a.tipo in ('llamada','reunion','visita_terreno','email','whatsapp')
  and a.completada_en >= now() - interval '30 days'
group by a.propietario_id, u.nombre, u.equipo_id;

grant select on
  v_control_cobertura, v_control_avance_decisor, v_control_embudo,
  v_control_huerfanas, v_control_criticas, v_control_respuesta
to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Sellar el score de lo ya cargado (en dev: los 422 proyectos iMercados).
--    Corre como owner (sin JWT) → la guardia lo permite.
-- ---------------------------------------------------------------------------
select public.recalcular_scores_mercado();
