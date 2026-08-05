-- ============================================================================
-- DIPREM CRM — Migración 0015 (Neon): perímetro anti-extracción + puerta de leads
-- Aprobado 2026-08-05. Cierra el perímetro ANTES de la carga iMercados:
--
--   A. Pool "Cartera sin asignar": las cuentas cargadas nacen con propietario
--      = usuario de sistema → invisibles para el ejecutivo (su RLS solo alcanza
--      lo que gestiona). No hay catálogo que barrer, ni con el JWT crudo.
--   B. PII de contactos (telefono/email/email_normalizado/linkedin) revocada a
--      nivel de COLUMNA para la Data API. La única vía es revelar_contactos():
--      cuota diaria por rol + registro en lecturas_sensibles.
--   C. reclamar_cuenta(): estrangulador del pool — tope de cartera por rol,
--      reasignación auditada. liberar_cuenta() la devuelve (higiene del tope).
--   D. directorio_prospectos(): buscador del pool SIN PII (existencia, no dato),
--      con tope de filas por consulta. Proveedores ocultos por defecto.
--   E. limites_rol: topes editables por admin SIN migración.
--      Ejecutivo/gerente 80 cuentas · 25 revelaciones/día; lectura 0/0 (ve
--      agregados y nombres de empresa, jamás datos de contacto); admin sin tope.
--   F. alta_lead(): puerta de entrada de captación paralela — dedup contra
--      TODO (incluido el pool, vía DEFINER), base de licitud obligatoria
--      (Ley 21.719), trazabilidad de origen y enganche a proyecto.
--
-- Lo que este perímetro NO impide (decidido y documentado en
-- docs/DEUDA-TECNICA.md): retipear lo legítimamente visible, y el scraping
-- lento DENTRO del perímetro propio (se detecta vía v_revelaciones_diarias,
-- no se previene).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Usuario de sistema (dueño del pool)
-- ---------------------------------------------------------------------------
alter table usuarios add column es_sistema boolean not null default false;

-- a lo sumo un usuario de sistema
create unique index usuarios_sistema_unico on usuarios (es_sistema) where es_sistema;

comment on column usuarios.es_sistema is
  'Usuario sintético dueño del pool de cuentas sin asignar. No inicia sesión (auth_id null + inactivo); existe solo para que la RLS por propietario deje el pool fuera del perímetro de todos los roles no-admin.';

insert into usuarios (nombre, email, rol, activo, es_sistema)
values ('Cartera sin asignar', 'pool@sistema.diprem.local', 'lectura', false, true);

-- Id del pool. SECURITY DEFINER y SIN grant: solo la usan las funciones DEFINER.
create function public.usuario_pool()
returns uuid language sql stable security definer set search_path = public as
$$ select id from usuarios where es_sistema limit 1 $$;

-- ---------------------------------------------------------------------------
-- 2. limites_rol — topes editables desde la UI (admin), sin migración
-- ---------------------------------------------------------------------------
create table limites_rol (
  rol                  rol_usuario primary key,
  max_cartera          int,  -- cuentas no-inactivas por usuario; null = sin tope
  max_revelaciones_dia int,  -- contactos NUEVOS revelados por día (UTC); null = sin tope
  actualizado_en       timestamptz not null default now()
);

alter table limites_rol enable row level security;

create policy limites_select on limites_rol for select to authenticated
  using (public.usuario_actual() is not null);
create policy limites_update on limites_rol for update to authenticated
  using (public.es_admin());
-- sin insert/delete: una fila por rol del enum, nacen aquí

create trigger limites_rol_tocar before update on limites_rol
  for each row execute function public.tocar_actualizado_en();
create trigger limites_rol_auditoria
  after insert or update or delete on limites_rol
  for each row execute function public.registrar_auditoria();

grant select, update on limites_rol to authenticated;

-- Aprobado 2026-08-05: partir apretado y soltar es más fácil que al revés.
insert into limites_rol (rol, max_cartera, max_revelaciones_dia) values
  ('ejecutivo', 80, 25),
  ('gerente',   80, 25),
  ('lectura',    0,  0),   -- agregados, conteos y nombres de empresa; PII jamás
  ('admin',   null, null); -- sin tope (sus revelaciones igual quedan registradas)

