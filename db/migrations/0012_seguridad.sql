-- ============================================================================
-- DIPREM CRM — Migración 0012 (Neon): F1 — Candado de seguridad
-- Port de la matriz RBAC aprobada (docs/PLAN-ARQUITECTURA.md §4.4) sobre la
-- identidad de Neon Auth, con endurecimiento adicional para la Data API:
--
--   1. Roles authenticated/anonymous (idempotente: la Data API los crea al
--      activarse; aquí se garantizan para poder validar sin ella).
--   2. Helpers de identidad SECURITY DEFINER (evitan recursión de RLS sobre
--      usuarios). usuario_actual() se redefine como DEFINER por lo mismo.
--   3. Revokes: NUNCA usar el toggle "Grant public schema access" de Neon.
--      Aquí todo es explícito: anonymous queda sin NADA; PUBLIC pierde
--      usage/create sobre public; las funciones pierden el EXECUTE default
--      (cierra las SECURITY DEFINER internas como notificar_reporte_semanal,
--      que si no cualquier autenticado podría disparar vía /rpc).
--   4. Grants mínimos por tabla/vista/función a authenticated.
--   5. Las 92 políticas RLS. Cambio deliberado vs. Supabase: los catálogos ya
--      NO son `using (true)` — TODO exige perfil en usuarios (allowlist).
--      Un registrado-de-internet con JWT válido no ve ni los catálogos.
--      La matriz fina por rol se prueba con la suite de F4.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Roles de la Data API (idempotente)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'anonymous') then
    create role anonymous nologin;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Identidad (SECURITY DEFINER: consultan usuarios sin re-disparar su RLS)
-- ---------------------------------------------------------------------------
create or replace function public.usuario_actual()
returns uuid language plpgsql stable
security definer set search_path = public as $$
begin
  return (select u.id from usuarios u
           where u.auth_id = auth.user_id() and u.activo);
exception when undefined_function or invalid_schema_name then
  return null;
end $$;

create function public.rol_actual()
returns rol_usuario language sql stable security definer set search_path = public as
$$ select rol from usuarios where id = public.usuario_actual() $$;

create function public.equipo_actual()
returns uuid language sql stable security definer set search_path = public as
$$ select equipo_id from usuarios where id = public.usuario_actual() $$;

create function public.equipo_de(u uuid)
returns uuid language sql stable security definer set search_path = public as
$$ select equipo_id from usuarios where id = u $$;

create function public.es_admin()
returns boolean language sql stable as
$$ select public.rol_actual() = 'admin' $$;

create function public.es_lectura()
returns boolean language sql stable as
$$ select public.rol_actual() = 'lectura' $$;

-- ¿El usuario actual es gerente del equipo al que pertenece `u`?
create function public.gerencia_a(u uuid)
returns boolean language sql stable as
$$
  select public.rol_actual() = 'gerente'
     and public.equipo_de(u) is not null
     and public.equipo_de(u) = public.equipo_actual()
$$;

-- ---------------------------------------------------------------------------
-- 3. Revocaciones (el punto de partida es CERO)
-- ---------------------------------------------------------------------------
revoke create, usage on schema public from public;
revoke all on all tables    in schema public from public, authenticated, anonymous;
revoke all on all sequences in schema public from public, authenticated, anonymous;
revoke all on all functions in schema public from public, authenticated, anonymous;

-- Las funciones futuras del owner tampoco nacen ejecutables por PUBLIC
alter default privileges in schema public revoke execute on functions from public;

-- El esquema de Neon Auth jamás es alcanzable desde la Data API
do $$
begin
  if exists (select from pg_namespace where nspname = 'neon_auth') then
    execute 'revoke all on all tables in schema neon_auth from authenticated, anonymous';
    execute 'revoke usage on schema neon_auth from authenticated, anonymous';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Grants mínimos (anonymous: NADA, deliberadamente)
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant usage on schema extensions to authenticated; -- unaccent para normalizar_*

