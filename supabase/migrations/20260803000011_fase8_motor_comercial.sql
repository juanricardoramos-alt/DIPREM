-- ============================================================================
-- DIPREM CRM — Migración 0011: Fase 8 — Motor comercial (solo esquema)
--   Aprobada 2026-08-03 (Bloque A punto 1) con ajustes del dueño:
--   · Etapas en_licitacion (mayor valor: venta de soporte en licitación) y
--     paralizado (judicialización / rechazo ambiental / decisión del titular).
--   · capex_musd fijado en la ingesta; conversión auditable en score_detalle.
--   · Contactos de la cartera van a `contactos` (inline solo fallback).
--   · Ley 21.719: base de licitud por fila (default interes_legitimo,
--     pendiente de confirmación legal) + registro de oposición (opt-out).
--   El scoring (Bloque B) y las vistas (Bloques C–E) van en migraciones aparte.
--   El pipeline de carga (no la BD) descarta correos personales
--   (gmail/hotmail/yahoo/outlook y similares) y solo ingresa datos laborales.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Normalización para deduplicar (RUT, nombre de empresa, email)
-- ---------------------------------------------------------------------------
create extension if not exists unaccent with schema extensions;

-- unaccent() es STABLE; el diccionario fijo permite este wrapper IMMUTABLE,
-- requisito para usarlo en columnas generadas.
create function public.sin_tildes(p_texto text)
returns text language sql immutable strict as
$$ select extensions.unaccent('extensions.unaccent'::regdictionary, p_texto) $$;

-- '76.123.456-k' → '76123456K'. El dígito verificador se valida en el
-- pipeline de carga; aquí solo se normaliza para comparar.
create function public.normalizar_rut(p_rut text)
returns text language sql immutable strict as
$$ select nullif(upper(regexp_replace(p_rut, '[^0-9kK]', '', 'g')), '') $$;

-- Apoyo de matching (nunca unicidad): minúsculas, sin tildes, sin puntuación
-- ni sufijos societarios. 'Minera Escondida Ltda.' → 'minera escondida'
create function public.normalizar_empresa(p_nombre text)
returns text language sql immutable strict as $$
  select nullif(trim(regexp_replace(
           regexp_replace(
             regexp_replace(lower(public.sin_tildes(p_nombre)),
                            '[^a-z0-9]+', ' ', 'g'),
             '\m(s ?a ?c|s ?p ?a|s ?a|e ?i ?r ?l|ltda|limitada|inc|corp|llc|sociedad anonima)\M',
             ' ', 'g'),
           '\s+', ' ', 'g')), '')
$$;

-- ---------------------------------------------------------------------------
-- 2. Enums nuevos
-- ---------------------------------------------------------------------------
create type etapa_proyecto as enum
  ('perfil','prefactibilidad','factibilidad','ingenieria_basica',
   'ingenieria_detalle','en_licitacion','construccion','comisionamiento',
   'operacion','paralizado','cerrado');

create type rol_decisor as enum
  ('gerente_proyecto','gerente_construccion','calidad_qaqc','hse',
   'contratos_abastecimiento','otro','sin_clasificar');

-- Ley 21.719 — base de licitud del tratamiento de datos personales
create type base_licitud as enum
  ('interes_legitimo','consentimiento','ejecucion_contrato',
   'obligacion_legal','fuente_publica');

create type cubeta_scoring as enum
  ('objetivo_pilar_1','objetivo_pilar_2','objetivo_pilar_3',
   'om_hse_recurrente','descarte');  -- null = sin evaluar

-- Ventana caliente aprobada por el dueño: única fuente de verdad para el
-- scoring (Bloque B) y el panel (Bloque E). operacion → om_hse_recurrente;
-- paralizado y cerrado → descarte automático con motivo.
create function public.en_ventana_caliente(p_etapa etapa_proyecto)
returns boolean language sql immutable as
$$ select p_etapa in ('ingenieria_detalle','en_licitacion',
                      'construccion','comisionamiento') $$;

