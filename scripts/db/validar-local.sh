#!/usr/bin/env bash
# ============================================================================
# Valida el set completo de migraciones (db/migrations) en un PostgreSQL local
# desechable, sin tocar ninguna base remota. Verifica:
#   1. Que las migraciones aplican limpias y el runner es idempotente.
#   2. RLS habilitado en TODAS las tablas y las políticas de F1 + 0014 + 0015.
#   3. Grants mínimos: anonymous en cero; authenticated según la matriz; y la
#      simulación del registro abierto (intruso con JWT válido → 0 filas).
#   4. Catálogos cargados; CERO datos operativos (solo el usuario de sistema).
#   5. Funciones de normalización, ventana caliente, clasificación de cargo y
#      sello de etapa (con datos de prueba dentro de un ROLLBACK).
#   6. Perímetro anti-extracción (0015): pool invisible, PII por columna,
#      reclamo con tope, revelación con cuota, directorio sin PII.
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
comprobar "28 tablas en public (27 app + _migraciones)" 28 \
  "select count(*) from pg_tables where schemaname='public'"
comprobar "RLS habilitado en las 28 tablas (incluida _migraciones)" 28 \
  "select count(*) from pg_tables where schemaname='public' and rowsecurity"
comprobar "_migraciones sin grants a authenticated/anonymous" 0 \
  "select count(*) from information_schema.role_table_grants
    where table_name='_migraciones' and grantee in ('authenticated','anonymous')"
comprobar "99 políticas RLS (F1 + 0014 + 0015)" 99 \
  "select count(*) from pg_policies where schemaname='public'"
comprobar "las 27 tablas de app tienen política" 27 \
  "select count(distinct tablename) from pg_policies where schemaname='public'"
comprobar "anonymous: cero privilegios sobre tablas" 0 \
  "select count(*) from pg_tables where schemaname='public'
    and has_table_privilege('anonymous', format('%I.%I', schemaname, tablename),
                            'select,insert,update,delete')"
# contactos ya no cuenta: su select es por COLUMNA (PII revocada) → 26 de 27
comprobar "authenticated: select de tabla completa en 26 (contactos por columna)" 26 \
  "select count(*) from pg_tables
    where schemaname='public' and tablename <> '_migraciones'
      and has_table_privilege('authenticated', format('%I.%I', schemaname, tablename), 'select')"
comprobar "authenticated: insert/update en 25 (sin auditoria ni lecturas_sensibles)" 25 \
  "select count(*) from pg_tables
    where schemaname='public' and tablename <> '_migraciones'
      and has_table_privilege('authenticated', format('%I.%I', schemaname, tablename), 'insert,update')"
comprobar "authenticated: delete en 23 (sin auditoria/importaciones/limites/lecturas)" 23 \
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
comprobar "93 reglas de clasificación de cargo (0017)" 93 \
  "select count(*) from reglas_rol_contacto"
comprobar "1 usuario: solo el de sistema (pool 0015)" 1 "select count(*) from usuarios"
comprobar "el usuario de sistema no puede iniciar sesión" 1 \
  "select count(*) from usuarios where es_sistema and not activo and auth_id is null"
comprobar "usuario_pool() lo encuentra" t \
  "select usuario_pool() = (select id from usuarios where es_sistema)"
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

# 101 de 0015 + 23 DELETE (reglas 0011) + 93 INSERT (reglas 0017) = 217
comprobar "catálogos auditados (incl. recambio de reglas 0017)" 217 \
  "select count(*) from auditoria"
comprobar "etapa 'exploracion' existe en el enum (0014)" 1 \
  "select count(*) from pg_enum e join pg_type t on t.oid=e.enumtypid
    where t.typname='etapa_proyecto' and e.enumlabel='exploracion'"
comprobar "22 reglas rol_mercado (0014)" 22 "select count(*) from reglas_rol_mercado"
comprobar "clasificar_rol_mercado(mineria)=mandante" "mandante" \
  "select clasificar_rol_mercado('MINERIA DEL COBRE')"
comprobar "clasificar_rol_mercado(ingeniería)=epc" "epc" \
  "select clasificar_rol_mercado('EMPRESAS DE SERVICIOS DE INGENIERIA')"

echo "— Buckets de cargo con contexto (0016/0017)…"
comprobar "enum rol_decisor: decisor_tecnico y puerta_entrada" 2 \
  "select count(*) from pg_enum e join pg_type t on t.oid=e.enumtypid
    where t.typname='rol_decisor' and e.enumlabel in ('decisor_tecnico','puerta_entrada')"
