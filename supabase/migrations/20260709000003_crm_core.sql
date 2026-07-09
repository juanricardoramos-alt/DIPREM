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