-- ---------------------------------------------------------------------------
-- 3. Trazabilidad de cargas (Ley 21.719: origen, responsable, fecha, licitud)
-- ---------------------------------------------------------------------------
create table importaciones (
  id               uuid primary key default gen_random_uuid(),
  tipo             text not null check (tipo in ('contactos','cartera_proyectos')),
  archivo_nombre   text not null,      -- nombre del archivo, nunca su contenido
  origen_dato      text not null,      -- específico, no genérico: "Licitación X 08-2026"
  base_licitud     base_licitud not null,
  filas_total      int,
  filas_insertadas int,
  filas_duplicadas int,
  filas_invalidas  int,
  ejecutado_por    uuid not null references usuarios(id),
  ejecutado_en     timestamptz not null default now()
);

alter table importaciones enable row level security;

-- Mismo perímetro que proyectos_mercado: admin y gerente. Sin política de
-- delete a propósito: los lotes de importación no se borran (trazabilidad).
create policy importaciones_select on importaciones for select to authenticated
  using (public.es_admin() or public.rol_actual() = 'gerente');
create policy importaciones_insert on importaciones for insert to authenticated
  with check (public.es_admin() or public.rol_actual() = 'gerente');
create policy importaciones_update on importaciones for update to authenticated
  using (public.es_admin() or public.rol_actual() = 'gerente');

create trigger importaciones_auditoria
  after insert or update or delete on importaciones
  for each row execute function public.registrar_auditoria();

-- ---------------------------------------------------------------------------
-- 4. cuentas — dedup por RUT y matching por nombre normalizado
-- ---------------------------------------------------------------------------
alter table cuentas
  add column tax_id_normalizado text
    generated always as (public.normalizar_rut(tax_id)) stored,
  add column razon_social_normalizada text
    generated always as (public.normalizar_empresa(razon_social)) stored,
  add column rol_mercado text
    check (rol_mercado in ('mandante','epc','contratista','otro'));

-- RUT único por país (RUT chileno y CUIT argentino pueden colisionar en dígitos)
create unique index cuentas_rut_unico
  on cuentas ((coalesce(pais, '')), tax_id_normalizado)
  where tax_id_normalizado is not null;
create index cuentas_nombre_norm_idx on cuentas (razon_social_normalizada);

comment on column cuentas.rol_mercado is
  'Rol en el ecosistema de proyectos: mandante o EPC son el cliente DIPREM típico';

-- ---------------------------------------------------------------------------
-- 5. contactos — rol decisor, dedup por email y Ley 21.719 (incl. opt-out)
-- ---------------------------------------------------------------------------
alter table contactos
  add column email_normalizado text
    generated always as (nullif(lower(trim(email)), '')) stored,
  add column rol rol_decisor not null default 'sin_clasificar',
  add column rol_manual boolean not null default false,
  add column origen_dato text,
  add column base_licitud base_licitud,
  add column opt_out_en timestamptz,
  add column opt_out_detalle text,
  add column importacion_id uuid references importaciones(id),
  add column creado_por uuid references usuarios(id),
  add column actualizado_en timestamptz not null default now();

-- Default solo para filas nuevas: las históricas quedan en null (anteriores a
-- Fase 8) hasta que legal defina si se les asigna base retroactiva.
alter table contactos alter column base_licitud set default 'interes_legitimo';

create unique index contactos_email_unico
  on contactos (cuenta_id, email_normalizado)
  where email_normalizado is not null;
create index contactos_rol_idx on contactos (rol);

create trigger contactos_tocar before update on contactos
  for each row execute function public.tocar_actualizado_en();

comment on column contactos.rol_manual is
  'true = rol fijado a mano en la UI; el clasificador automático no lo pisa';
comment on column contactos.origen_dato is
  'Ley 21.719: origen específico del dato (archivo/licitación/fuente), nunca genérico';
