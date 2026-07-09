-- ============================================================================
-- DIPREM CRM — Migración 0002: RBAC con Row Level Security
-- Matriz de permisos: docs/PLAN-ARQUITECTURA.md §4.4
--   ejecutivo: CRUD de sus registros · gerente: CRUD de su equipo
--   admin: todo · lectura: SELECT global
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Funciones auxiliares (SECURITY DEFINER evita recursión de RLS sobre usuarios)
-- ---------------------------------------------------------------------------
create function public.rol_actual()
returns rol_usuario language sql stable security definer set search_path = public as
$$ select rol from usuarios where id = auth.uid() $$;

create function public.equipo_actual()
returns uuid language sql stable security definer set search_path = public as
$$ select equipo_id from usuarios where id = auth.uid() $$;

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
-- Habilitar RLS en TODAS las tablas (ninguna queda expuesta sin política)
-- ---------------------------------------------------------------------------
alter table equipos            enable row level security;
alter table usuarios           enable row level security;
alter table dispositivos_push  enable row level security;
alter table pilares            enable row level security;
alter table lineas_servicio    enable row level security;
alter table servicios          enable row level security;
alter table cuentas            enable row level security;
alter table contactos          enable row level security;
alter table motivos_perdida    enable row level security;
alter table etapas_embudo      enable row level security;
alter table oportunidades      enable row level security;
alter table leads              enable row level security;
alter table actividades        enable row level security;
alter table notas              enable row level security;
alter table propuestas         enable row level security;
alter table propuesta_items    enable row level security;
alter table adjudicaciones     enable row level security;
alter table metas              enable row level security;
alter table notificaciones     enable row level security;
alter table definiciones_campo enable row level security;
alter table auditoria          enable row level security;

-- ---------------------------------------------------------------------------
-- Catálogos: SELECT autenticado, escritura solo admin
-- (pilares, lineas_servicio, servicios, etapas_embudo, motivos_perdida,
--  definiciones_campo, equipos)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'pilares','lineas_servicio','servicios','etapas_embudo',
    'motivos_perdida','definiciones_campo','equipos'
  ] loop
    execute format(
      'create policy %I on %I for select to authenticated using (true)',
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

-- ---------------------------------------------------------------------------
-- usuarios: perfil propio + compañeros de equipo; gerente administra su equipo
-- ---------------------------------------------------------------------------
create policy usuarios_select on usuarios for select to authenticated using (
  id = auth.uid()
  or public.es_admin()
  or public.es_lectura()
  or (public.equipo_de(id) is not null and public.equipo_de(id) = public.equipo_actual())
);
create policy usuarios_insert on usuarios for insert to authenticated
  with check (public.es_admin());
create policy usuarios_update on usuarios for update to authenticated using (
  id = auth.uid() or public.es_admin() or public.gerencia_a(id)
);
create policy usuarios_delete on usuarios for delete to authenticated
  using (public.es_admin());

-- ---------------------------------------------------------------------------
-- Registros comerciales con propietario directo:
-- cuentas, leads, oportunidades, actividades
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['cuentas','leads','oportunidades','actividades'] loop
    execute format($p$
      create policy %1$s_select on %1$I for select to authenticated using (
        propietario_id = auth.uid()
        or public.es_admin()
        or public.es_lectura()
        or public.gerencia_a(propietario_id)
      )$p$, t);
    execute format($p$
      create policy %1$s_insert on %1$I for insert to authenticated with check (
        (propietario_id = auth.uid() and not public.es_lectura())
        or public.es_admin()
        or public.gerencia_a(propietario_id)
      )$p$, t);
    execute format($p$
      create policy %1$s_update on %1$I for update to authenticated using (
        (propietario_id = auth.uid() and not public.es_lectura())
        or public.es_admin()
        or public.gerencia_a(propietario_id)
      )$p$, t);
    execute format($p$
      create policy %1$s_delete on %1$I for delete to authenticated using (
        (propietario_id = auth.uid() and not public.es_lectura())
        or public.es_admin()
        or public.gerencia_a(propietario_id)
      )$p$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- contactos: visibilidad heredada de la cuenta (la RLS de cuentas filtra)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- propuestas / adjudicaciones: visibilidad heredada de la oportunidad
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- notas: visibilidad heredada de la entidad padre; escribe su autor
-- ---------------------------------------------------------------------------
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
  autor_id = auth.uid()
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
  autor_id = auth.uid() or public.es_admin()
);
create policy notas_delete on notas for delete to authenticated using (
  autor_id = auth.uid() or public.es_admin()
);

-- ---------------------------------------------------------------------------
-- metas: el ejecutivo ve las suyas; gerente define las de su equipo
-- ---------------------------------------------------------------------------
create policy metas_select on metas for select to authenticated using (
  usuario_id = auth.uid()
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

-- ---------------------------------------------------------------------------
-- notificaciones y dispositivos_push: estrictamente propios
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['notificaciones','dispositivos_push'] loop
    execute format($p$
      create policy %1$s_select on %1$I for select to authenticated using (
        usuario_id = auth.uid() or public.es_admin()
      )$p$, t);
    execute format($p$
      create policy %1$s_insert on %1$I for insert to authenticated with check (
        usuario_id = auth.uid() or public.es_admin()
      )$p$, t);
    execute format($p$
      create policy %1$s_update on %1$I for update to authenticated using (
        usuario_id = auth.uid() or public.es_admin()
      )$p$, t);
    execute format($p$
      create policy %1$s_delete on %1$I for delete to authenticated using (
        usuario_id = auth.uid() or public.es_admin()
      )$p$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- auditoria: solo lectura para admin y gerentes (su equipo); nadie escribe
-- directamente (escribe el trigger SECURITY DEFINER)
-- ---------------------------------------------------------------------------
create policy auditoria_select on auditoria for select to authenticated using (
  public.es_admin()
  or (public.rol_actual() = 'gerente' and public.gerencia_a(usuario_id))
);
