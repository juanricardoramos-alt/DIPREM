-- ============================================================================
-- DIPREM CRM — Seed
-- Parte 1: catálogos DIPREM (válidos en cualquier entorno)
-- Parte 2: datos demo SOLO para desarrollo local (usuarios y cuentas de prueba)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Catálogos DIPREM
-- ---------------------------------------------------------------------------
insert into pilares (id, numero, nombre) values
 (1, 1, 'Dirección y Gestión de Proyectos + QA/QC'),
 (2, 2, 'Seguridad, Salud Ocupacional y Medio Ambiente'),
 (3, 3, 'Evaluación de Proveedores, Control de Contratistas y Desarrollo Tecnológico');

insert into lineas_servicio (pilar_id, nombre) values
 (1, 'Gestión de Proyectos y QA/QC'),
 (2, 'Seguridad y Salud Ocupacional'),
 (2, 'Medio Ambiente'),
 (2, 'Sistema de Gestión de Calidad'), -- nombrada en brochure global; catálogo por confirmar
 (3, 'Control de Contratistas y Desarrollo Tecnológico');

insert into etapas_embudo (nombre, orden, probabilidad_default, es_ganada, es_perdida) values
 ('Prospecto',               1,  10, false, false),
 ('Contactado',              2,  20, false, false),
 ('Reunión / Levantamiento', 3,  40, false, false),
 ('Propuesta enviada',       4,  60, false, false),
 ('Negociación',             5,  80, false, false),
 ('Adjudicado',              6, 100, true,  false),
 ('Perdido',                 7,   0, false, true);

insert into motivos_perdida (nombre) values
 ('Precio'), ('Competencia'), ('Sin presupuesto'), ('Proyecto cancelado'),
 ('Sin respuesta'), ('Tiempos de entrega'), ('Otro');

-- Servicios semilla (catálogo por pilar/línea — precios referenciales pendientes
-- de confirmar con DIPREM, ver docs/CONTEXTO-DIPREM.md §5)
with ls as (select id, pilar_id, nombre from lineas_servicio)
insert into servicios (pilar_id, linea_servicio_id, nombre, unidad)
select v.pilar, ls.id, v.servicio, v.unidad
from (values
  -- Pilar 1
  (1, 'Gestión de Proyectos y QA/QC', 'Supervisión técnica de obras',            'mes'),
  (1, 'Gestión de Proyectos y QA/QC', 'Control de calidad (QA/QC) construcción y montaje', 'mes'),
  (1, 'Gestión de Proyectos y QA/QC', 'Precomisionamiento y comisionamiento',    'proyecto'),
  (1, 'Gestión de Proyectos y QA/QC', 'Puesta en marcha',                        'proyecto'),
  (1, 'Gestión de Proyectos y QA/QC', 'Auditoría técnica',                       'proyecto'),
  (1, 'Gestión de Proyectos y QA/QC', 'Outsourcing de personal especializado',   'HH'),
  (1, 'Gestión de Proyectos y QA/QC', 'Outsourcing de inspectores',              'HH'),
  -- Pilar 2 — SSO
  (2, 'Seguridad y Salud Ocupacional', 'Sistema de gestión SSO',                 'proyecto'),
  (2, 'Seguridad y Salud Ocupacional', 'Higiene y seguridad para obras en construcción', 'mes'),
  (2, 'Seguridad y Salud Ocupacional', 'Seguridad en procesos',                  'proyecto'),
  (2, 'Seguridad y Salud Ocupacional', 'Capacitación SSO (plan anual)',          'hora'),
  (2, 'Seguridad y Salud Ocupacional', 'Auditoría HSE',                          'proyecto'),
  (2, 'Seguridad y Salud Ocupacional', 'Medicina laboral in situ',               'mes'),
  (2, 'Seguridad y Salud Ocupacional', 'Supervisión SSO de personal propio y subcontratistas', 'mes'),
  (2, 'Seguridad y Salud Ocupacional', 'Verificación de elementos de protección personal', 'proyecto'),
  (2, 'Seguridad y Salud Ocupacional', 'Inscripciones y trámites ante organismos reguladores', 'proyecto'),
  -- Pilar 2 — Medio Ambiente
  (2, 'Medio Ambiente', 'Huella de carbono',                                     'proyecto'),
  (2, 'Medio Ambiente', 'Permisos ambientales y cumplimiento legal',             'proyecto'),
  (2, 'Medio Ambiente', 'Evaluación de impactos ambientales',                    'proyecto'),
  (2, 'Medio Ambiente', 'Auditoría y diagnóstico ambiental',                     'proyecto'),
  (2, 'Medio Ambiente', 'Plan de gestión ambiental y social (PGA)',              'proyecto'),
  (2, 'Medio Ambiente', 'Asesoría profesional ambiental mensual',                'mes'),
  (2, 'Medio Ambiente', 'Educación ambiental',                                   'hora'),
  -- Pilar 3
  (3, 'Control de Contratistas y Desarrollo Tecnológico', 'Control documental digital', 'mes'),
  (3, 'Control de Contratistas y Desarrollo Tecnológico', 'Evaluación y auditoría de proveedores', 'proyecto'),
  (3, 'Control de Contratistas y Desarrollo Tecnológico', 'Control de contratistas', 'mes'),
  (3, 'Control de Contratistas y Desarrollo Tecnológico', 'Gestión contractual',     'mes'),
  (3, 'Control de Contratistas y Desarrollo Tecnológico', 'Plataforma de registro y cumplimiento', 'mes'),
  (3, 'Control de Contratistas y Desarrollo Tecnológico', 'Trazabilidad de equipos, vehículos y personal', 'mes')
) as v(pilar, linea, servicio, unidad)
join ls on ls.pilar_id = v.pilar and ls.nombre = v.linea;