comprobar "gerente comercial en mandante → puerta_entrada" "puerta_entrada" \
  "select clasificar_rol_contacto('Gerente Comercial','mandante')"
comprobar "gerente comercial en contratista → sin_clasificar (terminal)" "sin_clasificar" \
  "select clasificar_rol_contacto('Gerente Comercial','contratista')"
comprobar "director comercial en epc → sin_clasificar" "sin_clasificar" \
  "select clasificar_rol_contacto('Director Comercial','epc')"
comprobar "gerente general en contratista sigue siendo puerta" "puerta_entrada" \
  "select clasificar_rol_contacto('Gerente General','contratista')"
comprobar "ingeniero civil de minas → decisor_tecnico" "decisor_tecnico" \
  "select clasificar_rol_contacto('Ingeniero Civil de Minas')"
comprobar "geologo queda sin_clasificar" "sin_clasificar" \
  "select clasificar_rol_contacto('Geólogo')"
comprobar "bucket_rol(hse) → decisor_tecnico" "decisor_tecnico" \
  "select bucket_rol('hse')"
comprobar "bucket_rol(contratos) → gestor_compra" "gestor_compra" \
  "select bucket_rol('contratos_abastecimiento')"
comprobar "índice único de id_externo (re-importar sin duplicar)" 1 \
  "select count(*) from pg_indexes where indexname='proyectos_mercado_idexterno_unico'"

echo "— Scoring y control (0018)…"
comprobar "cubeta(en_licitacion) → P3 (evaluación de proveedores)" "objetivo_pilar_3" \
  "select cubeta_de_etapa('en_licitacion')"
comprobar "cubeta(operacion) → om_hse_recurrente" "om_hse_recurrente" \
  "select cubeta_de_etapa('operacion')"
comprobar "cubeta(factibilidad) → P2 (SEIA activo)" "objetivo_pilar_2" \
  "select cubeta_de_etapa('factibilidad')"
comprobar "recalcular_scores_mercado ejecutable (RPC)" t \
  "select has_function_privilege('authenticated','public.recalcular_scores_mercado()','execute')"
comprobar "calcular_score_mercado NO ejecutable por clientes" f \
  "select has_function_privilege('authenticated',
     'public.calcular_score_mercado(etapa_proyecto,numeric,vertical_cuenta,uuid)','execute')"
comprobar "actividades.con_respuesta existe (tasa de respuesta)" 1 \
  "select count(*) from information_schema.columns
    where table_name='actividades' and column_name='con_respuesta'"
comprobar "6 vistas de control con grant" 6 \
  "select count(*) from information_schema.role_table_grants
    where grantee='authenticated' and privilege_type='SELECT'
      and table_name in ('v_control_cobertura','v_control_avance_decisor',
                         'v_control_embudo','v_control_huerfanas',
                         'v_control_criticas','v_control_respuesta')"
comprobar "v_contactos_puerta con grant (0019)" 1 \
  "select count(*) from information_schema.role_table_grants
    where grantee='authenticated' and privilege_type='SELECT'
      and table_name='v_contactos_puerta'"

echo "— Perímetro 0015: estructura…"
comprobar "limites_rol: 4 filas (80/25 ejecutivo aprobado)" 1 \
  "select count(*) from limites_rol
    where rol='ejecutivo' and max_cartera=80 and max_revelaciones_dia=25"
comprobar "limites_rol: lectura en 0/0" 1 \
  "select count(*) from limites_rol
    where rol='lectura' and max_cartera=0 and max_revelaciones_dia=0"
comprobar "contactos.email NO seleccionable (PII por columna)" f \
  "select has_column_privilege('authenticated','public.contactos','email','select')"
comprobar "contactos.telefono NO seleccionable" f \
  "select has_column_privilege('authenticated','public.contactos','telefono','select')"
comprobar "contactos.email_normalizado NO seleccionable" f \
  "select has_column_privilege('authenticated','public.contactos','email_normalizado','select')"
comprobar "contactos.linkedin NO seleccionable" f \
  "select has_column_privilege('authenticated','public.contactos','linkedin','select')"
comprobar "contactos.nombre sí seleccionable" t \
  "select has_column_privilege('authenticated','public.contactos','nombre','select')"
comprobar "contactos.cargo sí seleccionable" t \
  "select has_column_privilege('authenticated','public.contactos','cargo','select')"
comprobar "revelar_contactos ejecutable (RPC)" t \
  "select has_function_privilege('authenticated','public.revelar_contactos(uuid)','execute')"
