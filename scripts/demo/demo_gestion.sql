-- ============================================================================
-- DIPREM CRM — DEMO: 6 ejecutivos ficticios + 3 semanas de gestión sembrada
--
-- ⚠️  SOLO para la rama Neon "demo" (creada desde dev, que ya tiene la carga
--     iMercados). NUNCA contra dev ni production: siembra datos ficticios.
--     Para refrescar la demo: borra la rama en la consola Neon y repítela.
--
-- Guion (aprobado 2026-08-05): los 6 trabajan sobre las cuentas del top de
-- score real (Codelco, Antamina, Collahuasi, Zaldívar, Anglo American…):
--   · Valentina Rojas  — la estrella: cobertura alta, respuestas altas,
--     2 decisores conseguidos vía derivación, 1 adjudicación HSE mensual.
--   · Matías Herrera   — el acaparador: 18 cuentas grandes reclamadas hace
--     ~3 semanas, 3 gestionadas. Zaldívar/Antamina sin tocar → rojo arriba.
--   · Sofía Paredes    — LA TRAMPA (anota mucho, vende poco): #1 en número
--     de actividades, tasa de respuesta ~15%, CERO decisores conseguidos,
--     cobertura mediocre, 2 huérfanas. El Control viejo la habría coronado.
--   · Diego Fuentes    — sólido: cobertura ~70%, 1 decisor, embudo movido.
--   · Camila Soto      — en desarrollo: cartera chica, derivación en curso.
--   · Rodrigo Vega     — bajo y no registra: cobertura ~25%, sin_registro.
--
-- Los ejecutivos no pueden iniciar sesión (auth_id null): la demo se mira
-- con el login del dueño (admin). Correos @demo.diprem.local = marcador.
-- ============================================================================

do $$ begin
  if exists (select 1 from usuarios where email like '%@demo.diprem.local') then
    raise exception 'La demo ya está sembrada en esta rama. Para refrescarla, borra la rama Neon y créala de nuevo desde dev.';
  end if;
  if (select count(*) from cuentas) < 1000 then
    raise exception 'Esta rama no tiene la carga iMercados: crea la rama demo DESDE dev.';
  end if;
end $$;

begin;

-- ---------------------------------------------------------------------------
-- 1. Equipos y ejecutivos (uuids fijos d0…; auth_id null = no inician sesión)
-- ---------------------------------------------------------------------------
insert into equipos (id, nombre, pais, moneda_default) values
  ('de000000-0000-4000-8000-000000000001', 'Equipo Norte',  'Chile', 'USD'),
  ('de000000-0000-4000-8000-000000000002', 'Equipo Centro', 'Chile', 'USD');

insert into usuarios (id, nombre, email, rol, equipo_id, activo) values
  ('d0000000-0000-4000-8000-000000000001', 'Valentina Rojas',
   'valentina@demo.diprem.local', 'ejecutivo', 'de000000-0000-4000-8000-000000000001', true),
  ('d0000000-0000-4000-8000-000000000002', 'Matías Herrera',
   'matias@demo.diprem.local', 'ejecutivo', 'de000000-0000-4000-8000-000000000001', true),
  ('d0000000-0000-4000-8000-000000000003', 'Sofía Paredes',
   'sofia@demo.diprem.local', 'ejecutivo', 'de000000-0000-4000-8000-000000000001', true),
  ('d0000000-0000-4000-8000-000000000004', 'Diego Fuentes',
   'diego@demo.diprem.local', 'ejecutivo', 'de000000-0000-4000-8000-000000000002', true),
  ('d0000000-0000-4000-8000-000000000005', 'Camila Soto',
   'camila@demo.diprem.local', 'ejecutivo', 'de000000-0000-4000-8000-000000000002', true),
  ('d0000000-0000-4000-8000-000000000006', 'Rodrigo Vega',
   'rodrigo@demo.diprem.local', 'ejecutivo', 'de000000-0000-4000-8000-000000000002', true);

-- ---------------------------------------------------------------------------
-- 2. Carteras: reclamos con fecha realista.
--    Se desactivan cuentas_tocar (para poder backdatear actualizado_en, que
--    es la base de "días sin gestión" cuando no hay gestión) y la auditoría
--    de cuentas (ruido de siembra). Solo en esta rama demo.
-- ---------------------------------------------------------------------------
alter table cuentas disable trigger cuentas_tocar;
alter table cuentas disable trigger cuentas_auditoria;

create function pg_temp.demo_reclamar(p_exec uuid, p_equipo uuid, p_patron text,
                                      p_hace_dias int)
