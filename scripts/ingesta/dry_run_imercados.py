#!/usr/bin/env python3
"""
DIPREM — Dry-run de ingesta iMercados (Fase 8b).

Analiza y proyecta la carga de las 4 bases (empresas, empresas·productos,
proyectos, contactos) SIN escribir nada en la base de datos y SIN emitir ningún
dato personal: la salida son solo conteos agregados.

Reglas alineadas con la migración 0014 y las decisiones aprobadas:
  · EMPRESAS = spine de `cuentas` (match por nombre normalizado; no hay RUT).
  · rol_mercado: mandante si es titular de un proyecto; si no, por giro.
  · Proyectos: mapeo de etapa (con los ajustes de los 17 raros), ventana caliente.
  · Contactos: correo por dominio (Ley 21.719), clasificación de cargo,
    match de empresa al spine → cargables vs revisión manual vs descarte.

Uso:
  python3 scripts/ingesta/dry_run_imercados.py --dir /ruta/fuera/del/repo
Requiere: pandas, openpyxl, lxml.  NO subir los archivos fuente al repo.
"""
import argparse, glob, os, re, sys, unicodedata
from collections import Counter

try:
    import pandas as pd
    import openpyxl
except ImportError:
    sys.exit("Faltan dependencias: pip install pandas openpyxl lxml")

# ---------------------------------------------------------------------------
def nrm(s):
    """Normaliza texto: minúsculas, sin tildes, sin puntuación (para comparar)."""
    if s is None:
        return ""
    s = str(s)
    if s.strip().lower() in ("nan", "none"):
        return ""
    s = "".join(c for c in unicodedata.normalize("NFD", s.strip().lower())
                if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s)).strip()

