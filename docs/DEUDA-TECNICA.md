# Deuda técnica — decisiones conscientes pendientes

> Registro de riesgos aceptados a sabiendas, con su motivo y su costo de cierre.
> Regla: nada se publica a producción sin revisar este archivo.

---

## DT-001 · La Data API queda expuesta al navegador (fork abierto)

- **Estado:** aceptada el 2026-08-05 · **revisar antes de publicar (F5)**
- **Qué es:** el navegador habla directo con la Data API de Neon
  (`NEXT_PUBLIC_DATA_API_URL`, `apps/web/lib/supabase/navegador.ts`) usando un
  JWT que el propio usuario puede extraer con las devtools. Consecuencia:
  cualquier control que viva en el servidor Next o en la UI (botones, rate
  limit del proxy, auditoría de peticiones del proxy) es **opcional** para un
  usuario malicioso — copia el JWT y le pega a la Data API con `curl`.
- **Por qué se aceptó:** el riesgo real (barrer la base completa) quedó cerrado
  **dentro de Postgres** con la migración 0015: perímetro por propiedad (pool
  invisible), PII por privilegio de columna, revelación con cuota y registro,
  reclamo con tope auditado. Nada de eso se salta con el JWT crudo.
- **Qué NO cubre mientras el fork siga abierto:**
  - rate-limiting fino de peticiones (solo existe la cuota de revelaciones);
  - auditoría de **cada** lectura de listas (solo se auditan los eventos de
    alta señal: reclamo, liberación, revelación);
  - revocación instantánea de un JWT ya emitido (expira solo).
- **Costo de cerrarlo:** enrutar todos los datos por el servidor Next (route
  handlers / server actions) con un token que nunca baja al cliente. Un
  ida-y-vuelta extra por lectura y reescritura del cliente de datos. Al
  cerrarlo, el rate-limit y la auditoría total de lecturas pasan a ser reales.
- **Cuándo:** F5 (publicación), junto con el despliegue en Vercel.

## DT-002 · `db-max-rows` de la Data API sin confirmar

- **Estado:** por verificar en la consola de Neon (proyecto dev).
- **Qué es:** el tope de filas por respuesta del PostgREST de Neon. Nuestro
  perímetro no depende de él (la RLS acota el universo y el directorio
  impone su propio `LIMIT 100`), pero es una capa extra barata.
- **Acción:** confirmar valor/configurabilidad y anotarlo aquí.

## DT-003 · La cuota diaria de revelaciones corre en día UTC

- **Estado:** aceptada (documentada en `revelar_contactos`, migración 0015).
- **Qué es:** "25 al día" se corta a medianoche UTC (20:00–21:00 en Chile
  según horario). Con 14 países no hay un huso "correcto" único.
- **Costo de cambiarlo:** trivial (usar el huso del equipo del usuario), pero
  agrega estado; se revisa si el equipo lo nota en la práctica.

## DT-004 · La PII de `leads` no pasa por el flujo de revelación

- **Estado:** aceptada.
- **Qué es:** `leads.telefono/email` siguen siendo columnas legibles para el
  dueño del lead (y gerente/admin/lectura vía RLS). Es captación manual de
  bajo volumen — el riesgo de extracción masiva vive en `contactos`
  (11.318 filas iMercados), no aquí.
- **Revisar si:** los leads llegan a cargarse por lotes; en ese caso deben
  entrar como contactos del pool, no como leads.

## DT-005 · Revelado móvil pendiente

- **Estado:** aceptada (la app móvil está en fase de esqueleto).
- **Qué es:** con 0015, la pantalla de cuenta del móvil muestra los contactos
  sin teléfono/correo (degrada con gracia: "sin datos de contacto"). El botón
  de revelación con cuota existe solo en web.
- **Cuándo:** al retomar la fase móvil (Fase 2 móvil).
