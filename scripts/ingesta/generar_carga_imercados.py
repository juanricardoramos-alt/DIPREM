#!/usr/bin/env python3
"""
DIPREM — Generador de la CARGA REAL iMercados (Fase 8b).

Transforma las 4 bases (empresas, empresas·productos, proyectos, contactos) en
archivos SQL idempotentes listos para aplicar sobre Neon (rama dev) con las
migraciones 0001..0017 ya aplicadas. NO toca ninguna base de datos.

Reglas (todas aprobadas y espejo del dry-run):
  · EMPRESAS = spine de `cuentas` + titulares de proyecto fuera del spine
    (un mandante con proyecto activo debe existir como cuenta).
  · Todas las cuentas nacen en el POOL (propietario = usuario de sistema):
    invisibles para el ejecutivo hasta reclamarlas (perímetro 0015).
  · rol_mercado: mandante si es titular de proyecto; si no, por giro.
  · Contactos: correo corporativo o teléfono (Ley 21.719: los personales no
    entran), dedup, clasificación de cargo la hace el TRIGGER de la BD (0017)
    con el contexto rol_mercado de la cuenta.
  · Proyectos: mapeo de etapa aprobado (watchlist, rediseñado→prioridad alta),
    idempotencia por (fuente_externa, id_externo).

Uso:
  python3 scripts/ingesta/generar_carga_imercados.py \
      --dir /ruta/con/los/4/archivos --salida /ruta/salida-sql

⚠️  Ni los archivos fuente ni el SQL generado entran al repo (contienen datos
personales): la salida va FUERA del árbol de trabajo.
"""
import argparse, os, sys, uuid
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dry_run_imercados import (  # noqa: E402 — lógica compartida con el dry-run
    nrm, nrm_emp, clase_email, rol_por_giro, musd, encontrar,
    ETAPA_MAP, WATCHLIST_SRC, PORCLASIF_SRC,
)

try:
    import pandas as pd
    import openpyxl
except ImportError:
    sys.exit("Faltan dependencias: pip install pandas openpyxl lxml")

NS = uuid.UUID("6d1b5c2a-0000-4000-8000-000000000000")  # uuid5: ids de lote estables
LOTE_CONTACTOS = str(uuid.uuid5(NS, "imercados-2026-08-contactos"))
LOTE_PROYECTOS = str(uuid.uuid5(NS, "imercados-2026-08-proyectos"))

ADMIN_SQL = ("(select id from usuarios where rol = 'admin' and activo "
             "and not es_sistema order by creado_en limit 1)")

def q(v):
    """Literal SQL: escapa comillas; None/vacío → NULL."""
    if v is None:
        return "null"
    s = str(v).replace("\x00", "").strip()
    if not s or s.lower() in ("nan", "none"):
        return "null"
    return "'" + s.replace("'", "''") + "'"

def fecha(v):
    """'2027' (o 2027.0 de pandas) → 2027-01-01; fechas dayfirst → date; resto NULL."""
    s = str(v).strip()
    if not s or s.lower() in ("nan", "none", "nat"):
        return "null"
    if s.endswith(".0"):
        s = s[:-2]                      # pandas lee años como float
    if s.isdigit() and len(s) == 4 and 1990 <= int(s) <= 2100:
        return f"'{s}-01-01'"
    try:
        d = pd.to_datetime(s, dayfirst=True, errors="raise")
        return f"'{d.date().isoformat()}'"
    except Exception:
        return "null"