returns void language plpgsql as $$
begin
  update cuentas
     set propietario_id = p_exec, equipo_id = p_equipo,
         actualizado_en = now() - (p_hace_dias || ' days')::interval
   where id = (select c.id from cuentas c
                join usuarios u on u.id = c.propietario_id and u.es_sistema
               where c.razon_social ilike p_patron
               order by c.razon_social limit 1);
end $$;

create function pg_temp.demo_reclamar_relleno(p_exec uuid, p_equipo uuid,
                                              p_n int, p_hace_dias int)
returns void language plpgsql as $$
begin
  update cuentas
     set propietario_id = p_exec, equipo_id = p_equipo,
         actualizado_en = now() - (p_hace_dias || ' days')::interval
   where id in (select c.id from cuentas c
                 join usuarios u on u.id = c.propietario_id and u.es_sistema
                where c.rol_mercado = 'mandante'
                order by c.razon_social limit p_n);
end $$;

-- Valentina: Codelco, Collahuasi, Vicuña (Josemaría), Las Cenizas + 6 → 10
select pg_temp.demo_reclamar('d0000000-0000-4000-8000-000000000001',
  'de000000-0000-4000-8000-000000000001', 'CORP NACIONAL DEL COBRE%', 20);
select pg_temp.demo_reclamar('d0000000-0000-4000-8000-000000000001',
  'de000000-0000-4000-8000-000000000001', '%COLLAHUASI SCM%', 18);
select pg_temp.demo_reclamar('d0000000-0000-4000-8000-000000000001',
  'de000000-0000-4000-8000-000000000001', 'VICU%CORP%', 15);
select pg_temp.demo_reclamar('d0000000-0000-4000-8000-000000000001',
  'de000000-0000-4000-8000-000000000001', 'MINERA LAS CENIZAS%', 14);
select pg_temp.demo_reclamar_relleno('d0000000-0000-4000-8000-000000000001',
  'de000000-0000-4000-8000-000000000001', 6, 16);

-- Matías (acaparador): Zaldívar, Antamina, Yanacocha + 15 → 18, hace ~3 semanas
select pg_temp.demo_reclamar('d0000000-0000-4000-8000-000000000002',
  'de000000-0000-4000-8000-000000000001', 'COMPANIA MINERA ZALDIVAR%', 24);
select pg_temp.demo_reclamar('d0000000-0000-4000-8000-000000000002',
  'de000000-0000-4000-8000-000000000001', '%ANTAMINA%', 23);
select pg_temp.demo_reclamar('d0000000-0000-4000-8000-000000000002',
  'de000000-0000-4000-8000-000000000001', 'MINERA YANACOCHA%', 22);
select pg_temp.demo_reclamar_relleno('d0000000-0000-4000-8000-000000000002',
  'de000000-0000-4000-8000-000000000001', 15, 21);

-- Sofía (la trampa): Anglo American Sur (Los Bronces), McEwen + 10 → 12
select pg_temp.demo_reclamar('d0000000-0000-4000-8000-000000000003',
  'de000000-0000-4000-8000-000000000001', 'ANGLO AMERICAN SUR%', 19);
select pg_temp.demo_reclamar('d0000000-0000-4000-8000-000000000003',
  'de000000-0000-4000-8000-000000000001', 'MCEWEN%', 17);
select pg_temp.demo_reclamar_relleno('d0000000-0000-4000-8000-000000000003',
  'de000000-0000-4000-8000-000000000001', 10, 18);

-- Diego: 9 · Camila: 5 · Rodrigo: 8
select pg_temp.demo_reclamar_relleno('d0000000-0000-4000-8000-000000000004',
  'de000000-0000-4000-8000-000000000002', 9, 15);
select pg_temp.demo_reclamar_relleno('d0000000-0000-4000-8000-000000000005',
  'de000000-0000-4000-8000-000000000002', 5, 10);
select pg_temp.demo_reclamar_relleno('d0000000-0000-4000-8000-000000000006',
  'de000000-0000-4000-8000-000000000002', 8, 19);

alter table cuentas enable trigger cuentas_tocar;
alter table cuentas enable trigger cuentas_auditoria;

-- ---------------------------------------------------------------------------
-- 3. Gestión sembrada por canales (~3 semanas, determinista).
--    p_pct_respuesta: % con respuesta=true; p_pct_registro: % con el dato
--    registrado (el resto queda null = "no anotó si respondieron").
-- ---------------------------------------------------------------------------
create function pg_temp.demo_gestion(p_exec uuid, p_n int, p_cuentas int,
                                     p_pct_respuesta int, p_pct_registro int,
                                     p_excluir text[] default '{}')