-- Tablas: SELECT en las 24; escritura según la matriz. auditoria solo lectura
-- (escribe el trigger SECURITY DEFINER); importaciones sin DELETE (los lotes
-- de carga no se borran: trazabilidad Ley 21.719).
grant select on
  equipos, usuarios, dispositivos_push, pilares, lineas_servicio, servicios,
  cuentas, contactos, motivos_perdida, etapas_embudo, oportunidades, leads,
  actividades, notas, propuestas, propuesta_items, adjudicaciones, metas,
  notificaciones, definiciones_campo, auditoria, proyectos_mercado,
  importaciones, reglas_rol_contacto
to authenticated;

grant insert, update, delete on
  equipos, usuarios, dispositivos_push, pilares, lineas_servicio, servicios,
  cuentas, contactos, motivos_perdida, etapas_embudo, oportunidades, leads,
  actividades, notas, propuestas, propuesta_items, adjudicaciones, metas,
  notificaciones, definiciones_campo, proyectos_mercado, reglas_rol_contacto
to authenticated;

grant insert, update on importaciones to authenticated;

-- Vistas de análisis (security_invoker: heredan la RLS de las tablas base)
grant select on
  v_avance_metas, v_ranking_equipo, v_pipeline_detalle, v_gestion_contactos,
  v_distribucion_gestion, v_gestion_proyectos, v_historial_asignaciones,
  v_conversion_proyectos
to authenticated;

-- Funciones: solo las que las políticas, triggers de usuario y la app usan.
-- Quedan SIN execute para clientes: alertar_proyectos_vencidos y
-- notificar_reporte_semanal (solo owner/cron) y las funciones de trigger.
grant execute on function
  public.usuario_actual(), public.rol_actual(), public.equipo_actual(),
  public.equipo_de(uuid), public.es_admin(), public.es_lectura(),
  public.gerencia_a(uuid),
  public.sin_tildes(text), public.normalizar_rut(text),
  public.normalizar_empresa(text), public.en_ventana_caliente(etapa_proyecto),
  public.clasificar_rol_contacto(text),
  public.convertir_lead(uuid, text, text, numeric, moneda, smallint, uuid,
                        uuid, modalidad_contrato, vertical_cuenta),
  public.importar_proyectos_mercado(jsonb),
  public.asignar_proyectos_mercado(uuid[], uuid, prioridad_proyecto, date,
                                   text, smallint),
  public.recordar_proyecto(uuid),
  public.reclasificar_roles_contactos()
to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Políticas RLS
-- ---------------------------------------------------------------------------

-- Catálogos: SELECT solo con perfil (allowlist — cambia el `using (true)` de
-- Supabase); escritura solo admin.
do $$
declare
  t text;
begin
  foreach t in array array[
    'pilares','lineas_servicio','servicios','etapas_embudo',
    'motivos_perdida','definiciones_campo','equipos'
  ] loop
    execute format(
      'create policy %I on %I for select to authenticated
         using (public.usuario_actual() is not null)',
      t || '_select', t);
    execute format(
      'create policy %I on %I for insert to authenticated with check (public.es_admin())',
      t || '_insert', t);
    execute format(
      'create policy %I on %I for update to authenticated using (public.es_admin())',
      t || '_update', t);
    execute format(
      'create policy %I on %I for delete to authenticated using (public.es_admin())',
      t || '_delete', t);
  end loop;
end $$;

-- usuarios: perfil propio + compañeros de equipo; gerente administra su equipo
create policy usuarios_select on usuarios for select to authenticated using (
  id = public.usuario_actual()
  or public.es_admin()
  or public.es_lectura()
  or (public.equipo_de(id) is not null and public.equipo_de(id) = public.equipo_actual())
);
create policy usuarios_insert on usuarios for insert to authenticated
  with check (public.es_admin());
create policy usuarios_update on usuarios for update to authenticated using (
  id = public.usuario_actual() or public.es_admin() or public.gerencia_a(id)
);
create policy usuarios_delete on usuarios for delete to authenticated
  using (public.es_admin());

-- Registros comerciales con propietario directo:
-- cuentas, leads, oportunidades, actividades
do $$
declare
  t text;