-- ---------------------------------------------------------------------------
-- 2. Datos demo — SOLO DESARROLLO LOCAL (contraseña de todos: diprem123)
--    En producción los usuarios se crean por invitación desde Administración.
-- ---------------------------------------------------------------------------

-- Equipos demo
insert into equipos (id, nombre, pais, moneda_default) values
 ('a0000000-0000-4000-8000-000000000001', 'Chile — Santiago',       'Chile',     'CLP'),
 ('a0000000-0000-4000-8000-000000000002', 'Argentina — Buenos Aires','Argentina', 'ARS');

-- Usuarios demo en Supabase Auth (el trigger crear_perfil_al_registrar genera
-- la fila en public.usuarios con nombre y rol desde raw_user_meta_data)
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change, email_change_token_new)
select
  '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated',
  v.email, extensions.crypt('diprem123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('nombre', v.nombre, 'rol', v.rol),
  now(), now(), '', '', '', ''
from (values
  ('b0000000-0000-4000-8000-000000000001'::uuid, 'admin@diprem.local',     'Administración DIPREM', 'admin'),
  ('b0000000-0000-4000-8000-000000000002'::uuid, 'gerente.cl@diprem.local','Gabriela Rojas',        'gerente'),
  ('b0000000-0000-4000-8000-000000000003'::uuid, 'ejecutivo.cl@diprem.local','Esteban Vidal',       'ejecutivo'),
  ('b0000000-0000-4000-8000-000000000004'::uuid, 'gerente.ar@diprem.local','Marina López',          'gerente'),
  ('b0000000-0000-4000-8000-000000000005'::uuid, 'ejecutivo.ar@diprem.local','Julián Pereyra',      'ejecutivo'),
  ('b0000000-0000-4000-8000-000000000006'::uuid, 'lectura@diprem.local',   'Gerencia General',      'lectura')
) as v(id, email, nombre, rol);

insert into auth.identities
  (id, user_id, provider_id, identity_data, provider,
   last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email,
                          'email_verified', true, 'phone_verified', false),
       'email', now(), now(), now()
from auth.users u
where u.email like '%@diprem.local';

-- Asignar equipos y gerentes
update usuarios set equipo_id = 'a0000000-0000-4000-8000-000000000001'
 where email in ('gerente.cl@diprem.local', 'ejecutivo.cl@diprem.local');
update usuarios set equipo_id = 'a0000000-0000-4000-8000-000000000002'
 where email in ('gerente.ar@diprem.local', 'ejecutivo.ar@diprem.local');
update equipos set gerente_id = 'b0000000-0000-4000-8000-000000000002'
 where id = 'a0000000-0000-4000-8000-000000000001';
update equipos set gerente_id = 'b0000000-0000-4000-8000-000000000004'
 where id = 'a0000000-0000-4000-8000-000000000002';

-- Cuentas demo (casos de éxito del brochure Minería 2026, cartera Argentina)
insert into cuentas (razon_social, vertical, pais, propietario_id, equipo_id, estado) values
 ('MILICIC',       'mineria', 'Argentina', 'b0000000-0000-4000-8000-000000000005',
  'a0000000-0000-4000-8000-000000000002', 'activa'),
 ('GANFENG',       'mineria', 'Argentina', 'b0000000-0000-4000-8000-000000000005',
  'a0000000-0000-4000-8000-000000000002', 'activa'),
 ('WORLEY',        'mineria', 'Argentina', 'b0000000-0000-4000-8000-000000000005',
  'a0000000-0000-4000-8000-000000000002', 'activa'),
 ('FIRST QUANTUM', 'mineria', 'Argentina', 'b0000000-0000-4000-8000-000000000005',
  'a0000000-0000-4000-8000-000000000002', 'activa'),
 ('CAN II',        'mineria', 'Argentina', 'b0000000-0000-4000-8000-000000000005',
  'a0000000-0000-4000-8000-000000000002', 'prospecto');