returns void language plpgsql as $$
declare
  v_cuentas uuid[];
  v_tipos tipo_actividad[] := array['llamada','whatsapp','email','reunion',
                                    'visita_terreno','llamada','email','whatsapp']::tipo_actividad[];
  v_asuntos text[] := array[
    'Llamada de presentación de DIPREM',
    'Seguimiento por WhatsApp: disponibilidad de inspectores',
    'Correo con envío de brochure QA/QC y credenciales',
    'Reunión de levantamiento de necesidades',
    'Visita a faena: recorrido de obra y contactos en terreno',
    'Llamada de seguimiento a propuesta',
    'Correo con envío de propuesta técnico-económica',
    'Coordinación por WhatsApp de reunión con gerencia'];
  v_resultados text[] := array[
    'Conversación con encargado: interés en QA/QC de montaje',
    'Respondió: pide detalle de HH y tarifas',
    'Sin respuesta aún',
    'Levantamiento completo; piden propuesta para revisión interna',
    'Se obtuvo contacto del jefe de terreno',
    'Piden llamar la próxima semana',
    'Acusó recibo; lo revisa el área técnica',
    'Reunión agendada'];
  i int; v_tipo tipo_actividad; v_resp boolean; v_cuando timestamptz;
begin
  -- desc prioriza los nombres grandes de la cartera; p_excluir deja fuera de
  -- la gestión las cuentas insignia que la historia exige ABANDONADAS
  -- (Zaldívar/Antamina del acaparador; Los Bronces/Los Azules de la trampa)
  select array_agg(id) into v_cuentas from (
    select c.id from cuentas c where c.propietario_id = p_exec
      and not exists (select 1 from unnest(p_excluir) pat
                       where c.razon_social ilike pat)
    order by c.razon_social desc limit p_cuentas) s;
  if v_cuentas is null then return; end if;

  for i in 1..p_n loop
    v_tipo := v_tipos[1 + (i % 8)];
    -- determinista: reparte en 21 días; las primeras 3 caen HOY (reporte diario)
    v_cuando := case when i <= 3
      then date_trunc('day', now()) + ((8 + i * 2) || ' hours')::interval
      else now() - (((i * 37) % 480) || ' hours')::interval - interval '6 hours'
    end;
    if v_cuando > now() then v_cuando := now() - (i || ' minutes')::interval; end if;
    v_resp := case
      when (i * 13) % 100 >= p_pct_registro then null       -- no registró
      when (i * 29) % 100 < p_pct_respuesta then true
      else false end;
    insert into actividades (tipo, asunto, cuenta_id, propietario_id, estado,
                             resultado, con_respuesta, notas, proxima_accion,
                             completada_en, creado_en)
    values (v_tipo, v_asuntos[1 + (i % 8)],
            v_cuentas[1 + (i % array_length(v_cuentas, 1))], p_exec,
            'completada',
            case when v_resp then v_resultados[1 + (i % 8)]
                 when v_resp is null then null else 'Sin respuesta aún' end,
            v_resp, null,
            case when v_resp then 'Agendar siguiente paso' else 'Reintentar en 3 días' end,
            v_cuando, v_cuando);
  end loop;
end $$;

-- Valentina: 28 gestiones en 8 de sus 10 cuentas · 68% respuesta · 95% registro
select pg_temp.demo_gestion('d0000000-0000-4000-8000-000000000001', 28, 8, 68, 95);
-- Matías: 6 gestiones en 3 de 18 · 50% · 80% — Zaldívar/Antamina/Yanacocha
-- quedan SIN tocar (la esencia del acaparador)
select pg_temp.demo_gestion('d0000000-0000-4000-8000-000000000002', 6, 3, 50, 80,
  array['COMPANIA MINERA ZALDIVAR%','%ANTAMINA%','MINERA YANACOCHA%']);
-- Sofía (LA TRAMPA): 56 gestiones en solo 5 de 12 · 15% respuesta · 90% registro
-- — Los Bronces y Los Azules abandonados pese al volumen de anotaciones
select pg_temp.demo_gestion('d0000000-0000-4000-8000-000000000003', 56, 5, 15, 90,
  array['ANGLO AMERICAN SUR%','MCEWEN%']);
-- Diego: 20 en 7 de 9 · 60% · 90%
select pg_temp.demo_gestion('d0000000-0000-4000-8000-000000000004', 20, 7, 60, 90);
-- Camila: 10 en 3 de 5 · 50% · 85%
select pg_temp.demo_gestion('d0000000-0000-4000-8000-000000000005', 10, 3, 50, 85);
-- Rodrigo: 7 en 2 de 8 · (25% de lo poco que registra) · 30% registro
select pg_temp.demo_gestion('d0000000-0000-4000-8000-000000000006', 7, 2, 25, 30);