begin
  foreach t in array array['cuentas','leads','oportunidades','actividades'] loop
    execute format($p$
      create policy %1$s_select on %1$I for select to authenticated using (
        propietario_id = public.usuario_actual()
        or public.es_admin()
        or public.es_lectura()
        or public.gerencia_a(propietario_id)
      )$p$, t);
    execute format($p$
      create policy %1$s_insert on %1$I for insert to authenticated with check (
        (propietario_id = public.usuario_actual() and not public.es_lectura())
        or public.es_admin()
        or public.gerencia_a(propietario_id)
      )$p$, t);
    execute format($p$
      create policy %1$s_update on %1$I for update to authenticated using (
        (propietario_id = public.usuario_actual() and not public.es_lectura())
        or public.es_admin()
        or public.gerencia_a(propietario_id)
      )$p$, t);
    execute format($p$
      create policy %1$s_delete on %1$I for delete to authenticated using (
        (propietario_id = public.usuario_actual() and not public.es_lectura())
        or public.es_admin()
        or public.gerencia_a(propietario_id)
      )$p$, t);
  end loop;
end $$;

-- contactos: visibilidad heredada de la cuenta (la RLS de cuentas filtra)
create policy contactos_select on contactos for select to authenticated using (
  exists (select 1 from cuentas c where c.id = cuenta_id)
);
create policy contactos_insert on contactos for insert to authenticated with check (
  not public.es_lectura()
  and exists (select 1 from cuentas c where c.id = cuenta_id)
);
create policy contactos_update on contactos for update to authenticated using (
  not public.es_lectura()
  and exists (select 1 from cuentas c where c.id = cuenta_id)
);
create policy contactos_delete on contactos for delete to authenticated using (
  not public.es_lectura()
  and exists (select 1 from cuentas c where c.id = cuenta_id)
);

-- propuestas / adjudicaciones: visibilidad heredada de la oportunidad
do $$
declare
  t text;
begin
  foreach t in array array['propuestas','adjudicaciones'] loop
    execute format($p$
      create policy %1$s_select on %1$I for select to authenticated using (
        exists (select 1 from oportunidades o where o.id = oportunidad_id)
      )$p$, t);
    execute format($p$
      create policy %1$s_insert on %1$I for insert to authenticated with check (
        not public.es_lectura()
        and exists (select 1 from oportunidades o where o.id = oportunidad_id)
      )$p$, t);
    execute format($p$
      create policy %1$s_update on %1$I for update to authenticated using (
        not public.es_lectura()
        and exists (select 1 from oportunidades o where o.id = oportunidad_id)
      )$p$, t);
    execute format($p$
      create policy %1$s_delete on %1$I for delete to authenticated using (
        not public.es_lectura()
        and exists (select 1 from oportunidades o where o.id = oportunidad_id)
      )$p$, t);
  end loop;
end $$;

-- propuesta_items: visibilidad heredada de la propuesta
create policy propuesta_items_select on propuesta_items for select to authenticated using (
  exists (select 1 from propuestas p where p.id = propuesta_id)
);
create policy propuesta_items_insert on propuesta_items for insert to authenticated with check (
  not public.es_lectura()
  and exists (select 1 from propuestas p where p.id = propuesta_id)
);
create policy propuesta_items_update on propuesta_items for update to authenticated using (
  not public.es_lectura()
  and exists (select 1 from propuestas p where p.id = propuesta_id)
);
create policy propuesta_items_delete on propuesta_items for delete to authenticated using (
  not public.es_lectura()
  and exists (select 1 from propuestas p where p.id = propuesta_id)
);

-- notas: visibilidad heredada de la entidad padre; escribe su autor
create policy notas_select on notas for select to authenticated using (
  case entidad
    when 'cuenta'      then exists (select 1 from cuentas x where x.id = entidad_id)
    when 'oportunidad' then exists (select 1 from oportunidades x where x.id = entidad_id)
    when 'contacto'    then exists (select 1 from contactos x where x.id = entidad_id)
    when 'lead'        then exists (select 1 from leads x where x.id = entidad_id)
    else false
  end
);
create policy notas_insert on notas for insert to authenticated with check (
  autor_id = public.usuario_actual()
  and not public.es_lectura()
  and case entidad
    when 'cuenta'      then exists (select 1 from cuentas x where x.id = entidad_id)
    when 'oportunidad' then exists (select 1 from oportunidades x where x.id = entidad_id)
    when 'contacto'    then exists (select 1 from contactos x where x.id = entidad_id)
    when 'lead'        then exists (select 1 from leads x where x.id = entidad_id)
    else false
  end
);
create policy notas_update on notas for update to authenticated using (
  autor_id = public.usuario_actual() or public.es_admin()
);
create policy notas_delete on notas for delete to authenticated using (
  autor_id = public.usuario_actual() or public.es_admin()
);

