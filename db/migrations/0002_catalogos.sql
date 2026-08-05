-- ============================================================================
-- DIPREM CRM — Migración 0002 (Neon): catálogos DIPREM
-- Configuración de negocio válida en cualquier entorno (NO son datos demo):
-- pilares, líneas de servicio, embudo por defecto, motivos de pérdida y
-- catálogo de servicios del brochure. Cero usuarios, cero cuentas, cero
-- oportunidades: los datos operativos entran solo por la aplicación o por el
-- pipeline de carga aprobado.
-- ============================================================================

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