-- ---------------------------------------------------------------------------
-- 3. lecturas_sensibles — registro de revelación de PII (una fila por la
--    PRIMERA revelación de cada contacto a cada usuario; re-verlo es libre:
--    re-ocultar lo ya entregado sería teatro, y así la cuota no castiga el
--    trabajo diario sobre la cartera propia)
-- ---------------------------------------------------------------------------
create table lecturas_sensibles (
  id          bigint generated always as identity primary key,
  usuario_id  uuid not null references usuarios(id),
  contacto_id uuid not null references contactos(id) on delete cascade,
  cuenta_id   uuid references cuentas(id) on delete set null,
  creado_en   timestamptz not null default now(),
  unique (usuario_id, contacto_id)
);

create index lecturas_usuario_dia_idx on lecturas_sensibles (usuario_id, creado_en desc);

alter table lecturas_sensibles enable row level security;

-- cada uno ve su propio historial; gerente el de su equipo; admin todo.
-- Nadie escribe directo: escribe revelar_contactos() (DEFINER).
create policy lecturas_select on lecturas_sensibles for select to authenticated using (
  usuario_id = public.usuario_actual()
  or public.es_admin()
  or public.gerencia_a(usuario_id)
);

grant select on lecturas_sensibles to authenticated;

-- Superficie de detección de comportamiento anómalo (invoker: hereda la RLS)
create view public.v_revelaciones_diarias
with (security_invoker = true) as
select ls.usuario_id,
       u.nombre          as usuario,
       u.equipo_id,
       ls.creado_en::date as dia,
       count(*)           as revelaciones
from lecturas_sensibles ls
join usuarios u on u.id = ls.usuario_id
group by ls.usuario_id, u.nombre, u.equipo_id, ls.creado_en::date;

grant select on v_revelaciones_diarias to authenticated;

-- ---------------------------------------------------------------------------
-- 4. cuentas — rol_mercado y razon_social_normalizada ya existen desde 0011;
--    aquí solo el índice para el filtro del directorio (proveedores ocultos)
-- ---------------------------------------------------------------------------
create index cuentas_rol_mercado_idx on cuentas (rol_mercado);

-- ---------------------------------------------------------------------------
-- 5. leads — trazabilidad de captación paralela y enganche a proyectos
-- ---------------------------------------------------------------------------
alter table leads
  add column creado_por          uuid references usuarios(id),
  add column base_licitud        base_licitud,
  add column origen_dato         text,
  add column proyecto_mercado_id uuid references proyectos_mercado(id);

comment on column leads.base_licitud is
  'Ley 21.719: obligatoria en el alta manual (la exige alta_lead); nullable solo por las filas previas a 0015';
comment on column leads.origen_dato is
  'Trazabilidad: de dónde salió el dato (feria, referido de X, licitación Y) — específico, no genérico';

create index leads_proyecto_idx     on leads (proyecto_mercado_id);
create index leads_empresa_norm_idx on leads (public.normalizar_empresa(empresa));

-- ---------------------------------------------------------------------------
-- 6. contactos — PII solo por revelación (privilegios por COLUMNA)
--    La Data API deja de entregar telefono/email/email_normalizado/linkedin
--    en cualquier SELECT, incluso al dueño de la cuenta: la única vía es
--    revelar_contactos(). Escribirlas sigue permitido (alta/edición), pero
--    Postgres exige SELECT para leerlas en WHERE/RETURNING → tampoco se
--    filtran por ahí.
-- ---------------------------------------------------------------------------
revoke select on contactos from authenticated;
grant select (id, cuenta_id, nombre, cargo, canal_preferido, es_principal,
              creado_en, mejor_horario, notas_privadas, rol, rol_manual,
              origen_dato, base_licitud, opt_out_en, opt_out_detalle,
              importacion_id, creado_por, actualizado_en)
  on contactos to authenticated;

-- Solo-lectura pierde también las FILAS de contactos (decisión 2026-08-05:
-- ve agregados y nombres de empresa, no personas). Sus conteos salen de
-- directorio_prospectos() y las vistas.
drop policy contactos_select on contactos;
create policy contactos_select on contactos for select to authenticated using (
  not public.es_lectura()
  and exists (select 1 from cuentas c where c.id = cuenta_id)
);

