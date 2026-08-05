-- ============================================================================
-- DIPREM CRM — Migración 0017 (Neon): reglas de cargo por bucket + contexto
-- Aprobado 2026-08-05 (dry-run 67% de cobertura con muestra verificada):
--
--   1. Clasificación CONTEXTUAL: la familia comercial-ventas es puerta de
--      entrada SOLO en cuentas mandante/otro. En un proveedor (epc/contratista)
--      "gerente comercial" es quien vende, no quien compra → sin_clasificar,
--      terminal (no cae a las reglas genéricas de gerencia).
--   2. Ingeniero (civil) de/en minas → decisor_tecnico (equipo de proyecto u
--      operaciones en minería). Geólogo queda sin_clasificar (exploración).
--   3. Set completo de reglas reemplaza a las 23 de 0011 (editables en la UI).
--   4. bucket_rol(): rol fino → bucket agrupador para pantallas y KPIs.
--   5. Índice ÚNICO (fuente_externa, id_externo) → re-importar sin duplicar.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Contexto de mercado en las reglas
-- ---------------------------------------------------------------------------
alter table reglas_rol_contacto
  add column solo_mandante boolean not null default false;

comment on column reglas_rol_contacto.solo_mandante is
  'true = la regla clasifica solo si la cuenta NO es proveedor (epc/contratista); si lo es, el resultado es sin_clasificar TERMINAL (no sigue evaluando reglas)';

-- Clasificador con contexto. El calce es terminal: la primera regla que calza
-- decide, y si es solo_mandante en una cuenta proveedora, decide sin_clasificar.
create function public.clasificar_rol_contacto(p_cargo text, p_rol_mercado text)
returns rol_decisor language sql stable as $$
  select coalesce(
    (select case
              when r.solo_mandante
                   and coalesce(p_rol_mercado, '') in ('epc','contratista')
              then 'sin_clasificar'::rol_decisor
              else r.rol
            end
       from reglas_rol_contacto r
      where r.activo
        and public.sin_tildes(lower(p_cargo)) like
            '%' || public.sin_tildes(lower(r.patron)) || '%'
      order by r.orden, r.creado_en
      limit 1),
    'sin_clasificar'::rol_decisor)
$$;

-- La versión de 1 argumento queda como atajo sin contexto (compatibilidad)
create or replace function public.clasificar_rol_contacto(p_cargo text)
returns rol_decisor language sql stable as
$$ select public.clasificar_rol_contacto(p_cargo, null::text) $$;

-- El trigger ahora clasifica con el rol_mercado de la cuenta del contacto
create or replace function public.aplicar_rol_contacto()
returns trigger language plpgsql as $$
begin
  if not new.rol_manual then
    new.rol := public.clasificar_rol_contacto(
      new.cargo,
      (select c.rol_mercado from cuentas c where c.id = new.cuenta_id));
  end if;
  return new;
end $$;

-- Reclasificación masiva (tras editar reglas o cambiar rol_mercado de cuentas)
create or replace function public.reclasificar_roles_contactos()
returns int language plpgsql security invoker as $$
declare
  v_actualizados int;
begin
  update contactos ct
     set rol = public.clasificar_rol_contacto(ct.cargo, c.rol_mercado)
    from cuentas c
   where c.id = ct.cuenta_id
     and not ct.rol_manual
     and ct.rol is distinct from public.clasificar_rol_contacto(ct.cargo, c.rol_mercado);
  get diagnostics v_actualizados = row_count;
  return v_actualizados;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Bucket agrupador (para pantallas, KPIs y el reporte de carga)
-- ---------------------------------------------------------------------------
create function public.bucket_rol(p_rol rol_decisor)
returns text language sql immutable as $$
  select case p_rol
    when 'gerente_proyecto'          then 'decisor_tecnico'
    when 'gerente_construccion'      then 'decisor_tecnico'
    when 'calidad_qaqc'              then 'decisor_tecnico'
    when 'hse'                       then 'decisor_tecnico'
    when 'decisor_tecnico'           then 'decisor_tecnico'
    when 'contratos_abastecimiento'  then 'gestor_compra'
    when 'puerta_entrada'            then 'puerta_entrada'
    else 'sin_clasificar'
  end
$$;