def nrm_emp(s):
    """Como nrm pero quita sufijos societarios (match de empresas)."""
    s = nrm(s)
    s = re.sub(r"\b(s a c|s p a|s a|spa|e i r l|ltda|limitada|inc|corp|llc|sociedad anonima)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()

PERSONALES = {"gmail","hotmail","yahoo","outlook","live","icloud","aol","msn",
              "gmx","ymail","protonmail","proton","me","hotmial","gmai"}
def clase_email(e):
    if not e or str(e).strip().lower() in ("nan","none"):
        return "vacio"
    m = re.search(r"@([^@\s,;]+)", str(e).strip().lower())
    if not m:
        return "invalido"
    return "personal" if m.group(1).split(".")[0] in PERSONALES else "corporativo"

# 23 reglas de clasificación de cargo (migración 0011)
REGLAS_CARGO = [
 ("gerente de proyecto","gerente_proyecto"),("director de proyecto","gerente_proyecto"),
 ("project manager","gerente_proyecto"),("jefe de proyecto","gerente_proyecto"),
 ("gerente de construccion","gerente_construccion"),("construction manager","gerente_construccion"),
 ("superintendente de construccion","gerente_construccion"),("jefe de terreno","gerente_construccion"),
 ("contrato","contratos_abastecimiento"),("abastecimiento","contratos_abastecimiento"),
 ("procurement","contratos_abastecimiento"),("compras","contratos_abastecimiento"),
 ("calidad","calidad_qaqc"),("qa/qc","calidad_qaqc"),("qaqc","calidad_qaqc"),("qc","calidad_qaqc"),
 ("quality","calidad_qaqc"),("hse","hse"),("prevencion","hse"),("ssoma","hse"),
 ("seguridad","hse"),("medio ambiente","hse"),("gerente general","otro"),
]
def clasificar_cargo(cargo):
    c = nrm(cargo)
    for pat, rol in REGLAS_CARGO:
        if nrm(pat) in c:
            return rol
    return "sin_clasificar"

# Reglas de rol_mercado por giro (migración 0014)
REGLAS_MERCADO = [
 ("servicios de ingenieria","epc"),("ingenieria y actividades conexas","epc"),
 ("consultoria","contratista"),("construccion","contratista"),
 ("actividades de apoyo para la explotacion","contratista"),("servicios de apoyo","contratista"),
 ("venta al por mayor","contratista"),("arriendo","contratista"),("transporte","contratista"),
 ("montaje","contratista"),("generacion de energia","mandante"),("transmision","mandante"),
 ("distribucion de energia","mandante"),("mineria","mandante"),("extraccion","mandante"),
 ("explotacion de mina","mandante"),("petroleo","mandante"),("gas natural","mandante"),
 ("captacion","mandante"),("sanitari","mandante"),("infraestructura","mandante"),("concesion","mandante"),
]
def rol_por_giro(giro):
    g = nrm(giro)
    for pat, rol in REGLAS_MERCADO:
        if nrm(pat) in g:
            return rol
    return "otro"

# Mapeo de etapa iMercados → etapa DIPREM (+ ajustes de los 17 raros)
ETAPA_MAP = {
 "exploracion":"exploracion","prefactibilidad":"prefactibilidad","factibilidad":"factibilidad",
 "ingenieria de detalle":"ingenieria_detalle","construccion":"construccion","operando":"operacion",
 "suspendido":"paralizado","desistido":"cerrado","rechazado":"cerrado","conceptual":"perfil",
 "cierre":"operacion",  # cierre de faena → Pilar 2 (plan de cierre/ambiental)
 # "rediseñado" y "" → None ("por clasificar")
}
HOT = {"ingenieria_detalle","en_licitacion","construccion","comisionamiento"}
TEMPRANO = {"perfil","prefactibilidad","factibilidad"}  # pipeline temprano, aún sin ventana caliente
WATCHLIST_SRC = {"exploracion","rechazado"}   # descarte NO definitivo
# nrm() ya quitó la ñ de "Rediseñado" → "redisenado". Vacío/rediseñado = por clasificar
# (rediseñado se marca prioridad alta al cargar; aquí solo se cuenta).
PORCLASIF_SRC = {"", "nan", "redisenado"}

def musd(x):
    m = re.search(r"([\d\.]+,\d+|\d[\d\.]*)", str(x))
    return float(m.group(1).replace(".","").replace(",",".")) if m else None

# ---------------------------------------------------------------------------
def encontrar(d, *frags):
    for f in glob.glob(os.path.join(d, "*")):
        base = os.path.basename(f).lower()
        if all(fr in base for fr in frags):
            return f
    return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, help="carpeta con los 4 archivos (fuera del repo)")
    a = ap.parse_args()
    d = a.dir
    f_cont = encontrar(d, "bbdd") or encontrar(d, "imercados", ".xlsx")
    f_emp  = encontrar(d, "empresas4")
    f_prod = encontrar(d, "empresasproductos")
    f_proy = encontrar(d, "proyectos")
    for nom, f in [("contactos",f_cont),("empresas",f_emp),("productos",f_prod),("proyectos",f_proy)]:
        if not f: sys.exit(f"No encontré el archivo de {nom} en {d}")

    print("="*66)
    print("DIPREM · DRY-RUN INGESTA iMERCADOS  (no escribe nada)")
    print("="*66)

    # ---- EMPRESAS (spine) ----
    em = pd.read_html(f_emp)[0]
    em["n"] = em["Razón social"].map(nrm_emp)
    em = em[em["n"] != ""]
    spine = {}                       # nombre_norm -> giro
    for _, r in em.iterrows():
        spine.setdefault(r["n"], str(r["Giro"]))

    # ---- PROYECTOS (para saber quién es mandante-de-proyecto) ----
    pr = pd.read_html(f_proy)[0]
    pr["mand"] = pr["Razón social"].map(nrm_emp)
    mandantes_proy = set(pr["mand"]) - {""}

    # rol_mercado por empresa (señal fuerte: titular de proyecto)
    rol_mercado = {}
    for n, giro in spine.items():
        rol_mercado[n] = "mandante" if n in mandantes_proy else rol_por_giro(giro)
    comp_rol = Counter(rol_mercado.values())

    # ---- CONTACTOS ----
    wb = openpyxl.load_workbook(f_cont, read_only=True, data_only=True); ws = wb.active
    c_total=0; c_emp=Counter(); dedup=set()
    c_entran=0; c_revision=0; c_descarte=0; c_dup=0
    email_personal_desc=0; sin_clasif=0
    cont_por_empresa=Counter()
    for row in ws.iter_rows(min_row=2, values_only=True):
        if all(v is None for v in row): continue
        c_total+=1
        razon,fant,persona,trab,cargo,corp,pers,tel1,tel2,*_=(list(row)+[None]*13)[:13]
        emp = nrm_emp(razon) or nrm_emp(fant)
        if emp: cont_por_empresa[emp]+=1
        # correo por dominio (Ley 21.719)
        corp_c, pers_c = clase_email(corp), clase_email(pers)
        email_corp = corp if corp_c=="corporativo" else (pers if pers_c=="corporativo" else None)
        if (corp_c=="personal") or (pers_c=="personal"): email_personal_desc+=1
        tiene_tel = bool(tel1 or tel2)
        prof = bool(email_corp) or tiene_tel        # ≥1 dato profesional
        if clasificar_cargo(cargo)=="sin_clasificar": sin_clasif+=1
        # categorías dry-run
        if not prof:
            c_descarte+=1; continue
        if emp not in spine:
            c_revision+=1; continue                 # empresa no está en el spine → revisión
        # dedup intra-archivo por (empresa, correo corporativo)
        key=(emp, str(email_corp).strip().lower()) if email_corp else (emp, "p:"+nrm(persona))
        if key in dedup: c_dup+=1; continue
        dedup.add(key); c_entran+=1

    # empresas de contactos que NO están en el spine (cuentas nuevas / revisión)
    comp_contactos = set(cont_por_empresa)
    comp_fuera_spine = comp_contactos - set(spine)

    # ---- PROYECTOS: buckets ----
    def etapa_de(x):
        return ETAPA_MAP.get(nrm(x))              # None si rediseñado/vacío
    en_ventana=0; pipeline=0; prospeccion=0; temprano=0; om=0; watch=0; porclasif=0; descarte=0
    redisenado=0; proy_con_cuenta=0
    for _, r in pr.iterrows():
        et = etapa_de(r["Etapa"]); crudo = nrm(r["Etapa"])
        mand = r["mand"]
        tiene_cuenta = bool(mand) and (mand in spine or mand in comp_contactos)
        if tiene_cuenta: proy_con_cuenta+=1
        tiene_contacto = bool(mand) and cont_por_empresa.get(mand,0) > 0
        if crudo in PORCLASIF_SRC:
            porclasif+=1
            if crudo=="redisenado": redisenado+=1
        elif crudo in WATCHLIST_SRC:
            watch+=1
        elif et in ("paralizado","cerrado"):
            descarte+=1
        elif et=="operacion":
            om+=1
        elif et in HOT:
            en_ventana+=1
            if tiene_contacto: pipeline+=1
            else: prospeccion+=1
        elif et in TEMPRANO:
            temprano+=1
        else:
            porclasif+=1        # etapa inesperada → revisión, nunca se pierde

    print("\n── EMPRESAS → cuentas (spine, por nombre; SIN RUT) ──")
    print(f"  Empresas distintas (spine)        : {len(spine)}")
    print(f"  rol_mercado  mandante(cliente)    : {comp_rol.get('mandante',0)}")
    print(f"               epc                  : {comp_rol.get('epc',0)}")
    print(f"               contratista          : {comp_rol.get('contratista',0)}")
    print(f"               otro/revisar         : {comp_rol.get('otro',0)}")
    print(f"  Empresas que son titular de proy. : {len(mandantes_proy & set(spine))} (cliente seguro)")

    total_proy = len(pr)
    suma_proy = en_ventana+temprano+om+watch+porclasif+descarte
    print(f"\n── PROYECTOS → proyectos_mercado ({total_proy}) ──")
    print(f"  Con mandante vinculable a cuenta  : {proy_con_cuenta}")
    print(f"  🔥 Ventana caliente (det/lic/const): {en_ventana}")
    print(f"     🎯 PIPELINE (empresa+contacto) : {pipeline}")
    print(f"     🔎 PROSPECCIÓN (sin contacto)  : {prospeccion}")
    print(f"  🌱 Pipeline temprano (perfil/pref/fact): {temprano}  (seguimiento, aún sin ventana)")
    print(f"  ♻️  O&M/HSE (operando + cierre)    : {om}")
    print(f"  👁  Watchlist (exploración/rechaz) : {watch}")
    print(f"  ⏳ Por clasificar (vacío/rediseñado): {porclasif}  (de ellos {redisenado} rediseñado → prioridad alta)")
    print(f"  🗑  Descarte definitivo (desist/susp): {descarte}")
    print(f"     · suma: {suma_proy} de {total_proy}" + ("  ✅" if suma_proy==total_proy else "  ⚠️ NO CUADRA"))

    print("\n── CONTACTOS → contactos (13.936) ──")
    print(f"  ✅ ENTRAN (cargables)             : {c_entran}")
    print(f"  🔁 DUPLICADOS (intra-archivo)     : {c_dup}")
    print(f"  📋 REVISIÓN MANUAL (empresa no en spine): {c_revision}")
    print(f"  🗑  DESCARTE (sin dato profesional): {c_descarte}")
    print(f"     · suma: {c_entran+c_dup+c_revision+c_descarte} de {c_total}")
    print(f"  ⚠️  Correos personales descartados : {email_personal_desc}  (Ley 21.719)")
    print(f"  🏷  Cargos sin_clasificar (23 reglas): {sin_clasif}  (afinable antes de cargar)")
    print(f"  🏢 Empresas de contactos fuera del spine: {len(comp_fuera_spine)}  → cuentas nuevas / revisión")
    print("\n(NO se escribió nada. Números para decidir; la carga real es un paso aparte.)")

if __name__ == "__main__":
    main()