comment on column contactos.base_licitud is
  'Ley 21.719: base de licitud por fila. Default interes_legitimo para cargas de prospección B2B (solo datos laborales), editable';
comment on column contactos.opt_out_en is
  'Ley 21.719: fecha de oposición al tratamiento. Si no es null, toda vista comercial DEBE excluir al contacto; el registro no se borra (prueba de cumplimiento)';

-- ---------------------------------------------------------------------------
-- 6. Reglas de clasificación de cargo → rol decisor (editables desde la UI)
-- ---------------------------------------------------------------------------
create table reglas_rol_contacto (
  id            uuid primary key default gen_random_uuid(),
  orden         smallint not null,          -- la primera regla que calza gana
  patron        text not null,              -- subcadena: cargo ILIKE '%patron%' (sin tildes ni mayúsculas; % y _ son comodines)
  rol           rol_decisor not null,
  peso_decision smallint not null default 0, -- ordena por poder de decisión en la vista de cuenta
  activo        boolean not null default true,
  creado_en     timestamptz not null default now()
);

alter table reglas_rol_contacto enable row level security;

create policy reglas_rol_select on reglas_rol_contacto for select to authenticated
  using (true);
create policy reglas_rol_insert on reglas_rol_contacto for insert to authenticated
  with check (public.es_admin());
create policy reglas_rol_update on reglas_rol_contacto for update to authenticated
  using (public.es_admin());
create policy reglas_rol_delete on reglas_rol_contacto for delete to authenticated
  using (public.es_admin());

create trigger reglas_rol_contacto_auditoria
  after insert or update or delete on reglas_rol_contacto
  for each row execute function public.registrar_auditoria();

-- Si ninguna regla calza → sin_clasificar. Nunca se inventa un rol.
create function public.clasificar_rol_contacto(p_cargo text)
returns rol_decisor language sql stable as $$
  select coalesce(
    (select r.rol
       from reglas_rol_contacto r
      where r.activo
        and public.sin_tildes(lower(p_cargo)) like
            '%' || public.sin_tildes(lower(r.patron)) || '%'
      order by r.orden, r.creado_en
      limit 1),
    'sin_clasificar'::rol_decisor)
$$;

create function public.aplicar_rol_contacto()
returns trigger language plpgsql as $$
begin
  if not new.rol_manual then
    new.rol := public.clasificar_rol_contacto(new.cargo);
  end if;
  return new;
end $$;

create trigger contactos_clasificar_rol
  before insert or update of cargo, rol_manual on contactos
  for each row execute function public.aplicar_rol_contacto();

-- Para la UI de administración: reclasificar todo tras editar las reglas.
-- SECURITY INVOKER: respeta la RLS de contactos de quien la ejecuta.
create function public.reclasificar_roles_contactos()
returns int language plpgsql security invoker as $$
declare
  v_actualizados int;
begin
  update contactos
     set rol = public.clasificar_rol_contacto(cargo)
   where not rol_manual
     and rol is distinct from public.clasificar_rol_contacto(cargo);
  get diagnostics v_actualizados = row_count;
  return v_actualizados;
end $$;

-- Set inicial (afinable desde la UI). Orden: reglas específicas primero.
insert into reglas_rol_contacto (orden, patron, rol, peso_decision) values
  (10, 'gerente de proyecto',            'gerente_proyecto',         100),
  (11, 'director de proyecto',           'gerente_proyecto',         100),
  (12, 'project manager',                'gerente_proyecto',         100),
  (13, 'jefe de proyecto',               'gerente_proyecto',          95),
  (20, 'gerente de construccion',        'gerente_construccion',      90),
  (21, 'construction manager',           'gerente_construccion',      90),
  (22, 'superintendente de construccion','gerente_construccion',      85),
  (23, 'jefe de terreno',                'gerente_construccion',      80),
  (30, 'contrato',                       'contratos_abastecimiento',  80),
  (31, 'abastecimiento',                 'contratos_abastecimiento',  80),
  (32, 'procurement',                    'contratos_abastecimiento',  80),
  (33, 'compras',                        'contratos_abastecimiento',  75),
  (40, 'calidad',                        'calidad_qaqc',              70),
  (41, 'qa/qc',                          'calidad_qaqc',              70),
  (42, 'qaqc',                           'calidad_qaqc',              70),
  (43, 'qc',                             'calidad_qaqc',              70),
  (44, 'quality',                        'calidad_qaqc',              70),
  (50, 'hse',                            'hse',                       70),
  (51, 'prevencion',                     'hse',                       70),
  (52, 'ssoma',                          'hse',                       70),
  (53, 'seguridad',                      'hse',                       65),
  (54, 'medio ambiente',                 'hse',                       65),
  (60, 'gerente general',                'otro',                      60);