-- metas: el ejecutivo ve las suyas; gerente define las de su equipo
create policy metas_select on metas for select to authenticated using (
  usuario_id = public.usuario_actual()
  or public.es_admin()
  or public.es_lectura()
  or public.gerencia_a(usuario_id)
);
create policy metas_insert on metas for insert to authenticated with check (
  public.es_admin() or public.gerencia_a(usuario_id)
);
create policy metas_update on metas for update to authenticated using (
  public.es_admin() or public.gerencia_a(usuario_id)
);
create policy metas_delete on metas for delete to authenticated using (
  public.es_admin() or public.gerencia_a(usuario_id)
);

-- notificaciones y dispositivos_push: estrictamente propios
do $$
declare
  t text;
begin
  foreach t in array array['notificaciones','dispositivos_push'] loop
    execute format($p$
      create policy %1$s_select on %1$I for select to authenticated using (
        usuario_id = public.usuario_actual() or public.es_admin()
      )$p$, t);
    execute format($p$
      create policy %1$s_insert on %1$I for insert to authenticated with check (
        usuario_id = public.usuario_actual() or public.es_admin()
      )$p$, t);
    execute format($p$
      create policy %1$s_update on %1$I for update to authenticated using (
        usuario_id = public.usuario_actual() or public.es_admin()
      )$p$, t);
    execute format($p$
      create policy %1$s_delete on %1$I for delete to authenticated using (
        usuario_id = public.usuario_actual() or public.es_admin()
      )$p$, t);
  end loop;
end $$;

-- auditoria: solo lectura para admin y gerentes (su equipo); nadie escribe
-- directamente (escribe el trigger SECURITY DEFINER)
create policy auditoria_select on auditoria for select to authenticated using (
  public.es_admin()
  or (public.rol_actual() = 'gerente' and public.gerencia_a(usuario_id))
);

-- proyectos_mercado: solo admin y gerente (el ejecutivo recibe leads)
create policy proyectos_mercado_select on proyectos_mercado for select to authenticated
  using (public.es_admin() or public.rol_actual() = 'gerente');
create policy proyectos_mercado_insert on proyectos_mercado for insert to authenticated
  with check (public.es_admin() or public.rol_actual() = 'gerente');
create policy proyectos_mercado_update on proyectos_mercado for update to authenticated
  using (public.es_admin() or public.rol_actual() = 'gerente');
create policy proyectos_mercado_delete on proyectos_mercado for delete to authenticated
  using (public.es_admin() or public.rol_actual() = 'gerente');

-- importaciones: mismo perímetro; sin política de delete a propósito
-- (los lotes de carga no se borran: trazabilidad Ley 21.719)
create policy importaciones_select on importaciones for select to authenticated
  using (public.es_admin() or public.rol_actual() = 'gerente');
create policy importaciones_insert on importaciones for insert to authenticated
  with check (public.es_admin() or public.rol_actual() = 'gerente');
create policy importaciones_update on importaciones for update to authenticated
  using (public.es_admin() or public.rol_actual() = 'gerente');

-- reglas_rol_contacto: lectura con perfil; escritura solo admin
create policy reglas_rol_select on reglas_rol_contacto for select to authenticated
  using (public.usuario_actual() is not null);
create policy reglas_rol_insert on reglas_rol_contacto for insert to authenticated
  with check (public.es_admin());
create policy reglas_rol_update on reglas_rol_contacto for update to authenticated
  using (public.es_admin());
create policy reglas_rol_delete on reglas_rol_contacto for delete to authenticated
  using (public.es_admin());