comprobar "usuario_pool NO ejecutable por clientes" f \
  "select has_function_privilege('authenticated','public.usuario_pool()','execute')"

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
  -- 0018: score sellado en el insert (construccion 40 + capex s/d 2 + sector
  -- s/d 5 + contactabilidad ventana 15 + historial 0 = 62; cubeta P1)
  if (select score from proyectos_mercado where nombre='Proyecto Prueba') <> 62 then
    raise exception 'FALLO: score esperado 62, hay %',
      (select score from proyectos_mercado where nombre='Proyecto Prueba');
  end if;
  if (select cubeta from proyectos_mercado where nombre='Proyecto Prueba')
     <> 'objetivo_pilar_1' then
    raise exception 'FALLO: cubeta de construccion debía ser objetivo_pilar_1';
  end if;
  if (select score_detalle->'factores'->'etapa'->>'puntos'
        from proyectos_mercado where nombre='Proyecto Prueba') <> '40' then
    raise exception 'FALLO: score_detalle sin desglose por factor';
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

comprobar "el rollback no dejó rastro (solo queda el usuario de sistema)" 1 \
  "select count(*) from usuarios"
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

-- 4) Admin con perfil: ve todo (2 de prueba + el usuario de sistema del pool)
select set_config('diprem.prueba_sub', 'sub-admin', true);
do $$ begin
  if (select count(*) from cuentas)  <> 1 then raise exception 'FALLO: admin no ve cuentas'; end if;
  if (select count(*) from usuarios) <> 3 then raise exception 'FALLO: admin no ve usuarios'; end if;
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

echo "— 0015: perímetro anti-extracción (pool, reclamo, cuota, directorio)…"
"$PGBIN/psql" "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 <<'SQL'
begin;
-- Stub local de pg_session_jwt (en Neon lo provee la Data API)
create schema auth;
create function auth.user_id() returns text language sql stable as
  $$ select nullif(current_setting('diprem.prueba_sub', true), '') $$;
grant usage on schema auth to authenticated;
grant execute on function auth.user_id() to authenticated;

-- Datos de prueba (se revierten con el rollback)
insert into equipos (id, nombre, pais)
  values ('e0000000-0000-4000-8000-000000000002', 'Equipo Norte', 'Chile');
insert into usuarios (id, auth_id, nombre, email, rol, equipo_id) values
  ('00000000-0000-4000-8000-0000000000a2', 'sub-admin',  'Admin P',  'admin.p@prueba.local',  'admin',  null),
  ('00000000-0000-4000-8000-0000000000b2', 'sub-ger',    'Gerente P','ger.p@prueba.local',    'gerente','e0000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-0000000000c2', 'sub-eje',    'Eje P',    'eje.p@prueba.local',    'ejecutivo','e0000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-0000000000d2', 'sub-lec',    'Lectura P','lec.p@prueba.local',    'lectura', null);

-- Pool: 3 cuentas del cargador (propietario = usuario de sistema)
insert into cuentas (id, razon_social, propietario_id, rol_mercado, giro, region) values
  ('c0000000-0000-4000-8000-000000000011', 'Minera Norte SpA',
   public.usuario_pool(), 'mandante', 'MINERIA DEL COBRE', 'Antofagasta'),
  ('c0000000-0000-4000-8000-000000000012', 'Constructora Sur Ltda',
   public.usuario_pool(), 'contratista', 'CONSTRUCCION', 'Biobio'),
  ('c0000000-0000-4000-8000-000000000013', 'Energia Andina SA',
   public.usuario_pool(), 'mandante', 'GENERACION DE ENERGIA', 'Antofagasta');
insert into contactos (id, cuenta_id, nombre, cargo, telefono, email, es_principal) values
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000011',
   'Contacto Uno', 'Gerente de Proyecto', '+56911111111', 'uno@minera.cl', true),
  ('a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000011',
   'Contacto Dos', 'Jefe de Contratos', null, 'dos@minera.cl', false),
  ('a0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000013',
   'Contacto Tres', null, '+56933333333', null, false);

set local role authenticated;

