-- ============================================================================
-- DIPREM CRM — Migración 0013 (Neon): cerrar _migraciones
-- Responde al advisor de Neon ("RLS deshabilitado" en _migraciones).
-- Contenido no sensible (nombres de archivo de migración + timestamps), y tras
-- el revoke de F1 authenticated ya no tenía grant sobre ella; aun así se cierra
-- a los dos niveles para mantener deny-by-default y silenciar el advisor.
-- El runner escribe esta tabla como neondb_owner (dueño → bypasea RLS), así que
-- habilitar RLS sin políticas no afecta a las migraciones.
-- ============================================================================
revoke all on _migraciones from public, authenticated, anonymous;
alter table _migraciones enable row level security;
-- Sin políticas a propósito: cualquier rol no-owner queda en deny-all.
