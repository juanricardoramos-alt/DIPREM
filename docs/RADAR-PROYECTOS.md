# Radar de Proyectos — requisitos aprobados

> Pantalla de gestión sobre la cartera iMercados (Fase 8b). Se construye SOBRE
> los datos reales ya cargados, no sobre maqueta (decisión 2026-08-05).
> Mockup de referencia: artefacto "Radar de Proyectos" (sesión 2026-08-04).

## Columnas de la fila (aprobadas)

- Proyecto · empresa titular (→ cuenta) · región
- **Etapa (editable)** — el dato de origen envejece; el ejecutivo la corrige
  con auditoría. Semáforo de ventana caliente (`en_ventana_caliente`).
- CAPEX (MUSD) · **inicio de construcción** y **puesta en marcha visibles**
  (definen cuánto tiempo hay para entrar).
- Estado de contactos de la cuenta (ver requisito estrella abajo).
- Ejecutivo asignado + **fecha del último contacto en la fila**.

## Filtros (aprobados)

- Por cubeta: ventana caliente / pipeline temprano / O&M-HSE / watchlist /
  por clasificar (rediseñado = prioridad alta) / descarte.
- **Por ejecutivo, con el estado "sin asignar" visible de entrada.**
- Proveedores (epc/contratista) **ocultos por defecto, con interruptor** —
  un EPC puede ser cliente de Pilar 3 (control documental de subcontratistas).
- Watchlist reversible: exploración/rechazado se vigilan, no se borran.

## ⭐ Requisito estrella: la derivación como acción, no como dato

Regla aprobada 2026-08-05: cuando una cuenta tiene contactos de
**puerta de entrada** pero **ningún decisor técnico**, la fila debe mostrar
una **acción pendiente concreta** — *"pedir derivación al gerente de
proyecto"* — no un dato al pasar.

Contexto que lo justifica (carga real 08-2026): de 11.317 contactos cargados
solo **1.354 son decisores técnicos** y 213 gestores de compra; hay **2.079
cuentas con puerta sin decisor** (query en `carga_08_verificacion.sql`).
Conseguir al decisor vía la puerta ES el trabajo principal del equipo
comercial — la pantalla debe empujarlo en cada fila y contarlo como métrica
de avance (cuentas que pasaron de "solo puerta" a "con decisor").

Insumos ya en BD: `bucket_rol(contactos.rol)` (0017), clasificación
contextual por `rol_mercado` (comerciales de proveedores no cuentan como
puerta), `peso_decision` para ordenar a quién pedirle la derivación.

## Flujo del ejecutivo (perímetro 0015)

1. Radar/directorio (sin PII) → identifica proyecto y cuenta.
2. `reclamar_cuenta()` (tope de cartera) → entra a "Mi cartera".
3. `revelar_contactos()` (cuota diaria, registrado) → PII visible.
4. Sin decisor → acción "pedir derivación" sobre el mejor contacto puerta.
5. `liberar_cuenta()` si no prospera (higiene del tope).