-- 1) Ejecutivo: el pool es INVISIBLE por tabla, visible SOLO vía directorio sin PII
do $$ begin perform set_config('diprem.prueba_sub', 'sub-eje', true); end $$;
do $$
declare r jsonb;
begin
  if (select count(*) from cuentas)   <> 0 then raise exception 'FALLO: ejecutivo ve el pool'; end if;
  if (select count(*) from contactos) <> 0 then raise exception 'FALLO: ejecutivo ve contactos del pool'; end if;
  if (select count(*) from public.directorio_prospectos()) <> 2
    then raise exception 'FALLO: directorio por defecto debe ocultar proveedores (2)'; end if;
  if (select count(*) from public.directorio_prospectos(p_incluir_proveedores => true)) <> 3
    then raise exception 'FALLO: directorio con proveedores debe dar 3'; end if;
  if (select n_contactos from public.directorio_prospectos(p_busqueda => 'minera norte')) <> 2
    then raise exception 'FALLO: n_contactos del directorio'; end if;
  if (select esta_asignada from public.directorio_prospectos(p_busqueda => 'minera norte'))
    then raise exception 'FALLO: pool debe figurar sin asignar'; end if;

  -- Reclamo: entra a la cartera y las FILAS aparecen, pero la PII sigue cerrada
  perform public.reclamar_cuenta('c0000000-0000-4000-8000-000000000011');
  if (select count(*) from cuentas) <> 1 then raise exception 'FALLO: reclamo no asignó'; end if;
  if (select count(*) from contactos) <> 2 then raise exception 'FALLO: contactos de cuenta propia'; end if;
  begin
    perform email from contactos limit 1;
    raise exception 'FALLO: email legible sin revelar';
  exception when insufficient_privilege then null;
  end;

  -- Revelación: entrega PII, registra, y repetir es libre
  r := public.revelar_contactos('c0000000-0000-4000-8000-000000000011');
  if (r->>'omitidos_por_limite')::int <> 0 then raise exception 'FALLO: no debía omitir'; end if;
  if (r->>'usadas_hoy')::int <> 2 then raise exception 'FALLO: usadas_hoy=2'; end if;
  if (select count(*) from jsonb_array_elements(r->'contactos') c
       where c->>'email' is not null) <> 2 then raise exception 'FALLO: PII no entregada'; end if;
  r := public.revelar_contactos('c0000000-0000-4000-8000-000000000011');
  if (r->>'usadas_hoy')::int <> 2 then raise exception 'FALLO: re-ver no es libre'; end if;

  -- Mi Día: el contacto principal de la cuenta propia llega a la vista
  if (select telefono from v_gestion_contactos
       where entidad='cuenta' and entidad_id='c0000000-0000-4000-8000-000000000011') is null
    then raise exception 'FALLO: v_gestion_contactos sin tel del principal'; end if;

  -- 0018: creado_por lo sella el TRIGGER — el intento de falsificarlo
  -- (atribuírselo al admin) queda sobrescrito con el usuario real
  insert into contactos (cuenta_id, nombre, cargo, creado_por)
    values ('c0000000-0000-4000-8000-000000000011', 'Decisor Conseguido',
            'Gerente de Proyectos', '00000000-0000-4000-8000-0000000000a2');
  if (select creado_por from contactos where nombre='Decisor Conseguido')
     <> '00000000-0000-4000-8000-0000000000c2' then
    raise exception 'FALLO: creado_por falsificable (no lo selló el trigger)';
  end if;
  -- El avance-a-decisor NO cuenta aquí: el PRIMER decisor de la cuenta fue
  -- importado (creado_por null) — solo cuenta pasar de "sin decisor" a tenerlo
  if (select count(*) from v_control_avance_decisor
       where cuenta_id='c0000000-0000-4000-8000-000000000011') <> 0 then
    raise exception 'FALLO: avance_decisor contó una cuenta con decisor importado';
  end if;
  -- Cobertura: la cartera del ejecutivo aparece con su % (1 cuenta, 0 gestionadas)
  if (select cartera from v_control_cobertura
       where usuario_id='00000000-0000-4000-8000-0000000000c2') <> 1 then
    raise exception 'FALLO: v_control_cobertura no ve la cartera del ejecutivo';
  end if;
end $$;

-- 2) Cuota diaria y tope de cartera (bajamos límites como owner y reintentamos)
reset role;
update limites_rol set max_revelaciones_dia = 2, max_cartera = 2 where rol = 'ejecutivo';
set local role authenticated;
do $$ begin perform set_config('diprem.prueba_sub', 'sub-eje', true); end $$;
do $$
declare r jsonb;
begin
  perform public.reclamar_cuenta('c0000000-0000-4000-8000-000000000013');
  r := public.revelar_contactos('c0000000-0000-4000-8000-000000000013');
  if (r->>'omitidos_por_limite')::int <> 1 then raise exception 'FALLO: cuota no omitió'; end if;
  if (select count(*) from jsonb_array_elements(r->'contactos') c
       where c->>'telefono' is not null) <> 0 then raise exception 'FALLO: PII sobre cuota'; end if;
  begin
    perform public.reclamar_cuenta('c0000000-0000-4000-8000-000000000012');
    raise exception 'FALLO: tope de cartera no aplicó';
  exception when others then
    if sqlerrm not like 'Tope de cartera%' then raise; end if;
  end;
  -- liberar devuelve al pool y abre cupo
  perform public.liberar_cuenta('c0000000-0000-4000-8000-000000000013');
  if (select count(*) from cuentas) <> 1 then raise exception 'FALLO: liberar no devolvió'; end if;