-- ---------------------------------------------------------------------------
-- 4. Decisores CONSEGUIDOS (avance real): contactos ficticios creados por el
--    ejecutivo en cuentas que NO tenían decisor técnico. creado_por lo
--    respeta el trigger (siembra como owner). Sofía: cero, a propósito.
-- ---------------------------------------------------------------------------
create function pg_temp.demo_decisor(p_exec uuid, p_cuenta uuid, p_nombre text,
                                     p_cargo text, p_hace_dias int)
returns void language plpgsql as $$
begin
  if p_cuenta is null then return; end if;
  insert into contactos (cuenta_id, nombre, cargo, telefono, email,
                         creado_por, creado_en, origen_dato, base_licitud)
  values (p_cuenta, p_nombre, p_cargo, '+56 9 5555 0101',
          lower(replace(p_nombre, ' ', '.')) || '@demo.diprem.local',
          p_exec, now() - (p_hace_dias || ' days')::interval,
          'Derivación conseguida por gestión (demo)', 'interes_legitimo');
end $$;

-- Valentina: Vicuña Corp (Josemaría) y una segunda cuenta suya sin decisor
select pg_temp.demo_decisor('d0000000-0000-4000-8000-000000000001',
  (select id from cuentas where razon_social ilike 'VICU%CORP%'
     and propietario_id = 'd0000000-0000-4000-8000-000000000001' limit 1),
  'Andrés Soto Miranda', 'Gerente de Proyecto', 12);
select pg_temp.demo_decisor('d0000000-0000-4000-8000-000000000001',
  (select c.id from cuentas c
    where c.propietario_id = 'd0000000-0000-4000-8000-000000000001'
      and not exists (select 1 from contactos ct where ct.cuenta_id = c.id
                        and public.bucket_rol(ct.rol) = 'decisor_tecnico')
    order by c.razon_social limit 1),
  'Paula Reyes Fuentealba', 'Superintendente de Construcción', 4);

-- Diego: 1 decisor en una cuenta suya sin decisor
select pg_temp.demo_decisor('d0000000-0000-4000-8000-000000000004',
  (select c.id from cuentas c
    where c.propietario_id = 'd0000000-0000-4000-8000-000000000004'
      and not exists (select 1 from contactos ct where ct.cuenta_id = c.id
                        and public.bucket_rol(ct.rol) = 'decisor_tecnico')
    order by c.razon_social limit 1),
  'Cristóbal Núñez Alarcón', 'Gerente de Operaciones', 6);

-- ---------------------------------------------------------------------------
-- 5. Oportunidades: abiertas con próximo paso (sanas), huérfanas (abandono),
--    y la adjudicación de Valentina. Los cambios de etapa quedan en auditoría
--    → alimentan "movimiento de embudo".
-- ---------------------------------------------------------------------------
create function pg_temp.demo_oportunidad(p_exec uuid, p_cuenta_patron text,
  p_nombre text, p_monto numeric, p_etapa_inicial text, p_etapa_final text,
  p_con_proximo boolean)
returns uuid language plpgsql as $$
declare
  v_cuenta uuid; v_id uuid;
begin
  select id into v_cuenta from cuentas
   where propietario_id = p_exec and razon_social ilike p_cuenta_patron
   order by razon_social limit 1;
  if v_cuenta is null then
    select id into v_cuenta from cuentas where propietario_id = p_exec
     order by razon_social limit 1;
  end if;
  if v_cuenta is null then return null; end if;

  insert into oportunidades (nombre, cuenta_id, propietario_id, etapa_id,
                             pilar_id, modalidad_contrato, monto, moneda,
                             creado_en)
  values (p_nombre, v_cuenta, p_exec,
          (select id from etapas_embudo where nombre = p_etapa_inicial),
          1, 'proyecto', p_monto, 'USD', now() - interval '18 days')
  returning id into v_id;

  -- avance de etapa (queda auditado → v_control_embudo)
  if p_etapa_final is not null and p_etapa_final <> p_etapa_inicial then
    update oportunidades
       set etapa_id = (select id from etapas_embudo where nombre = p_etapa_final)
     where id = v_id;
  end if;

  if p_con_proximo then
    insert into actividades (tipo, asunto, cuenta_id, oportunidad_id,
                             propietario_id, estado, fecha_programada)
    values ('reunion', 'Presentar propuesta y resolver dudas técnicas',
            v_cuenta, v_id, p_exec, 'pendiente', now() + interval '3 days');
  end if;
  return v_id;