-- ---------------------------------------------------------------------------
-- 7. Contacto principal para "Mi Día" / gestión (v_gestion_contactos)
--    DEFINER con permiso explícito: el tel/correo del contacto principal de
--    una cuenta YA reclamada es el set de trabajo del dueño — el evento
--    auditado fue el RECLAMO y el volumen lo acota el tope de cartera.
--    Sin cuota aquí a propósito; lectura y no-dueños reciben vacío.
-- ---------------------------------------------------------------------------
create function public.datos_contacto_principal(p_cuenta_id uuid)
returns table (telefono text, email text)
language sql stable security definer set search_path = public as $$
  select
    (select ct.telefono from contactos ct
      where ct.cuenta_id = p_cuenta_id and ct.telefono is not null
        and ct.opt_out_en is null
      order by ct.es_principal desc, ct.creado_en limit 1),
    (select ct.email from contactos ct
      where ct.cuenta_id = p_cuenta_id and ct.email is not null
        and ct.opt_out_en is null
      order by ct.es_principal desc, ct.creado_en limit 1)
  where exists (select 1 from cuentas c
                 where c.id = p_cuenta_id
                   and not public.es_lectura()
                   and (c.propietario_id = public.usuario_actual()
                        or public.es_admin()
                        or public.gerencia_a(c.propietario_id)))
$$;

-- Redefinición de v_gestion_contactos: misma forma, pero la PII de contactos
-- sale del helper DEFINER (con la revocación por columna, los subselects
-- directos romperían la vista para todos los roles).
create or replace view public.v_gestion_contactos
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
  cp.telefono,
  cp.email,
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
left join lateral public.datos_contacto_principal(c.id) cp on true
where c.estado in ('prospecto','activa');

-- ---------------------------------------------------------------------------
-- 8. directorio_prospectos — buscar el pool sin filtrar PII
--    Buscar revela QUE la empresa existe (y si ya está asignada, con quién,
--    para no chocar), jamás el dato de contacto. Tope duro de 100 filas.
-- ---------------------------------------------------------------------------
create function public.directorio_prospectos(
  p_busqueda            text default null,
  p_rol_mercado         text default null,
  p_region              text default null,
  p_incluir_proveedores boolean default false,  -- epc/contratista ocultos por defecto
  p_limite              int default 50,
  p_desde               int default 0
) returns table (
  cuenta_id     uuid,
  razon_social  text,
  giro          text,
  region        text,
  pais          text,
  rol_mercado   text,
  n_contactos   bigint,   -- cuántos hay, no quiénes son
  esta_asignada boolean,
  ejecutivo     text      -- nombre del dueño si está asignada (coordinación)
) language sql stable security definer set search_path = public as $$
  select c.id, c.razon_social, c.giro, c.region, c.pais, c.rol_mercado,
         (select count(*) from contactos ct
           where ct.cuenta_id = c.id and ct.opt_out_en is null),
         (c.propietario_id <> public.usuario_pool()),
         case when c.propietario_id <> public.usuario_pool()
              then (select u.nombre from usuarios u where u.id = c.propietario_id)
         end
    from cuentas c
   where public.usuario_actual() is not null
     and (p_busqueda is null or length(trim(p_busqueda)) < 2
          or lower(public.sin_tildes(c.razon_social)) like
             '%' || lower(public.sin_tildes(trim(p_busqueda))) || '%')
     and (p_region is null or c.region = p_region)
     and case
           when p_rol_mercado is not null then c.rol_mercado = p_rol_mercado
           when p_incluir_proveedores     then true
           else coalesce(c.rol_mercado, 'otro') not in ('epc','contratista')
         end
   order by c.razon_social
   limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_desde, 0), 0)
$$;

