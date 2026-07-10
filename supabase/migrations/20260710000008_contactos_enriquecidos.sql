-- ============================================================================
-- DIPREM CRM — Migración 0008: Perfil de contacto enriquecido
--   LinkedIn, mejor horario para contactar y notas privadas internas.
--   La visibilidad hereda la RLS de la cuenta (sin políticas nuevas).
-- ============================================================================

alter table contactos
  add column linkedin text,        -- URL o usuario de LinkedIn
  add column mejor_horario text,   -- ej: "Martes a jueves, 9:00–11:00"
  add column notas_privadas text;  -- internas DIPREM: no salen en la ficha PDF
