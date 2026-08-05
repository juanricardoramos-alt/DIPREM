-- ============================================================================
-- DIPREM CRM — Migración 0016 (Neon): valores nuevos de rol_decisor
-- Buckets aprobados 2026-08-05: decisor_tecnico (genérico técnico: operaciones,
-- ingeniería, mantenimiento, planta…) y puerta_entrada (gerencia general,
-- comercial, legal, asistencia). Los valores finos existentes (gerente_proyecto,
-- gerente_construccion, calidad_qaqc, hse) se mantienen: son subconjuntos del
-- bucket decisor_tecnico; contratos_abastecimiento = bucket gestor_compra.
--
-- Va en migración propia: un valor de enum agregado no puede USARSE en la
-- misma transacción (55P04) y la 0017 siembra reglas que lo usan.
-- ============================================================================
alter type rol_decisor add value if not exists 'decisor_tecnico' before 'otro';
alter type rol_decisor add value if not exists 'puerta_entrada'  before 'otro';