end $$;

-- 3) Gerente: revela sobre la cartera de su equipo (cuota propia)
do $$ begin perform set_config('diprem.prueba_sub', 'sub-ger', true); end $$;
do $$
declare r jsonb;
begin
  if (select count(*) from cuentas) < 1 then raise exception 'FALLO: gerente no ve equipo'; end if;
  r := public.revelar_contactos('c0000000-0000-4000-8000-000000000011');
  if (select count(*) from jsonb_array_elements(r->'contactos') c
       where c->>'email' is not null) <> 2 then raise exception 'FALLO: gerente sin PII de su equipo'; end if;
end $$;

-- 4) Solo-lectura: nombres de empresa sí; personas y PII jamás
do $$ begin perform set_config('diprem.prueba_sub', 'sub-lec', true); end $$;
do $$ begin
  if (select count(*) from cuentas) <> 3 then raise exception 'FALLO: lectura debe ver las cuentas'; end if;
  if (select count(*) from contactos) <> 0 then raise exception 'FALLO: lectura ve contactos'; end if;
  if (select telefono from v_gestion_contactos
       where entidad='cuenta' and entidad_id='c0000000-0000-4000-8000-000000000011') is not null
    then raise exception 'FALLO: lectura recibe tel por la vista'; end if;
  begin
    perform public.revelar_contactos('c0000000-0000-4000-8000-000000000011');
    raise exception 'FALLO: lectura pudo revelar';
  exception when others then
    if sqlerrm not like '%solo lectura%' then raise; end if;
  end;
  begin
    perform public.reclamar_cuenta('c0000000-0000-4000-8000-000000000012');
    raise exception 'FALLO: lectura pudo reclamar';
  exception when others then
    if sqlerrm not like '%solo lectura%' then raise; end if;
  end;
end $$;

-- 5) Alta de leads: dedup contra el pool + base de licitud obligatoria
do $$ begin perform set_config('diprem.prueba_sub', 'sub-eje', true); end $$;
do $$
declare r jsonb;
begin
  r := public.alta_lead('Persona Nueva', 'Constructora Sur Limitada',
                        p_base_licitud => 'interes_legitimo');
  if r->>'resultado' <> 'empresa_existente' then raise exception 'FALLO: dedup vs pool'; end if;
  if not (r->>'en_pool')::boolean then raise exception 'FALLO: debía marcar en_pool'; end if;
  begin
    r := public.alta_lead('Persona Nueva', 'Empresa Inexistente XY');
    raise exception 'FALLO: alta sin base de licitud';
  exception when others then
    if sqlerrm not like '%base de licitud%' then raise; end if;
  end;
  r := public.alta_lead('Persona Nueva', 'Empresa Inexistente XY',
                        p_email => 'pn@xy.cl', p_base_licitud => 'consentimiento',
                        p_origen_dato => 'prueba validación');
  if r->>'resultado' <> 'creado' then raise exception 'FALLO: alta limpia'; end if;
  r := public.alta_lead('Persona Nueva', 'Empresa Inexistente XY',
                        p_email => 'pn@xy.cl', p_base_licitud => 'consentimiento');
  if r->>'resultado' <> 'lead_duplicado' then raise exception 'FALLO: dedup de lead'; end if;
end $$;

-- 6) Intruso con JWT válido: el directorio también le da cero
do $$ begin perform set_config('diprem.prueba_sub', 'sub-intruso', true); end $$;
do $$ begin
  if (select count(*) from public.directorio_prospectos(p_incluir_proveedores => true)) <> 0
    then raise exception 'FALLO: intruso ve el directorio'; end if;
end $$;

rollback;
SQL
echo "  ✔ pool invisible · PII solo por revelación con cuota · topes y dedup activos"

comprobar "el rollback del perímetro no dejó rastro (lecturas)" 0 \
  "select count(*) from lecturas_sensibles"
comprobar "limites_rol volvió a 80/25" 1 \
  "select count(*) from limites_rol
    where rol='ejecutivo' and max_cartera=80 and max_revelaciones_dia=25"

echo ""
echo "✅ Validación local completa: migraciones aplican limpias, RLS activo en todo, perímetro cerrado."
