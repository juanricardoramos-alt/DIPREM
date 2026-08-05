-- ============================================================================
-- DIPREM CRM — Migración 0022 (Neon): permisos del rol 'revisor'
--
-- Estrategia de mínima cirugía: es_lectura() pasa a significar "rol de solo
-- consulta" (lectura O revisor). Con eso, TODOS los guardas de escritura
-- existentes (`not es_lectura()` en políticas, reclamar_cuenta,
-- liberar_cuenta, revelar_contactos/contacto, alta_lead) excluyen al revisor
-- gratis y sin tocar cada política. Luego se re-abre SOLO lo que el revisor
-- necesita de más respecto de lectura:
--   · filas de contactos (nombres/cargos — la PII sigue cerrada por columna
--     y su cupo de revelaciones es 0);
--   · proyectos_mercado + importaciones (el Radar);
--   · auditoría (el movimiento de embudo de Control).
-- ============================================================================

-- 1. es_lectura() = solo-consulta (lectura clásica + revisor)
create or replace function public.es_lectura()
returns boolean language sql stable as
$$ select public.rol_actual() in ('lectura', 'revisor') $$;

comment on function public.es_lectura() is
  'true para los roles de SOLO consulta (lectura y revisor): todos los guardas de escritura y de PII los excluyen';

create function public.es_revisor()
returns boolean language sql stable as
$$ select public.rol_actual() = 'revisor' $$;

grant execute on function public.es_revisor() to authenticated;

-- 2. contactos: lectura clásica sigue sin ver filas; el revisor SÍ las ve
--    (nombres y cargos — el detalle de cuenta y el avance-a-decisor las
--    necesitan). La PII sigue revocada por columna para todos.
drop policy contactos_select on contactos;
create policy contactos_select on contactos for select to authenticated using (
  public.rol_actual() <> 'lectura'
  and exists (select 1 from cuentas c where c.id = cuenta_id)
);

-- 3. Radar: el revisor ve proyectos e importaciones (solo SELECT; las
--    políticas de escritura no lo incluyen y no se tocan)
drop policy proyectos_mercado_select on proyectos_mercado;
create policy proyectos_mercado_select on proyectos_mercado for select to authenticated
  using (public.es_admin() or public.rol_actual() = 'gerente' or public.es_revisor());

drop policy importaciones_select on importaciones;
create policy importaciones_select on importaciones for select to authenticated
  using (public.es_admin() or public.rol_actual() = 'gerente' or public.es_revisor());

-- 4. Control: el movimiento de embudo sale de auditoría
drop policy auditoria_select on auditoria;
create policy auditoria_select on auditoria for select to authenticated using (
  public.es_admin()
  or (public.rol_actual() = 'gerente' and public.gerencia_a(usuario_id))
  or public.es_revisor()
);

-- 5. Cupos: el revisor jamás revela PII ni reclama cartera
insert into limites_rol (rol, max_cartera, max_revelaciones_dia)
values ('revisor', 0, 0);
