# Demo de gestión comercial (rama Neon `demo`)

La demo vive en una **rama de Neon**, no en una rama de git: el código es el
mismo — lo que cambia son los DATOS. Así la gestión ficticia jamás contamina
las métricas reales de `dev`.

## Montarla (una vez)

1. **Consola Neon → Branches → New branch**: nombre `demo`, padre `dev`
   (nace con el esquema + la carga iMercados completa, copy-on-write).
2. En la rama `demo`, activa **Auth** y **Data API** igual que en dev
   (sin marcar "grant public schema access") y copia sus dos URLs.
3. Siembra (PowerShell, con la cadena de conexión de la rama **demo**):

   ```powershell
   $env:DATABASE_URL = "<cadena de la rama demo>"
   pnpm db:aplicar scripts/demo/demo_gestion.sql
   ```

   El script se niega a correr dos veces y a correr sobre una rama sin la
   carga iMercados. Al final imprime el resumen de control.

## Alternar entre demo y trabajo real

La app apunta a una rama según **dos líneas** de `apps/web/.env.local`:

```
NEON_AUTH_BASE_URL=…        ← Auth de la rama (dev o demo)
NEXT_PUBLIC_DATA_API_URL=…  ← Data API de la rama (dev o demo)
```

- **Ver la demo:** pon las URLs de la rama `demo`, reinicia `pnpm dev`,
  entra con tu mismo login de siempre (los 6 ejecutivos no inician sesión;
  la demo se mira como dueño).
- **Volver al trabajo real:** restaura las URLs de `dev` y reinicia.
  Consejo: guarda ambos pares comentados en el mismo `.env.local` y alterna
  comentando/descomentando.

Los datos nunca se mezclan: son ramas de base de datos distintas.

## Refrescar o eliminar

- **Refrescar** (fechas al día): borra la rama `demo` en la consola y repite
  el montaje (1 minuto).
- **Eliminar**: borra la rama. Nada de la demo existe fuera de ella.

## El guion (para presentarla)

| Ejecutivo | Historia | Dónde se ve |
|---|---|---|
| Valentina Rojas | La estrella: 80% cobertura, 69% respuesta, 2 decisores, 1 adjudicación HSE | Control (abajo del cuadro = bien), Radar Codelco/Collahuasi |
| Matías Herrera | El acaparador: 18 cuentas, 3 trabajadas; Zaldívar y Antamina sin tocar | **Rojo arriba de Control** + botón Liberar |
| Sofía Paredes | LA TRAMPA: #1 en actividades (56), 10% respuesta, 0 decisores, 42% cobertura, 2 huérfanas | Cuadro: mucha actividad ≠ resultado |
| Diego Fuentes | Sólido: 78% cobertura, 1 decisor, embudo en movimiento | Cuadro + decisores 30d |
| Camila Soto | En desarrollo: cartera chica, derivación en curso | Detalle de cuenta (banner derivación) |
| Rodrigo Vega | Bajo y no registra: 25% cobertura, tasa "s/registro" | Cuadro: no anotar también se ve |

Reporte diario: `/control/diario` — pensado para el celular, sin zoom.