end $$;

-- Valentina: 2 abiertas sanas (con avance de etapa hoy) + 1 adjudicada
select pg_temp.demo_oportunidad('d0000000-0000-4000-8000-000000000001',
  'CORP NACIONAL DEL COBRE%', 'Inspección QA/QC — Nuevo Nivel Mina',
  180000, 'Contactado', 'Reunión / Levantamiento', true);
select pg_temp.demo_oportunidad('d0000000-0000-4000-8000-000000000001',
  '%COLLAHUASI%', 'Control documental de contratistas — Collahuasi',
  95000, 'Reunión / Levantamiento', 'Propuesta enviada', true);

do $$
declare v_id uuid;
begin
  v_id := pg_temp.demo_oportunidad('d0000000-0000-4000-8000-000000000001',
    'MINERA LAS CENIZAS%', 'Asesoría HSE mensual — Planta Cabildo',
    60000, 'Negociación', 'Adjudicado', false);
  if v_id is not null then
    update oportunidades
       set cerrada_en = now() - interval '5 days',
           modalidad_contrato = 'mensual_recurrente', pilar_id = 2
     where id = v_id;
    insert into adjudicaciones (oportunidad_id, modalidad, fecha_inicio,
                                estado, monto, moneda)
    values (v_id, 'mensual_recurrente', current_date - 5, 'vigente',
            60000, 'USD');
  end if;
end $$;

-- Diego: 1 sana con avance hoy
select pg_temp.demo_oportunidad('d0000000-0000-4000-8000-000000000004',
  '%', 'Outsourcing de inspectores de soldadura', 120000,
  'Contactado', 'Reunión / Levantamiento', true);

-- Camila: 1 sana sin avance aún
select pg_temp.demo_oportunidad('d0000000-0000-4000-8000-000000000005',
  '%', 'Programa de seguridad para obra civil', 45000,
  'Contactado', null, true);

-- HUÉRFANAS (sin próximo paso con fecha): Sofía 2, Rodrigo 1, Matías 1
select pg_temp.demo_oportunidad('d0000000-0000-4000-8000-000000000003',
  'ANGLO AMERICAN SUR%', 'Servicio QA/QC — Los Bronces', 250000,
  'Contactado', null, false);
select pg_temp.demo_oportunidad('d0000000-0000-4000-8000-000000000003',
  'MCEWEN%', 'Inspección de fabricación — Los Azules', 140000,
  'Contactado', null, false);
select pg_temp.demo_oportunidad('d0000000-0000-4000-8000-000000000006',
  '%', 'Capacitaciones SSO faena', 30000, 'Prospecto', null, false);
select pg_temp.demo_oportunidad('d0000000-0000-4000-8000-000000000002',
  'COMPANIA MINERA ZALDIVAR%', 'Supervisión de montaje — Zaldívar', 320000,
  'Prospecto', null, false);

-- ---------------------------------------------------------------------------
-- 6. Metas del mes (semáforo de cumplimiento): la estrella avanza, la trampa
--    tiene todo anotado y nada adjudicado.
-- ---------------------------------------------------------------------------
insert into metas (usuario_id, periodo, tipo, objetivo, moneda)
select u.id, to_char(now(), 'YYYY-MM'), 'monto_adjudicado', 100000, 'USD'
  from usuarios u where u.email like '%@demo.diprem.local';
insert into metas (usuario_id, periodo, tipo, objetivo)
select u.id, to_char(now(), 'YYYY-MM'), 'oportunidades_nuevas', 3
  from usuarios u where u.email like '%@demo.diprem.local';

commit;

-- ---------------------------------------------------------------------------
-- 7. El score refleja la nueva contactabilidad e historial
-- ---------------------------------------------------------------------------
select public.recalcular_scores_mercado();

-- Resumen de control (los números que el dueño verá)
select 'ejecutivos demo' as control, count(*)::text as valor
  from usuarios where email like '%@demo.diprem.local'
union all
select 'cuentas reclamadas por la demo', count(*)::text
  from cuentas c join usuarios u on u.id = c.propietario_id
 where u.email like '%@demo.diprem.local'
union all
select 'gestiones sembradas', count(*)::text
  from actividades a join usuarios u on u.id = a.propietario_id
 where u.email like '%@demo.diprem.local'
union all
select 'decisores conseguidos', count(*)::text from v_control_avance_decisor
union all
select 'huérfanas', count(*)::text from v_control_huerfanas
union all
select 'acaparadas (≥14 días sin gestión)', count(*)::text
  from v_control_criticas where dias_sin_gestion >= 14
order by 1;