-- ---------------------------------------------------------------------------
-- 7. proyectos_mercado — etapa, vínculo a cuenta, CAPEX y scoring
-- ---------------------------------------------------------------------------
alter table proyectos_mercado
  add column cuenta_id uuid references cuentas(id),
  add column empresa_rut text,
  add column empresa_rut_normalizado text
    generated always as (public.normalizar_rut(empresa_rut)) stored,
  add column etapa etapa_proyecto,
  add column etapa_cambiada_en timestamptz,
  add column capex_musd numeric(12,2),
  add column sector vertical_cuenta,
  add column subsector text,               -- energía: solar / eólica / BESS / térmica…
  add column contacto_id uuid references contactos(id),
  add column score smallint check (score between 0 and 100),
  add column score_detalle jsonb,
  add column cubeta cubeta_scoring,
  add column motivo_descarte text,
  add column score_calculado_en timestamptz,
  add column importacion_id uuid references importaciones(id),
  add column origen_dato text,
  add column base_licitud base_licitud;

alter table proyectos_mercado alter column base_licitud set default 'interes_legitimo';

create index proyectos_mercado_etapa_idx  on proyectos_mercado (etapa);
create index proyectos_mercado_cubeta_idx on proyectos_mercado (cubeta);
create index proyectos_mercado_cuenta_idx on proyectos_mercado (cuenta_id);

comment on column proyectos_mercado.capex_musd is
  'CAPEX en millones de USD, fijado en la ingesta. Monto original, moneda, tipo de cambio y fecha del tipo de cambio quedan en score_detalle (auditable)';
comment on column proyectos_mercado.score_detalle is
  'Desglose factor a factor del score (no caja negra) + auditoría de conversión del CAPEX';
comment on column proyectos_mercado.contacto_id is
  'Contacto formal deduplicado en `contactos`; contacto_nombre/telefono/email inline quedan solo como fallback sin cuenta identificable';

-- Sella cuándo cambió la etapa: de aquí sale "entró en ventana esta semana"
-- del panel del dueño. En un insert con etapa (proyecto recién importado ya
-- en ventana) también se sella: para DIPREM acaba de entrar al radar.
-- El historial completo antes/después ya queda en `auditoria`.
create function public.sellar_cambio_etapa()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.etapa is not null then
      new.etapa_cambiada_en := coalesce(new.etapa_cambiada_en, now());
    end if;
  elsif new.etapa is distinct from old.etapa then
    new.etapa_cambiada_en := now();
  end if;
  return new;
end $$;

create trigger proyectos_mercado_sellar_etapa
  before insert or update on proyectos_mercado
  for each row execute function public.sellar_cambio_etapa();

-- ---------------------------------------------------------------------------
-- 8. actividades — próximo paso con fecha (detección de huérfanas, Bloque D)
-- ---------------------------------------------------------------------------
alter table actividades
  add column proxima_accion_fecha date;

create index actividades_proxima_fecha_idx
  on actividades (proxima_accion_fecha)
  where proxima_accion_fecha is not null;

comment on column actividades.proxima_accion_fecha is
  'Fecha comprometida del próximo paso. Una oportunidad sin próximo paso vigente se marca huérfana en el panel del dueño';
