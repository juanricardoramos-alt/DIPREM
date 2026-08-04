#!/usr/bin/env bash
# ============================================================================
# Valida el set completo de migraciones (db/migrations) en un PostgreSQL local
# desechable, sin tocar ninguna base remota. Verifica:
#   1. Que las migraciones aplican limpias y el runner es idempotente.
#   2. RLS habilitado en TODAS las tablas y las 92 políticas de F1.
#   3. Grants mínimos: anonymous en cero; authenticated según la matriz; y la
#      simulación del registro abierto (intruso con JWT válido → 0 filas).
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
comprobar "92 políticas RLS (F1)" 92 \
  "select count(*) from pg_policies where schemaname='public'"
comprobar "las 24 tablas tienen al menos una política" 24 \
  "select count(distinct tablename) from pg_policies where schemaname='public'"
comprobar "anonymous: cero privilegios sobre tablas" 0 \
  "select count(*) from pg_tables where schemaname='public'
    and has_table_privilege('anonymous', format('%I.%I', schemaname, tablename),
                            'select,insert,update,delete')"
comprobar "authenticated: select en las 24 tablas" 24 \
  "select count(*) from pg_tables
    where schemaname='public' and tablename <> '_migraciones'
      and has_table_privilege('authenticated', format('%I.%I', schemaname, tablename), 'select')"
comprobar "authenticated: insert/update en 23 (sin auditoria)" 23 \
  "select count(*) from pg_tables
    where schemaname='public' and tablename <> '_migraciones'
      and has_table_privilege('authenticated', format('%I.%I', schemaname, tablename), 'insert,update')"
comprobar "authenticated: delete en 22 (sin auditoria ni importaciones)" 22 \
  "select count(*) from pg_tables
    where schemaname='public' and tablename <> '_migraciones'
      and has_table_privilege('authenticated', format('%I.%I', schemaname, tablename), 'delete')"
comprobar "anonymous sin usage en schema public" f \
  "select has_schema_privilege('anonymous','public','usage')"
comprobar "authenticated con usage en schema public" t \
  "select has_schema_privilege('authenticated','public','usage')"
comprobar "notificar_reporte_semanal NO ejecutable por clientes" f \
  "select has_function_privilege('authenticated','public.notificar_reporte_semanal()','execute')"
comprobar "importar_proyectos_mercado sí ejecutable (RPC)" t \
  "select has_function_privilege('authenticated','public.importar_proyectos_mercado(jsonb)','execute')"
comprobar "usuario_actual() es SECURITY DEFINER" t \
  "select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='usuario_actual'"

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

echo "— F1: simulación del registro abierto (stub de auth.user_id + rol authenticated)…"
"$PGBIN/psql" "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 <<'SQL'
begin;
-- Stub local de pg_session_jwt: en Neon lo provee la Data API.
create schema auth;
create function auth.user_id() returns text language sql stable as
  $$ select nullif(current_setting('diprem.prueba_sub', true), '') $$;
grant usage on schema auth to authenticated;
grant execute on function auth.user_id() to authenticated;

-- Datos de prueba (se revierten con el rollback)
insert into equipos (id, nombre, pais)
  values ('e0000000-0000-4000-8000-000000000001', 'Equipo Prueba', 'Chile');
insert into usuarios (id, auth_id, nombre, email, rol, equipo_id) values
  ('00000000-0000-4000-8000-0000000000ad', 'sub-admin', 'Admin Prueba',
   'admin@prueba.local', 'admin', null),
  ('00000000-0000-4000-8000-0000000000e1', 'sub-ejecutivo', 'Ejecutivo Prueba',
   'ejecutivo@prueba.local', 'ejecutivo', 'e0000000-0000-4000-8000-000000000001');
insert into cuentas (id, razon_social, propietario_id)
  values ('c0000000-0000-4000-8000-000000000001', 'Cuenta Prueba',
          '00000000-0000-4000-8000-0000000000e1');
insert into contactos (cuenta_id, nombre, email)
  values ('c0000000-0000-4000-8000-000000000001', 'Contacto Prueba', 'contacto@prueba.local');

set local role authenticated;

-- 1) Intruso: JWT válido (sub presente) pero SIN fila en usuarios → cero en todo
select set_config('diprem.prueba_sub', 'sub-intruso-internet', true);
do $$ begin
  if (select count(*) from cuentas)   <> 0 then raise exception 'FALLO: intruso ve cuentas'; end if;
  if (select count(*) from contactos) <> 0 then raise exception 'FALLO: intruso ve contactos'; end if;
  if (select count(*) from usuarios)  <> 0 then raise exception 'FALLO: intruso ve usuarios'; end if;
  if (select count(*) from pilares)   <> 0 then raise exception 'FALLO: intruso ve catálogos'; end if;
  if (select count(*) from reglas_rol_contacto) <> 0 then raise exception 'FALLO: intruso ve reglas'; end if;
end $$;
do $$ begin
  begin
    insert into cuentas (razon_social, propietario_id)
      values ('HACK', '00000000-0000-4000-8000-00000000dead');
    raise exception 'FALLO: el intruso pudo escribir en cuentas';
  exception when insufficient_privilege then
    null; -- 42501: bloqueado por RLS, como corresponde
  end;
end $$;

-- 2) Sin sesión (sub vacío) → también cero
select set_config('diprem.prueba_sub', '', true);
do $$ begin
  if (select count(*) from cuentas) <> 0 then raise exception 'FALLO: sin sub ve cuentas'; end if;
end $$;

-- 3) Ejecutivo con perfil: ve lo suyo y los catálogos, no el mercado
select set_config('diprem.prueba_sub', 'sub-ejecutivo', true);
do $$ begin
  if (select count(*) from cuentas)  <> 1 then raise exception 'FALLO: ejecutivo no ve su cuenta'; end if;
  if (select count(*) from pilares)  <> 3 then raise exception 'FALLO: ejecutivo no ve catálogos'; end if;
  if (select public.rol_actual()) <> 'ejecutivo' then raise exception 'FALLO: rol_actual'; end if;
end $$;

-- 4) Admin con perfil: ve todo
select set_config('diprem.prueba_sub', 'sub-admin', true);
do $$ begin
  if (select count(*) from cuentas)  <> 1 then raise exception 'FALLO: admin no ve cuentas'; end if;
  if (select count(*) from usuarios) <> 2 then raise exception 'FALLO: admin no ve usuarios'; end if;
  if not public.es_admin() then raise exception 'FALLO: es_admin'; end if;
end $$;

rollback;
SQL
echo "  ✔ intruso con JWT: 0 filas y escritura bloqueada · ejecutivo/admin: acceso correcto"

echo "— F1: rol anonymous sin acceso alguno…"
"$PGBIN/psql" "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 <<'SQL'
begin;
set local role anonymous;
do $$ begin
  begin
    perform count(*) from public.pilares;
    raise exception 'FALLO: anonymous puede leer pilares';
  exception when insufficient_privilege or undefined_table then
    null; -- sin usage/grants: denegado antes de evaluar RLS (42501 o 42P01,
          -- según si el nombre siquiera resuelve sin usage del esquema)
  end;
end $$;
rollback;
SQL
echo "  ✔ anonymous: denegado a nivel de grants"

echo ""
echo "✅ Validación local completa: migraciones aplican limpias, RLS activo en todo, cero datos."
