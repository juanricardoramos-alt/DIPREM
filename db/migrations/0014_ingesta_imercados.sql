-- ============================================================================
-- DIPREM CRM — Migración 0014 (Neon): Fase 8b — modelo para la carga iMercados
-- Deltas sobre 0011 para soportar: EMPRESAS como spine de `cuentas`, proyectos
-- iMercados, rol_mercado derivable del giro, y etapa 'exploracion' (watchlist).
-- Aprobado 2026-08-04. NO carga datos: eso va por el pipeline (dry-run primero).
-- ============================================================================

-- 1. Nueva etapa 'exploracion' (fase geológica, previa a perfil). Va a watchlist,
--    fuera del pipeline activo. ADD VALUE no puede USARSE en la misma transacción;
--    aquí solo se agrega el valor (lo usa el pipeline al cargar).
alter type etapa_proyecto add value if not exists 'exploracion' before 'perfil';

-- 2. cuentas — enriquecimiento desde la base EMPRESAS (spine por nombre)
alter table cuentas
  add column giro   text,
  add column region text;
comment on column cuentas.giro is
  'Giro/actividad económica (base EMPRESAS iMercados) — insumo de rol_mercado';

-- 3. proyectos_mercado — campos de la fuente iMercados + watchlist
-- (region ya existe en proyectos_mercado desde 0005)
alter table proyectos_mercado
  add column id_externo         text,     -- ID iMercados: re-importar sin duplicar
  add column fuente_externa      text,     -- 'imercados'
  add column puesta_en_marcha    date,
  add column inicio_construccion date,     -- cuánto tiempo hay para entrar
  add column es_watchlist        boolean not null default false;

create index proyectos_mercado_idexterno_idx on proyectos_mercado (fuente_externa, id_externo);
create index proyectos_mercado_watchlist_idx on proyectos_mercado (es_watchlist) where es_watchlist;

comment on column proyectos_mercado.es_watchlist is
  'Descarte NO definitivo (exploración / rechazado en evaluación): fuera del pipeline activo, pero vigilado y reversible a activo';
comment on column proyectos_mercado.inicio_construccion is
  'Fecha de inicio de construcción: define la ventana de tiempo para entrar antes de que el mandante contrate a otro';

-- 4. reglas_rol_mercado — giro → rol_mercado, editables desde la UI
--    (mismo patrón que reglas_rol_contacto)
create table reglas_rol_mercado (
  id          uuid primary key default gen_random_uuid(),
  orden       smallint not null,      -- la primera regla que calza gana
  patron      text not null,          -- subcadena sobre el giro (sin tildes, minúsculas)
  rol_mercado text not null check (rol_mercado in ('mandante','epc','contratista','otro')),
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

alter table reglas_rol_mercado enable row level security;

create policy reglas_mercado_select on reglas_rol_mercado for select to authenticated
  using (public.usuario_actual() is not null);
create policy reglas_mercado_insert on reglas_rol_mercado for insert to authenticated
  with check (public.es_admin());
create policy reglas_mercado_update on reglas_rol_mercado for update to authenticated
  using (public.es_admin());
create policy reglas_mercado_delete on reglas_rol_mercado for delete to authenticated
  using (public.es_admin());

create trigger reglas_rol_mercado_auditoria
  after insert or update or delete on reglas_rol_mercado
  for each row execute function public.registrar_auditoria();

grant select on reglas_rol_mercado to authenticated;
grant insert, update, delete on reglas_rol_mercado to authenticated;

-- Clasificador por giro (primera regla que calza; sin match → 'otro').
-- La señal FUERTE —ser mandante de un proyecto— la aplica el pipeline y gana
-- sobre el giro (un dueño de proyecto es cliente aunque su giro diga otra cosa).
create function public.clasificar_rol_mercado(p_giro text)
returns text language sql stable as $$
  select coalesce(
    (select r.rol_mercado from reglas_rol_mercado r
      where r.activo
        and public.sin_tildes(lower(p_giro)) like '%' || public.sin_tildes(lower(r.patron)) || '%'
      order by r.orden, r.creado_en
      limit 1),
    'otro')
$$;
grant execute on function public.clasificar_rol_mercado(text) to authenticated;

-- Seed (afinable desde la UI). Proveedor/EPC primero (patrones más específicos).
insert into reglas_rol_mercado (orden, patron, rol_mercado) values
  (10, 'servicios de ingenieria',                'epc'),
  (11, 'ingenieria y actividades conexas',       'epc'),
  (12, 'consultoria',                            'contratista'),
  (13, 'construccion',                           'contratista'),
  (14, 'actividades de apoyo para la explotacion','contratista'),
  (15, 'servicios de apoyo',                     'contratista'),
  (16, 'venta al por mayor',                     'contratista'),
  (17, 'arriendo',                               'contratista'),
  (18, 'transporte',                             'contratista'),
  (19, 'montaje',                                'contratista'),
  (20, 'generacion de energia',                  'mandante'),
  (21, 'transmision',                            'mandante'),
  (22, 'distribucion de energia',                'mandante'),
  (23, 'mineria',                                'mandante'),
  (24, 'extraccion',                             'mandante'),
  (25, 'explotacion de mina',                    'mandante'),
  (26, 'petroleo',                               'mandante'),
  (27, 'gas natural',                            'mandante'),
  (28, 'captacion',                              'mandante'),   -- agua/sanitarias
  (29, 'sanitari',                               'mandante'),
  (30, 'infraestructura',                        'mandante'),
  (31, 'concesion',                              'mandante');