-- ---------------------------------------------------------------------------
-- 9. reclamar_cuenta — la única puerta del pool a una cartera
-- ---------------------------------------------------------------------------
create function public.reclamar_cuenta(p_cuenta_id uuid, p_para uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_yo          uuid := public.usuario_actual();
  v_destino     uuid;
  v_rol_destino rol_usuario;
  v_pool        uuid := public.usuario_pool();
  v_dueno       uuid;
  v_limite      int;
  v_cartera     int;
begin
  if v_yo is null then
    raise exception 'Sesión sin perfil DIPREM';
  end if;
  if public.es_lectura() then
    raise exception 'El rol de solo lectura no gestiona cartera';
  end if;

  v_destino := coalesce(p_para, v_yo);
  if v_destino <> v_yo and not (public.es_admin() or public.gerencia_a(v_destino)) then
    raise exception 'Solo un admin o el gerente de su equipo puede asignar a otra persona';
  end if;

  select rol into v_rol_destino from usuarios
   where id = v_destino and activo and not es_sistema;
  if v_rol_destino is null or v_rol_destino = 'lectura' then
    raise exception 'El destinatario no puede recibir cartera';
  end if;

  -- serializa los reclamos por destinatario: el tope no se sobregira en paralelo
  perform pg_advisory_xact_lock(hashtext('cartera:' || v_destino::text));

  select propietario_id into v_dueno from cuentas where id = p_cuenta_id for update;
  if v_dueno is null then
    raise exception 'La cuenta no existe';
  end if;
  if v_dueno <> v_pool then
    raise exception 'La cuenta ya está asignada; la reasignación es tarea de gerencia';
  end if;

  select max_cartera into v_limite from limites_rol where rol = v_rol_destino;
  if v_limite is not null then
    select count(*) into v_cartera from cuentas
     where propietario_id = v_destino and estado <> 'inactiva';
    if v_cartera >= v_limite then
      raise exception 'Tope de cartera alcanzado (% de %): libera cuentas o pide al admin ajustar el límite',
        v_cartera, v_limite;
    end if;
  end if;

  update cuentas
     set propietario_id = v_destino,
         equipo_id      = public.equipo_de(v_destino)
   where id = p_cuenta_id;

  insert into auditoria (usuario_id, accion, entidad, entidad_id, cambios)
  values (v_yo, 'RECLAMO', 'cuentas', p_cuenta_id::text,
          jsonb_build_object('desde', 'pool', 'para', v_destino));

  return jsonb_build_object('cuenta_id', p_cuenta_id, 'propietario_id', v_destino);
end $$;

-- Devolver una cuenta al pool (higiene del tope de cartera)
create function public.liberar_cuenta(p_cuenta_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_yo    uuid := public.usuario_actual();
  v_pool  uuid := public.usuario_pool();
  v_dueno uuid;
begin
  if v_yo is null then
    raise exception 'Sesión sin perfil DIPREM';
  end if;
  if public.es_lectura() then
    raise exception 'El rol de solo lectura no gestiona cartera';
  end if;

  select propietario_id into v_dueno from cuentas where id = p_cuenta_id for update;
  if v_dueno is null then
    raise exception 'La cuenta no existe';
  end if;
  if v_dueno = v_pool then
    raise exception 'La cuenta ya está en el pool';
  end if;
  if not (v_dueno = v_yo or public.es_admin() or public.gerencia_a(v_dueno)) then
    raise exception 'Sin permiso sobre esta cuenta';
  end if;
  if exists (select 1 from oportunidades o
              where o.cuenta_id = p_cuenta_id and o.cerrada_en is null) then
    raise exception 'La cuenta tiene oportunidades abiertas: ciérralas o reasígnalas antes de devolverla';
  end if;

  update cuentas set propietario_id = v_pool, equipo_id = null
   where id = p_cuenta_id;

  insert into auditoria (usuario_id, accion, entidad, entidad_id, cambios)
  values (v_yo, 'LIBERACION', 'cuentas', p_cuenta_id::text,
          jsonb_build_object('desde', v_dueno, 'para', 'pool'));
end $$;

-- ---------------------------------------------------------------------------
-- 10. revelar_contactos — la ÚNICA vía a la PII de contactos
--     Cuota diaria por rol sobre contactos NUEVOS (día UTC — ver
--     docs/DEUDA-TECNICA.md DT-003); lo ya revelado a este usuario es libre.
--     Los contactos con opt-out jamás entregan PII (Ley 21.719).
-- ---------------------------------------------------------------------------
create function public.revelar_contactos(p_cuenta_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_yo        uuid := public.usuario_actual();
  v_dueno     uuid;
  v_limite    int;
  v_usadas    int;
  v_restantes int;
  v_nuevos    uuid[];
  v_revelar   uuid[];
  v_omitidos  int := 0;
begin
  if v_yo is null then
    raise exception 'Sesión sin perfil DIPREM';
  end if;
  if public.es_lectura() then
    raise exception 'El rol de solo lectura no accede a datos de contacto';
  end if;

  select propietario_id into v_dueno from cuentas where id = p_cuenta_id;
  if v_dueno is null then
    raise exception 'La cuenta no existe';
  end if;
  if not (v_dueno = v_yo or public.es_admin() or public.gerencia_a(v_dueno)) then
    raise exception 'La cuenta no está en tu cartera: reclámala primero';
  end if;

  -- serializa por usuario: la cuota no se sobregira con llamadas paralelas
  perform pg_advisory_xact_lock(hashtext('revelaciones:' || v_yo::text));

  select max_revelaciones_dia into v_limite
    from limites_rol where rol = public.rol_actual();

  -- contactos de la cuenta nunca revelados a este usuario (sin opt-out),
  -- priorizando principal y clasificados si la cuota no alcanza para todos
  select coalesce(array_agg(ct.id order by ct.es_principal desc,
                            (ct.rol <> 'sin_clasificar') desc, ct.creado_en),
                  '{}'::uuid[])
    into v_nuevos
    from contactos ct
   where ct.cuenta_id = p_cuenta_id
     and ct.opt_out_en is null
     and not exists (select 1 from lecturas_sensibles ls
                      where ls.usuario_id = v_yo and ls.contacto_id = ct.id);

  -- cuota del día: las filas solo nacen en la primera revelación,
  -- así que contar las de hoy = revelaciones nuevas de hoy
  select count(*) into v_usadas from lecturas_sensibles
   where usuario_id = v_yo and creado_en >= date_trunc('day', now());

  if v_limite is null then
    v_revelar := v_nuevos;
  else
    v_restantes := greatest(v_limite - v_usadas, 0);
    v_revelar   := v_nuevos[1:v_restantes];
    v_omitidos  := greatest(coalesce(array_length(v_nuevos, 1), 0)
                            - coalesce(array_length(v_revelar, 1), 0), 0);
  end if;

  insert into lecturas_sensibles (usuario_id, contacto_id, cuenta_id)
  select v_yo, u.id, p_cuenta_id from unnest(v_revelar) as u(id);

  return jsonb_build_object(
    'contactos', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id',              ct.id,
          'nombre',          ct.nombre,
          'cargo',           ct.cargo,
          'rol',             ct.rol,
          'es_principal',    ct.es_principal,
          'canal_preferido', ct.canal_preferido,
          'opt_out',         ct.opt_out_en is not null,
          'omitido',         ct.opt_out_en is null and not exists (
                               select 1 from lecturas_sensibles ls
                                where ls.usuario_id = v_yo and ls.contacto_id = ct.id),
          'telefono', case when ct.opt_out_en is null and exists (
                             select 1 from lecturas_sensibles ls
                              where ls.usuario_id = v_yo and ls.contacto_id = ct.id)
                           then ct.telefono end,
          'email',    case when ct.opt_out_en is null and exists (
                             select 1 from lecturas_sensibles ls
                              where ls.usuario_id = v_yo and ls.contacto_id = ct.id)
                           then ct.email end,
          'linkedin', case when ct.opt_out_en is null and exists (
                             select 1 from lecturas_sensibles ls
                              where ls.usuario_id = v_yo and ls.contacto_id = ct.id)
                           then ct.linkedin end
        ) order by ct.es_principal desc, ct.nombre)
        from contactos ct where ct.cuenta_id = p_cuenta_id), '[]'::jsonb),
    'omitidos_por_limite', v_omitidos,
    'usadas_hoy', v_usadas + coalesce(array_length(v_revelar, 1), 0),
    'limite_diario', v_limite);