-- ---------------------------------------------------------------------------
-- 3. Set canónico de reglas (reemplaza las 23 de 0011; afinable en la UI).
--    Orden: específicas primero; genéricos de gerencia al final.
-- ---------------------------------------------------------------------------
delete from reglas_rol_contacto;

insert into reglas_rol_contacto (orden, patron, rol, peso_decision, solo_mandante) values
  -- administrador de contrato dirige el contrato en faena → decisor (antes que 'contrato')
  ( 10, 'administrador de contrato',  'decisor_tecnico',           90, false),
  ( 11, 'administradora de contrato', 'decisor_tecnico',           90, false),
  -- gestor de compra
  ( 20, 'contrato',                   'contratos_abastecimiento',  80, false),
  ( 21, 'abastecimiento',             'contratos_abastecimiento',  80, false),
  ( 22, 'procurement',                'contratos_abastecimiento',  80, false),
  ( 23, 'compras',                    'contratos_abastecimiento',  75, false),
  ( 24, 'comprador',                  'contratos_abastecimiento',  75, false),
  ( 25, 'adquisic',                   'contratos_abastecimiento',  75, false),
  ( 26, 'licitac',                    'contratos_abastecimiento',  75, false),
  ( 27, 'supply',                     'contratos_abastecimiento',  70, false),
  ( 28, 'subcontrat',                 'contratos_abastecimiento',  70, false),
  -- decisor: dirección de proyecto
  ( 30, 'gerente de proyecto',        'gerente_proyecto',         100, false),
  ( 31, 'director de proyecto',       'gerente_proyecto',         100, false),
  ( 32, 'project manager',            'gerente_proyecto',         100, false),
  ( 33, 'jefe de proyecto',           'gerente_proyecto',          95, false),
  -- decisor: construcción
  ( 40, 'gerente de construccion',    'gerente_construccion',      90, false),
  ( 41, 'construction manager',       'gerente_construccion',      90, false),
  ( 42, 'director de construccion',   'gerente_construccion',      90, false),
  ( 43, 'jefe de construccion',       'gerente_construccion',      85, false),
  ( 44, 'superintendente',            'gerente_construccion',      85, false),
  ( 45, 'jefe de terreno',            'gerente_construccion',      80, false),
  ( 46, 'jefe de obra',               'gerente_construccion',      80, false),
  ( 47, 'administrador de obra',      'gerente_construccion',      80, false),
  -- decisor técnico genérico: operaciones / ingeniería / mantenimiento / planta
  ( 50, 'gerente de operaciones',     'decisor_tecnico',           90, false),
  ( 51, 'gerente operaciones',        'decisor_tecnico',           90, false),
  ( 52, 'director de operaciones',    'decisor_tecnico',           90, false),
  ( 53, 'jefe de operaciones',        'decisor_tecnico',           80, false),
  ( 54, 'de ingenieria',              'decisor_tecnico',           80, false),
  ( 55, 'constructibilidad',          'decisor_tecnico',           80, false),
  ( 56, 'gerente tecnico',            'decisor_tecnico',           85, false),
  ( 57, 'director tecnico',           'decisor_tecnico',           85, false),
  ( 58, 'jefe tecnico',               'decisor_tecnico',           75, false),
  ( 59, 'gerencia tecnica',           'decisor_tecnico',           85, false),
  ( 60, 'gerente de mantenimiento',   'decisor_tecnico',           75, false),
  ( 61, 'jefe de mantenimiento',      'decisor_tecnico',           70, false),
  ( 62, 'jefe de mantencion',         'decisor_tecnico',           70, false),
  ( 63, 'gerente de planta',          'decisor_tecnico',           80, false),
  ( 64, 'jefe de planta',             'decisor_tecnico',           75, false),
  ( 65, 'gerente de faena',           'decisor_tecnico',           80, false),
  ( 66, 'puesta en marcha',           'decisor_tecnico',           75, false),
  ( 67, 'comisionamiento',            'decisor_tecnico',           75, false),
  ( 68, 'commissioning',              'decisor_tecnico',           75, false),
  -- aprobado 2026-08-05: ingeniero de minas es técnico (geólogo NO: exploración)
  ( 69, 'ingeniero civil de minas',   'decisor_tecnico',           65, false),
  ( 70, 'ingeniero civil en minas',   'decisor_tecnico',           65, false),
  ( 71, 'ingeniero de minas',         'decisor_tecnico',           65, false),
  ( 72, 'ingeniero en minas',         'decisor_tecnico',           65, false),
  -- decisor: calidad
  ( 80, 'calidad',                    'calidad_qaqc',              70, false),
  ( 81, 'qa/qc',                      'calidad_qaqc',              70, false),
  ( 82, 'qaqc',                       'calidad_qaqc',              70, false),
  ( 83, 'qa qc',                      'calidad_qaqc',              70, false),
  ( 84, 'quality',                    'calidad_qaqc',              70, false),
  -- decisor: HSE / ambiental
  ( 90, 'hse',                        'hse',                       70, false),
  ( 91, 'prevencion',                 'hse',                       70, false),
  ( 92, 'ssoma',                      'hse',                       70, false),
  ( 93, 'seguridad',                  'hse',                       65, false),
  ( 94, 'salud ocupacional',          'hse',                       65, false),
  ( 95, 'medio ambiente',             'hse',                       65, false),
  ( 96, 'medioambient',               'hse',                       65, false),
  ( 97, 'sustentabilidad',            'hse',                       60, false),
  ( 98, 'sostenibilidad',             'hse',                       60, false),
  -- puerta de entrada: gerencia general / dueños / legal
  (110, 'gerente general',            'puerta_entrada',            60, false),
  (111, 'director general',           'puerta_entrada',            60, false),
  (112, 'general manager',            'puerta_entrada',            60, false),
  (113, 'managing director',          'puerta_entrada',            60, false),
  (114, 'country manager',            'puerta_entrada',            60, false),
  (115, 'chief executive',            'puerta_entrada',            60, false),
  (116, 'ceo',                        'puerta_entrada',            60, false),
  (117, 'presidente',                 'puerta_entrada',            55, false), -- cubre vicepresidente
  (118, 'socio',                      'puerta_entrada',            50, false),
  (119, 'fundador',                   'puerta_entrada',            50, false),
  (120, 'founder',                    'puerta_entrada',            50, false),
  (121, 'dueno',                      'puerta_entrada',            50, false),
  (122, 'propietario',                'puerta_entrada',            50, false),
  (123, 'representante legal',        'puerta_entrada',            45, false),
  (124, 'apoderado',                  'puerta_entrada',            45, false),
  -- puerta CONDICIONADA: familia comercial-ventas — solo en mandante/otro
  -- (en un proveedor es quien nos vende; terminal → sin_clasificar)
  (130, 'comercial',                  'puerta_entrada',            40, true),
  (131, 'ventas',                     'puerta_entrada',            40, true),
  (132, 'sales',                      'puerta_entrada',            40, true),
  (133, 'negocio',                    'puerta_entrada',            40, true),
  (134, 'business development',       'puerta_entrada',            40, true),
  (135, 'marketing',                  'puerta_entrada',            35, true),
  (136, 'kam',                        'puerta_entrada',            40, true),
  (137, 'key account',                'puerta_entrada',            40, true),
  -- puerta: administración / asistencia
  (140, 'asistente',                  'puerta_entrada',            30, false),
  (141, 'secretaria',                 'puerta_entrada',            30, false),
  (142, 'recepcion',                  'puerta_entrada',            25, false),
  (143, 'administrativ',              'puerta_entrada',            25, false),
  (144, 'finanzas',                   'puerta_entrada',            35, false),
  -- genéricos de gerencia AL FINAL (todo lo específico ya calzó arriba)
  (150, 'gerente',                    'puerta_entrada',            40, false),
  (151, 'subgerente',                 'puerta_entrada',            35, false),
  (152, 'gerencia',                   'puerta_entrada',            40, false),
  (153, 'director',                   'puerta_entrada',            45, false),
  (154, 'manager',                    'puerta_entrada',            35, false);

-- ---------------------------------------------------------------------------
-- 4. Idempotencia de la carga iMercados: re-importar no duplica
-- ---------------------------------------------------------------------------
drop index proyectos_mercado_idexterno_idx;
create unique index proyectos_mercado_idexterno_unico
  on proyectos_mercado (fuente_externa, id_externo)
  where fuente_externa is not null and id_externo is not null;

-- ---------------------------------------------------------------------------
-- 5. Grants (el EXECUTE default quedó revocado globalmente en 0015)
-- ---------------------------------------------------------------------------
grant execute on function
  public.clasificar_rol_contacto(text, text),
  public.bucket_rol(rol_decisor)
to authenticated;
