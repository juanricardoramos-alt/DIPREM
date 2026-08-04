#!/usr/bin/env bash
# ============================================================================
# Valida el set completo de migraciones (db/migrations) en un PostgreSQL local
# desechable, sin tocar ninguna base remota. Verifica:
#   1. Que las migraciones aplican limpias y el runner es idempotente.
#   2. RLS habilitado en TODAS las tablas de la app (deny-all hasta la F1).
#   3. Cero políticas y cero grants a `authenticated` en esta fase.
#   4. Catálogos cargados; CERO usuarios/cuentas/datos operativos.
#   5. Funciones de normalización, ventana caliente, clasificación de cargo y
#      sello de etapa (con datos de prueba dentro de un ROLLBACK).
# Uso: bash scripts/db/validar-local.sh   (requiere PostgreSQL 16 local)
# ============================================================================
set -euo pipefail

if [[ $(id -u) -eq 0 ]]; then
  echo "initdb no corre como root: ejecuta este script como usuario sin privilegios." >&2
  exit 1
fi

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
BASE="$(mktemp -d "${TMPDIR:-/tmp}/diprem-valida-XXXXXX")"
export PGHOST="$BASE" PGPORT=55432 PGUSER=postgres

limpiar() { "$PGBIN/pg_ctl" -D "$BASE/datos" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$BASE"; }
trap limpiar EXIT

"$PGBIN/initdb" -D "$BASE/datos" -U postgres -A trust -E UTF8 >/dev/null
"$PGBIN/pg_ctl" -D "$BASE/datos" -l "$BASE/log" \
  -o "-p $PGPORT -k $BASE -c listen_addresses=''" start >/dev/null
"$PGBIN/createdb" diprem

export DATABASE_URL="postgresql://postgres@localhost:$PGPORT/diprem?host=$BASE"
cd "$(dirname "$0")/../.."

echo "— Aplicando migraciones…"
node scripts/db/migrate.mjs

echo "— Segunda pasada (idempotencia del runner)…"
SALIDA=$(node scripts/db/migrate.mjs)
[[ "$SALIDA" == "Sin migraciones pendientes." ]] || { echo "FALLO: runner no idempotente"; exit 1; }

q() { "$PGBIN/psql" "$DATABASE_URL" -X -tAc "$1"; }

comprobar() { # comprobar <descripcion> <esperado> <consulta>
  local real; real=$(q "$3")
  if [[ "$real" == "$2" ]]; then echo "  ✔ $1"
  else echo "  ✘ $1 — esperado [$2], obtenido [$real]"; exit 1; fi
}

echo "— Estructura y seguridad base…"
comprobar "25 tablas en public (24 app + _migraciones)" 25 \
  "select count(*) from pg_tables where schemaname='public'"
comprobar "RLS habilitado en las 24 tablas de la app" 24 \
  "select count(*) from pg_tables where schemaname='public' and rowsecurity"
comprobar "cero políticas RLS (llegan en F1)" 0 \
  "select count(*) from pg_policies where schemaname='public'"
comprobar "cero grants a authenticated/anonymous" 0 \
  "select count(*) from information_schema.role_table_grants
    where grantee in ('authenticated','anonymous')"

echo "— Catálogos sí, datos operativos no…"
comprobar "3 pilares" 3 "select count(*) from pilares"
comprobar "5 líneas de servicio" 5 "select count(*) from lineas_servicio"
comprobar "29 servicios" 29 "select count(*) from servicios"
comprobar "7 etapas de embudo" 7 "select count(*) from etapas_embudo"
comprobar "7 motivos de pérdida" 7 "select count(*) from motivos_perdida"
comprobar "23 reglas de clasificación" 23 "select count(*) from reglas_rol_contacto"
comprobar "cero usuarios" 0 "select count(*) from usuarios"
comprobar "cero equipos" 0 "select count(*) from equipos"
comprobar "cero cuentas" 0 "select count(*) from cuentas"
comprobar "cero oportunidades" 0 "select count(*) from oportunidades"
comprobar "cero contactos" 0 "select count(*) from contactos"

echo "— Funciones de dominio (Fase 8)…"
comprobar "normalizar_rut" "76123456K" "select normalizar_rut('76.123.456-k')"
comprobar "normalizar_empresa" "minera escondida" \
  "select normalizar_empresa('Minera Escondida Ltda.')"
comprobar "en_ventana_caliente(en_licitacion)" t \
  "select en_ventana_caliente('en_licitacion')"
comprobar "en_ventana_caliente(paralizado)" f \
  "select en_ventana_caliente('paralizado')"
comprobar "usuario_actual() sin JWT es null (allowlist)" "" \
  "select usuario_actual()"
comprobar "clasificar cargo decisor" "gerente_proyecto" \
  "select clasificar_rol_contacto('Gerente de Proyecto Senior')"
comprobar "cargo desconocido queda sin_clasificar" "sin_clasificar" \
  "select clasificar_rol_contacto('Astrónomo')"

comprobar "catálogos auditados (51 catálogo + 23 reglas)" 74 \
  "select count(*) from auditoria"

echo "— Triggers con datos de prueba (transacción con ROLLBACK)…"
AUDITORIA_ANTES=$(q "select count(*) from auditoria")
"$PGBIN/psql" "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 <<'SQL'
begin;
insert into usuarios (id, nombre, email, rol)
  values ('00000000-0000-4000-8000-000000000001', 'Prueba Validación', 'prueba@validacion.local', 'admin');
insert into proyectos_mercado (nombre, empresa, etapa, importado_por)
  values ('Proyecto Prueba', 'Empresa Prueba', 'construccion',
          '00000000-0000-4000-8000-000000000001');
do $$ begin
  if (select etapa_cambiada_en from proyectos_mercado where nombre='Proyecto Prueba') is null then
    raise exception 'FALLO: sellar_cambio_etapa no selló en el insert';
  end if;
end $$;
insert into cuentas (razon_social, tax_id, propietario_id)
  values ('ACME S.A.', '76.543.210-K', '00000000-0000-4000-8000-000000000001');
do $$ begin
  if (select tax_id_normalizado from cuentas where razon_social='ACME S.A.') <> '76543210K' then
    raise exception 'FALLO: tax_id_normalizado';
  end if;
end $$;
insert into contactos (cuenta_id, nombre, cargo, email)
  select id, 'Contacto Prueba', 'Jefa de Contratos', 'CONTACTO@Acme.CL '
    from cuentas where razon_social='ACME S.A.';
do $$ begin
  if (select rol from contactos where nombre='Contacto Prueba') <> 'contratos_abastecimiento' then
    raise exception 'FALLO: trigger de clasificación de rol';
  end if;
  if (select email_normalizado from contactos where nombre='Contacto Prueba') <> 'contacto@acme.cl' then
    raise exception 'FALLO: email_normalizado';
  end if;
end $$;
rollback;
SQL
echo "  ✔ triggers de etapa, normalización y clasificación"

comprobar "el rollback no dejó rastro (usuarios)" 0 "select count(*) from usuarios"
comprobar "el rollback tampoco dejó auditoría nueva" "$AUDITORIA_ANTES" \
  "select count(*) from auditoria"

echo ""
echo "✅ Validación local completa: migraciones aplican limpias, RLS activo en todo, cero datos."
