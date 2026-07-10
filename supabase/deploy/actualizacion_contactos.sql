-- ============================================================================
-- DIPREM CRM — ACTUALIZACIÓN: Perfil de contacto enriquecido
-- Pegar TODO en: Supabase Dashboard → SQL Editor → Run.
-- Se puede ejecutar más de una vez sin duplicar datos.
-- ============================================================================
-- Migración 0008: Perfil de contacto enriquecido
--   LinkedIn, mejor horario para contactar y notas privadas internas.
--   La visibilidad hereda la RLS de la cuenta (sin políticas nuevas).
-- ============================================================================

alter table contactos add column if not exists linkedin text;        -- URL o usuario de LinkedIn
alter table contactos add column if not exists mejor_horario text;   -- ej: "Martes a jueves, 9:00–11:00"
alter table contactos add column if not exists notas_privadas text;  -- internas DIPREM: no salen en la ficha PDF

-- ✅ Listo. Verifica con:
--   select linkedin, mejor_horario from contactos limit 5;