end $$;

-- ---------------------------------------------------------------------------
-- 11. alta_lead — captación paralela sin duplicados
--     DEFINER a propósito: el dedup debe mirar TODO (incluido el pool, que la
--     RLS del que llama no ve) y devolver el match en vez de duplicar.
-- ---------------------------------------------------------------------------
create function public.alta_lead(
  p_nombre              text,
  p_empresa             text default null,
  p_telefono            text default null,
  p_email               text default null,
  p_fuente              fuente_lead default 'otro',
  p_calificacion        calificacion_lead default 'tibio',
  p_base_licitud        base_licitud default null,
  p_origen_dato         text default null,
  p_proyecto_mercado_id uuid default null,
  p_notas               text default null
) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_yo     uuid := public.usuario_actual();
  v_pool   uuid := public.usuario_pool();
  v_norm   text := public.normalizar_empresa(p_empresa);
  v_cuenta record;
  v_lead   record;
  v_id     uuid;
begin
  if v_yo is null then
    raise exception 'Sesión sin perfil DIPREM';
  end if;
  if public.es_lectura() then
    raise exception 'El rol de solo lectura no da de alta leads';
  end if;
  if nullif(trim(p_nombre), '') is null then
    raise exception 'El nombre de la persona es obligatorio';
  end if;
  if p_base_licitud is null then
    raise exception 'Ley 21.719: indica la base de licitud (referido/prospección B2B → interes_legitimo; la persona entregó su dato → consentimiento)';
  end if;

  -- 1. ¿La empresa ya existe como cuenta (asignada o en el pool)?
  if v_norm is not null then
    select c.id, c.razon_social, c.propietario_id, u.nombre as propietario_nombre
      into v_cuenta
      from cuentas c
      join usuarios u on u.id = c.propietario_id
     where c.razon_social_normalizada = v_norm  -- generada+indexada (0011)
     limit 1;
    if found then
      return jsonb_build_object(
        'resultado',    'empresa_existente',
        'cuenta_id',    v_cuenta.id,
        'razon_social', v_cuenta.razon_social,
        'en_pool',      v_cuenta.propietario_id = v_pool,
        'propietario',  case when v_cuenta.propietario_id = v_pool
                             then null else v_cuenta.propietario_nombre end);
    end if;
  end if;

  -- 2. ¿Ya hay un lead abierto igual? (mismo correo, o misma empresa+persona)
  select l.id, u.nombre as propietario_nombre
    into v_lead
    from leads l
    join usuarios u on u.id = l.propietario_id
   where l.estado in ('nuevo','en_gestion')
     and ((p_email is not null and lower(trim(l.email)) = lower(trim(p_email)))
          or (v_norm is not null
              and public.normalizar_empresa(l.empresa) = v_norm
              and lower(public.sin_tildes(trim(l.nombre)))
                  = lower(public.sin_tildes(trim(p_nombre)))))
   limit 1;
  if found then
    return jsonb_build_object(
      'resultado',   'lead_duplicado',
      'lead_id',     v_lead.id,
      'propietario', v_lead.propietario_nombre);
  end if;

  -- 3. Alta limpia, con trazabilidad completa
  insert into leads (nombre, empresa, telefono, email, fuente, calificacion,
                     propietario_id, creado_por, base_licitud, origen_dato,
                     proyecto_mercado_id, notas)
  values (trim(p_nombre), nullif(trim(p_empresa), ''),
          nullif(trim(p_telefono), ''), nullif(trim(p_email), ''),
          p_fuente, p_calificacion, v_yo, v_yo, p_base_licitud,
          nullif(trim(p_origen_dato), ''), p_proyecto_mercado_id, p_notas)
  returning id into v_id;

  return jsonb_build_object('resultado', 'creado', 'lead_id', v_id);
end $$;

-- ---------------------------------------------------------------------------
-- 12. Corrección de F1 + grants de las funciones nuevas
--     F1 (0012) revocó el EXECUTE default "in schema public" — pero en
--     Postgres los default privileges POR ESQUEMA solo pueden AGREGAR al
--     default global, nunca quitarle: la revocación no tuvo efecto y las
--     funciones creadas después de 0012 nacían ejecutables por PUBLIC
--     (lo detectó el validador con usuario_pool). Se corrige el default
--     GLOBAL del owner y se barre lo ya creado; los grants explícitos a
--     authenticated no se tocan (son entradas de ACL separadas).
-- ---------------------------------------------------------------------------
alter default privileges revoke execute on functions from public;
revoke execute on all functions in schema public from public, anonymous;

grant execute on function
  public.datos_contacto_principal(uuid),
  public.directorio_prospectos(text, text, text, boolean, int, int),
  public.reclamar_cuenta(uuid, uuid),
  public.liberar_cuenta(uuid),
  public.revelar_contactos(uuid),
  public.alta_lead(text, text, text, text, fuente_lead, calificacion_lead,
                   base_licitud, text, uuid, text)
to authenticated;