def vertical_de(giro, sector=None):
    t = nrm(giro) + " " + nrm(sector)
    if "miner" in t or "extraccion" in t or "explotacion de mina" in t:
        return "mineria"
    if "energia" in t or "electric" in t or "transmision" in t or "generacion" in t:
        return "energia"
    if "petroleo" in t or "gas natural" in t or "hidrocarbur" in t:
        return "oil_gas"
    if "construc" in t or "inmobiliar" in t or "edificacion" in t:
        return "construccion"
    if "sanitari" in t or "infraestructura" in t or "concesion" in t or "captacion" in t:
        return "infraestructura"
    if "industria" in t or "manufactur" in t or "fabricacion" in t:
        return "industrial"
    return "otro"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, help="carpeta con los 4 archivos fuente")
    ap.add_argument("--salida", required=True, help="carpeta de salida del SQL (fuera del repo)")
    a = ap.parse_args()
    os.makedirs(a.salida, exist_ok=True)

    f_cont = encontrar(a.dir, "bbdd") or encontrar(a.dir, "imercados", ".xlsx")
    f_emp  = encontrar(a.dir, "empresas4")
    f_proy = encontrar(a.dir, "proyectos")
    for nom, f in [("contactos", f_cont), ("empresas", f_emp), ("proyectos", f_proy)]:
        if not f:
            sys.exit(f"No encontré el archivo de {nom} en {a.dir}")

    # ---- EMPRESAS: spine ----
    em = pd.read_html(f_emp)[0]
    em["n"] = em["Razón social"].map(nrm_emp)
    spine = {}          # nombre_norm -> dict con datos crudos (primera aparición)
    for _, r in em.iterrows():
        if r["n"] and r["n"] not in spine:
            spine[r["n"]] = {
                "razon": str(r["Razón social"]).strip(),
                "giro": r.get("Giro"), "region": r.get("Región"),
                "pais": r.get("País"), "ciudad": r.get("Ciudad"),
                "sitio": r.get("Sitio WEB"),
            }

    # ---- PROYECTOS ----
    pr = pd.read_html(f_proy)[0]
    # El archivo repite proyectos en distintos momentos del ciclo (mismo
    # nombre+empresa, IDs distintos). El índice único de 0005 exige uno solo:
    # se conserva el ID más alto (la instantánea más reciente).
    pr["k"] = (pr["Proyecto"].astype(str).str.strip().str.lower() + "|"
               + pr["Razón social"].astype(str).str.strip().str.lower())
    antes = len(pr)
    pr = (pr.assign(_id=pd.to_numeric(pr["ID"], errors="coerce"))
            .sort_values("_id").drop_duplicates("k", keep="last"))
    proy_colapsados = antes - len(pr)
    pr["mand"] = pr["Razón social"].map(nrm_emp)
    mandantes_proy = set(pr["mand"]) - {""}

    # titulares de proyecto que no están en EMPRESAS → también nacen como cuenta
    titulares_extra = {}
    for _, r in pr.iterrows():
        n = r["mand"]
        if n and n not in spine and n not in titulares_extra:
            titulares_extra[n] = {
                "razon": str(r["Razón social"]).strip(),
                "giro": None, "region": r.get("Región"),
                "pais": r.get("País"), "ciudad": None, "sitio": None,
            }

    cuentas = {}        # norm -> (datos, rol_mercado, vertical)
    for n, d in {**spine, **titulares_extra}.items():
        rol = "mandante" if n in mandantes_proy else rol_por_giro(d["giro"])
        cuentas[n] = (d, rol, vertical_de(d["giro"]))
    comp_rol = Counter(rol for _, rol, _ in cuentas.values())

    # ---- CONTACTOS (mismo filtro que el dry-run) ----
    wb = openpyxl.load_workbook(f_cont, read_only=True, data_only=True)
    ws = wb.active
    filas_total = 0; dedup = set(); contactos = []
    c_dup = 0; c_revision = 0; c_descarte = 0
    for row in ws.iter_rows(min_row=2, values_only=True):
        if all(v is None for v in row):
            continue
        filas_total += 1
        razon, fant, persona, trab, cargo, corp, pers, tel1, tel2, *_ = (list(row) + [None] * 13)[:13]
        emp = nrm_emp(razon) or nrm_emp(fant)
        corp_c, pers_c = clase_email(corp), clase_email(pers)
        email = corp if corp_c == "corporativo" else (pers if pers_c == "corporativo" else None)
        tel = str(tel1 or tel2 or "").strip() or None
        if not (email or tel):
            c_descarte += 1; continue
        if emp not in cuentas:
            c_revision += 1; continue
        key = (emp, str(email).strip().lower()) if email else (emp, "p:" + nrm(persona))
        if key in dedup:
            c_dup += 1; continue
        dedup.add(key)
        nombre = str(persona or "").strip() or "(sin nombre)"
        contactos.append((cuentas[emp][0]["razon"], nombre,
                          str(cargo).strip() if cargo is not None else None,
                          tel, str(email).strip() if email else None))

    # ------------------------------------------------------------------
    # SQL
    # ------------------------------------------------------------------
    archivos = []

    def escribir(nombre, contenido):
        ruta = os.path.join(a.salida, nombre)
        with open(ruta, "w", encoding="utf-8") as f:
            f.write(contenido)
        archivos.append((nombre, ruta))

    guardas = f"""do $$ begin
  if {ADMIN_SQL} is null then
    raise exception 'No hay admin activo: crea el perfil admin antes de cargar';
  end if;
  if public.usuario_pool() is null then
    raise exception 'Falta el usuario de sistema del pool (aplica la migración 0015)';
  end if;
  if (select count(*) from reglas_rol_contacto) < 90 then
    raise exception 'Faltan las reglas de cargo (aplica la migración 0017)';
  end if;
end $$;"""

    # 00 — lotes de importación (Ley 21.719: origen, licitud, responsable)
    escribir("carga_00_lotes.sql", f"""-- iMercados: lotes de importación (idempotente)
begin;
{guardas}
insert into importaciones (id, tipo, archivo_nombre, origen_dato, base_licitud,
                           filas_total, filas_insertadas, filas_duplicadas,
                           filas_invalidas, ejecutado_por)
values
  ('{LOTE_CONTACTOS}', 'contactos', 'BBDD_iMercados.xlsx',
   'iMercados — BBDD contactos 08-2026', 'interes_legitimo',
   {filas_total}, {len(contactos)}, {c_dup}, {c_descarte + c_revision}, {ADMIN_SQL}),
  ('{LOTE_PROYECTOS}', 'cartera_proyectos', 'imercadosproyectos20260804.xls',
   'iMercados — cartera de proyectos 04-08-2026', 'interes_legitimo',
   {len(pr)}, {len(pr)}, 0, 0, {ADMIN_SQL})
on conflict (id) do nothing;
commit;
""")

    # 01 — cuentas (pool). Idempotente por razon_social_normalizada.
    filas = []
    for n, (d, rol, vert) in cuentas.items():
        filas.append(f"({q(d['razon'])}, {q(d['giro'])}, {q(d['region'])}, "
                     f"{q(d['pais'])}, {q(d['ciudad'])}, {q(d['sitio'])}, "
                     f"'{vert}', '{rol}')")
    partes = [f"""-- iMercados: cuentas al POOL (invisible hasta reclamar) — {len(filas)} empresas
begin;
{guardas}"""]
    for i in range(0, len(filas), 1000):
        bloque = ",\n  ".join(filas[i:i + 1000])
        partes.append(f"""insert into cuentas (razon_social, giro, region, pais, ciudad, sitio_web,
                     vertical, rol_mercado, estado, propietario_id)
select v.razon, v.giro, v.region, v.pais, v.ciudad, v.sitio,
       v.vertical::vertical_cuenta, v.rol_mercado, 'prospecto', public.usuario_pool()
from (values
  {bloque}
) as v(razon, giro, region, pais, ciudad, sitio, vertical, rol_mercado)
where not exists (select 1 from cuentas c
                   where c.razon_social_normalizada = public.normalizar_empresa(v.razon));""")
    partes.append("commit;\n")
    escribir("carga_01_cuentas.sql", "\n\n".join(partes))

    # 02 — proyectos_mercado. Idempotente por (fuente_externa, id_externo).
    filas = []
    stats_etapa = Counter()
    for _, r in pr.iterrows():
        crudo = nrm(r["Etapa"])
        etapa = ETAPA_MAP.get(crudo)
        watch = crudo in WATCHLIST_SRC
        prioridad = "alta" if crudo == "redisenado" else "media"
        motivo = ("fase exploratoria" if crudo == "exploracion"
                  else "rechazado en evaluación" if crudo == "rechazado"
                  else "desistido" if crudo == "desistido"
                  else "suspendido" if crudo == "suspendido" else None)
        stats_etapa[etapa or "(por clasificar)"] += 1
        # empresa es NOT NULL: sin titular conocido → prospección explícita
        emp_q = q(r["Razón social"])
        if emp_q == "null":
            emp_q = "'Por identificar'"
        filas.append(
            f"({q(r['ID'])}, {q(r['Proyecto'])}, {emp_q}, "
            f"{q(r.get('Sector'))}, {q(r.get('Región'))}, "
            f"{'null' if etapa is None else q(etapa) + '::etapa_proyecto'}, "
            f"{'true' if watch else 'false'}, '{prioridad}', {q(motivo)}, "
            f"{q(r.get('Tipo proyecto'))}, "
            f"{musd(r.get('Inversión')) if musd(r.get('Inversión')) is not None else 'null'}, "
            f"{fecha(r.get('Puesta en marcha'))}, {fecha(r.get('Inicio construcción'))})")
    bloque = ",\n  ".join(filas)
    escribir("carga_02_proyectos.sql", f"""-- iMercados: cartera de proyectos — {len(filas)} filas
begin;
{guardas}
insert into proyectos_mercado (id_externo, nombre, empresa, rubro, region, etapa,
                               es_watchlist, prioridad, motivo_descarte, subsector,
                               capex_musd, puesta_en_marcha, inicio_construccion,
                               sector, cuenta_id, fuente, fuente_externa,
                               estado, origen_dato, base_licitud,
                               importacion_id, importado_por)
select v.id_externo, v.nombre, v.empresa, v.rubro, v.region, v.etapa,
       v.es_watchlist, v.prioridad::prioridad_proyecto, v.motivo, v.subsector,
       v.capex::numeric, v.puesta_en_marcha::date, v.inicio_construccion::date,
       c.vertical, c.id, 'iMercados', 'imercados',
       'sin_asignar', 'iMercados — cartera de proyectos 04-08-2026',
       'interes_legitimo', '{LOTE_PROYECTOS}', {ADMIN_SQL}
from (values
  {bloque}
) as v(id_externo, nombre, empresa, rubro, region, etapa, es_watchlist,
       prioridad, motivo, subsector, capex, puesta_en_marcha, inicio_construccion)
left join lateral (select c.id, c.vertical from cuentas c
                    where c.razon_social_normalizada = public.normalizar_empresa(v.empresa)
                    order by c.creado_en limit 1) c on true
on conflict (fuente_externa, id_externo)
  where fuente_externa is not null and id_externo is not null
  do nothing;
commit;
""")

    # 03.. — contactos por lotes (el trigger 0017 clasifica el rol con contexto)
    TAM = 3000
    con_email = [c for c in contactos if c[4]]
    sin_email = [c for c in contactos if not c[4]]
    idx = 3
    for grupo, etiqueta in ((con_email, "con email"), (sin_email, "solo teléfono")):
        for i in range(0, len(grupo), TAM):
            filas = [f"({q(razon)}, {q(nombre)}, {q(cargo)}, {q(tel)}, {q(email)}, "
                     f"{q('email' if email else 'llamada')})"
                     for razon, nombre, cargo, tel, email in grupo[i:i + TAM]]
            bloque = ",\n  ".join(filas)
            if etiqueta == "con email":
                conflicto = """on conflict (cuenta_id, email_normalizado)
  where email_normalizado is not null
  do nothing"""
                filtro = ""
            else:
                conflicto = ""
                filtro = """
where not exists (select 1 from contactos ct
                   where ct.cuenta_id = c.id and lower(ct.nombre) = lower(v.nombre))"""
            escribir(f"carga_{idx:02d}_contactos.sql",
                     f"""-- iMercados: contactos ({etiqueta}) — {len(filas)} filas
begin;
{guardas}
insert into contactos (cuenta_id, nombre, cargo, telefono, email, canal_preferido,
                       origen_dato, base_licitud, importacion_id)
select c.id, v.nombre, v.cargo, v.telefono, v.email, v.canal::canal_contacto,
       'iMercados — BBDD contactos 08-2026', 'interes_legitimo', '{LOTE_CONTACTOS}'
from (values
  {bloque}
) as v(razon, nombre, cargo, telefono, email, canal)
join lateral (select c.id from cuentas c
               where c.razon_social_normalizada = public.normalizar_empresa(v.razon)
               order by c.creado_en limit 1) c on true{filtro}
{conflicto};
commit;
""")
            idx += 1

    # verificación — solo agregados, nunca PII
    escribir(f"carga_{idx:02d}_verificacion.sql", f"""-- Verificación de la carga iMercados (solo agregados)
select 'cuentas en el pool' as control, count(*)::text as valor
  from cuentas where propietario_id = public.usuario_pool()
union all
select 'cuentas duplicadas por nombre (debe ser 0)',
       count(*)::text from (select razon_social_normalizada from cuentas
                             group by 1 having count(*) > 1) d
union all
select 'cuentas rol ' || coalesce(rol_mercado, '(sin rol)'), count(*)::text
  from cuentas group by rol_mercado
union all
select 'proyectos importados', count(*)::text
  from proyectos_mercado where fuente_externa = 'imercados'
union all
select 'proyectos con cuenta vinculada', count(*)::text
  from proyectos_mercado where fuente_externa = 'imercados' and cuenta_id is not null
union all
select 'proyectos en ventana caliente', count(*)::text
  from proyectos_mercado
 where fuente_externa = 'imercados' and etapa is not null and en_ventana_caliente(etapa)
union all
select 'proyectos watchlist', count(*)::text
  from proyectos_mercado where fuente_externa = 'imercados' and es_watchlist
union all
select 'proyectos prioridad alta (rediseñado)', count(*)::text
  from proyectos_mercado where fuente_externa = 'imercados' and prioridad = 'alta'
union all
select 'contactos importados', count(*)::text
  from contactos where importacion_id = '{LOTE_CONTACTOS}'
union all
select 'contactos bucket ' || bucket_rol(rol), count(*)::text
  from contactos where importacion_id = '{LOTE_CONTACTOS}' group by bucket_rol(rol)
union all
select 'cuentas con puerta pero SIN decisor (pedir derivación)', count(*)::text
  from (select ct.cuenta_id
          from contactos ct
         where ct.importacion_id = '{LOTE_CONTACTOS}'
         group by ct.cuenta_id
        having count(*) filter (where bucket_rol(ct.rol) = 'puerta_entrada') > 0
           and count(*) filter (where bucket_rol(ct.rol) = 'decisor_tecnico') = 0) s
order by 1;
""")

    # ---- resumen en pantalla (sin datos personales) ----
    print("=" * 64)
    print("GENERADOR DE CARGA iMERCADOS — archivos SQL listos")
    print("=" * 64)
    print(f"  Cuentas (spine {len(spine)} + titulares extra {len(titulares_extra)}): {len(cuentas)}")
    for rol in ("mandante", "epc", "contratista", "otro"):
        print(f"    rol_mercado {rol:12s}: {comp_rol.get(rol, 0)}")
    print(f"  Proyectos: {len(pr)} (colapsados {proy_colapsados} duplicados de "
          f"nombre+empresa: queda la instantánea de ID más reciente)")
    print(f"    etapas: {dict(stats_etapa)}")
    print(f"  Contactos que entran: {len(contactos)} "
          f"(con email {len(con_email)} · solo teléfono {len(sin_email)})")
    print(f"    duplicados {c_dup} · revisión (sin cuenta) {c_revision} · descarte {c_descarte}")
    print("\nArchivos generados (aplicar EN ORDEN):")
    for nombre, ruta in archivos:
        kb = os.path.getsize(ruta) // 1024
        print(f"  {nombre}  ({kb} KB)")
    print("\n⚠️  El SQL contiene datos personales: NO subirlo al repo ni a git.")

if __name__ == "__main__":
    main()
