# 🚀 DIPREM CRM — Plataforma de Gestión Comercial + CRM (Móvil y PC)

> **Memoria persistente del proyecto.** Claude Code lee este archivo en cada sesión.
> Especificación funcional completa del CRM de DIPREM. La terminología y el proceso
> provienen de los brochures oficiales — ver `docs/CONTEXTO-DIPREM.md` (fuente de
> verdad del negocio) y `docs/PLAN-ARQUITECTURA.md` (plan técnico aprobable).

---

## [1] Contexto de la empresa

- **Empresa:** DIPREM (Diprem.com) — multinacional de servicios industriales, +20 años en la región.
- **Industria / rubro:** servicios profesionales para industria — gestión de proyectos, QA/QC, seguridad y salud ocupacional (SSO/HSE), medio ambiente y control de contratistas. Clientes en **minería, energía, infraestructura, construcción e industria**.
- **Qué vende:** servicios B2B agrupados en **3 pilares**:
  1. **Dirección y Gestión de Proyectos + QA/QC** — supervisión técnica, control de calidad, precomisionamiento/comisionamiento, puesta en marcha, auditorías técnicas, outsourcing de personal e inspectores.
  2. **Seguridad, Salud Ocupacional y Medio Ambiente** (el brochure global incluye además *Sistema de Gestión de Calidad* en este pilar) — sistemas de gestión SSO, higiene y seguridad en obras, seguridad en procesos, capacitaciones, auditorías HSE, programas LOTO/ATS/AST, medicina laboral, huella de carbono, permisos ambientales, evaluación de impactos, PGA, asesoría ambiental mensual.
  3. **Evaluación de Proveedores, Control de Contratistas y Desarrollo Tecnológico** — control documental digital, evaluación/auditoría de proveedores, gestión contractual, plataformas de registro y cumplimiento, trazabilidad.
- **Tipo de venta:** B2B · Ciclo de venta: **largo** (propuestas, licitaciones, adjudicaciones). Modalidades: proyecto puntual, contrato mensual recurrente, outsourcing de personal.
- **Tamaño del equipo comercial:** multi-país (pendiente de confirmar nº exacto — ver `docs/CONTEXTO-DIPREM.md §5`). El sistema soporta N ejecutivos y gerentes por equipo/oficina.
- **Zonas o sucursales:** +10 oficinas en 14 países (Chile, Argentina, Colombia, Brasil, México, Perú, EEUU, Canadá, Puerto Rico, Rep. Dominicana, Uruguay, Panamá, Bolivia, Guatemala) → **multi-equipo y multi-moneda obligatorios**.
- **Proceso comercial actual:** captación por referidos/licitaciones/red comercial → reunión de levantamiento → propuesta técnico-económica → negociación → adjudicación (pendiente de confirmar detalles y herramientas actuales).
- **Herramientas actuales:** pendiente de confirmar (asumido: Excel/WhatsApp/correo; sin CRM central).
- **Dolores principales:** falta de una sola fuente de verdad comercial multi-país, seguimiento manual de propuestas de ciclo largo, poca visibilidad gerencial del pipeline y de la gestión diaria en terreno.
- **Cuentas de referencia:** MILICIC, CAN II, GANFENG, WORLEY, FIRST QUANTUM (minería, Argentina).

> 📎 **Regla de oro:** toda la UI y los datos hablan el idioma DIPREM — *pilares*,
> *líneas de servicio*, *propuestas*, *adjudicado*, *faena/obra*, *asesoría mensual* —
> no genéricos de CRM.

---

## [2] Objetivo del proyecto

Construir una **plataforma de gestión comercial con un CRM integrado**, que funcione tanto en **aplicación móvil (iOS/Android)** como en **PC (navegador web)**, con la misma cuenta y datos sincronizados.

El corazón del producto es darle a cada **ejecutivo comercial** una vista clara de **su gestión diaria** (qué tiene que hacer hoy, a quién dar seguimiento, cómo va contra su meta), y darle a la **gerencia** visibilidad del desempeño del equipo en tiempo real.

**Principios de diseño:**
- **Móvil primero, sin fricción:** el ejecutivo registra su gestión en segundos, incluso desde una faena o en terreno.
- **Una sola fuente de verdad:** todo dato de cliente, oportunidad y actividad vive en un solo lugar.
- **Datos que se convierten en acción:** cada dashboard debe sugerir qué hacer, no solo mostrar números.
- **Trazabilidad total:** DIPREM vende cumplimiento y trazabilidad; su CRM debe ser ejemplo de ello (auditoría de cambios, historial completo).

---

## [3] Roles y permisos (RBAC)

| Rol | Qué puede hacer |
|---|---|
| **Ejecutivo Comercial** | Gestiona sus clientes, oportunidades y actividades. Ve su propio dashboard y metas. |
| **Gerente / Supervisor Comercial** | Todo lo del ejecutivo + ve el desempeño de su equipo (país/oficina), reasigna carteras, aprueba propuestas. |
| **Administrador** | Configura embudos, líneas de servicio, metas, usuarios y permisos. Acceso total. |
| **Solo lectura** | Gerencia general / finanzas que solo consultan reportes. |

RBAC desde el inicio (RLS en base de datos): cada usuario solo ve lo que le corresponde.

---

## [4] Stack tecnológico (confirmado)

Monorepo TypeScript de punta a punta:

- **Monorepo:** Turborepo + pnpm workspaces
- **Web (PC):** Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Móvil (iOS/Android):** Expo (React Native) + TypeScript + NativeWind
- **Backend + BD:** **Supabase** (PostgreSQL + Auth + Storage + Realtime + Edge Functions)
- **Estado y datos:** TanStack Query (server state) + Zustand (estado local)
- **Validación:** Zod (esquemas compartidos web/móvil)
- **Notificaciones push:** Expo Notifications
- **Paquetes compartidos:** tipos TS, cliente de API, validaciones y lógica de dominio

Detalles, alternativas evaluadas y estructura de carpetas: `docs/PLAN-ARQUITECTURA.md`.

---

## [5] Módulos funcionales

### 5.1 CRM Core
- **Cuentas** (empresas cliente): razón social, RUT/CUIT/tax id, vertical (minería, energía, infraestructura, construcción, industrial, oil & gas, otro), país, historial completo.
- **Contactos:** personas dentro de cada cuenta (cargo, teléfono, correo, canal preferido).
- **Leads / Prospectos:** captación, fuente (referido, licitación, web, evento, LinkedIn, red comercial), calificación (frío/tibio/caliente), conversión a cuenta + oportunidad.
- **Oportunidades:** monto estimado + **moneda**, probabilidad, fecha estimada de cierre, etapa del embudo, **pilar y línea de servicio**, modalidad de contrato (proyecto / mensual recurrente / outsourcing), motivo de pérdida.
- **Embudo de ventas** con etapas **configurables**. Embudo DIPREM por defecto:
  `Prospecto → Contactado → Reunión / Levantamiento → Propuesta enviada → Negociación → Adjudicado ✅ / Perdido ❌`
  Vista Kanban en PC y de tarjetas en móvil.
- **Actividades:** `llamada`, `reunion`, `visita_terreno` (faena/obra/planta), `email`, `whatsapp`, `tarea`. Cada una con tipo, resultado, notas y **próxima acción**.
- **Historial de interacciones:** línea de tiempo por cuenta y por oportunidad.

### 5.2 ⭐ Gestión diaria del ejecutivo *(el foco principal)*
Pantalla estrella, abre por defecto en el móvil:
- **"Mi Día":** agenda del día con reuniones, visitas a terreno y tareas pendientes ordenadas por hora/prioridad.
- **Seguimientos pendientes:** cuentas/oportunidades que requieren acción hoy, con alertas de las que llevan mucho sin contacto (ciclo largo ⇒ el sistema recuerda, no la memoria del ejecutivo).
- **Registro rápido de gestión:** botones de acción rápida (registrar llamada, agendar visita, marcar tarea hecha) en 1–2 toques.
- **Avance de metas:** barra de progreso del ejecutivo vs. su cuota del mes (monto adjudicado, actividades, propuestas enviadas, oportunidades nuevas).
- **Resumen de fin de día:** qué se hizo, qué quedó pendiente y qué se planifica para mañana.
- **Recordatorios y notificaciones push:** "Tienes una visita a faena en 1 hora", "Hace 7 días sin contactar a GANFENG", "Propuesta X lleva 14 días sin respuesta".
- *(Opcional / motivación):* rachas y ranking sano dentro del equipo.

### 5.3 Gestión comercial
- **Catálogo de servicios** agrupado por pilar y línea, con precio referencial, moneda y unidad (hora / mes / proyecto / HH).
- **Propuestas:** generación desde una oportunidad, versiones, **aprobación por gerencia**, envío al cliente en PDF con formato DIPREM.
- **Adjudicaciones / contratos cerrados:** registro, modalidad y estado.
- *(Integración opcional):* facturación electrónica (SII Chile / AFIP Argentina) o conexión con ERP existente — Fase 5.

### 5.4 Dashboards y analítica
- **Dashboard del Ejecutivo:** KPIs personales (conversión, pipeline por moneda, actividades, cumplimiento de meta).
- **Dashboard del Gerente:** desempeño por ejecutivo y por equipo/país, ranking, embudo agregado, forecast del mes/trimestre.
- **KPIs clave:** tasa de conversión por etapa, valor del pipeline (por pilar, vertical y moneda), actividades realizadas, ciclo de venta promedio, cumplimiento de cuota, oportunidades adjudicadas/perdidas y motivos de pérdida.
- **Reportes exportables** (Excel/PDF), filtros por periodo, país/equipo, pilar, línea de servicio, vertical y ejecutivo.

### 5.5 Notificaciones
- Push (móvil) + in-app + recordatorios programados.
- Alertas gerenciales: oportunidad grande estancada, propuesta pendiente de aprobación, ejecutivo bajo meta.

### 5.6 Administración
- Configuración de etapas del embudo, campos personalizados, pilares/líneas/servicios, precios.
- Gestión de usuarios, roles, equipos (país/oficina) y metas.
- **Registro de auditoría** (quién cambió qué, cuándo, valores antes/después).

---

## [6] Modelo de datos

Esquema completo con SQL, RLS y seeds en `docs/PLAN-ARQUITECTURA.md §4`. Resumen:

```
usuarios          (id→auth, nombre, email, rol, equipo_id, activo)
equipos           (id, nombre, pais, moneda_default, gerente_id)  -- oficina/país
dispositivos_push (id, usuario_id, expo_push_token, plataforma)   -- push Expo
cuentas           (id, razon_social, tax_id, vertical, pais, propietario_id,
                   estado, atributos jsonb)
contactos         (id, cuenta_id, nombre, cargo, telefono, email, canal_preferido)
leads             (id, nombre, empresa, fuente, calificacion, propietario_id,
                   estado, convertido_cuenta_id, convertido_oportunidad_id,
                   atributos jsonb)
pilares           (id, numero, nombre)                            -- los 3 pilares
lineas_servicio   (id, pilar_id, nombre)      -- ej: SSO / Medio Ambiente / SGC (P2)
servicios         (id, pilar_id, linea_servicio_id, nombre, descripcion, unidad,
                   precio_referencial, moneda, activo)
etapas_embudo     (id, nombre, orden, probabilidad_default, es_ganada, es_perdida)
motivos_perdida   (id, nombre, activo)        -- catálogo reportable, no texto libre
oportunidades     (id, cuenta_id, propietario_id, etapa_id, pilar_id,
                   linea_servicio_id, servicio_id, nombre, monto, moneda,
                   modalidad_contrato, probabilidad, fecha_cierre_estimada,
                   motivo_perdida_id, motivo_perdida_detalle, cerrada_en,
                   ultimo_contacto_en, atributos jsonb)
actividades       (id, tipo, asunto, cuenta_id, oportunidad_id, contacto_id,
                   propietario_id, fecha_programada, fecha_vencimiento, estado,
                   resultado, notas, proxima_accion, completada_en)
notas             (id, entidad, entidad_id, autor_id, contenido, creado_en)
propuestas        (id, oportunidad_id, version, total, moneda, estado, pdf_url,
                   aprobada_por, enviada_en)
propuesta_items   (id, propuesta_id, servicio_id, descripcion, cantidad, unidad,
                   precio_unitario, subtotal)  -- líneas del PDF de propuesta
adjudicaciones    (id, oportunidad_id, propuesta_id, modalidad, fecha_inicio,
                   fecha_fin, estado, monto, moneda)  -- contrato resultante
metas             (id, usuario_id, periodo, tipo, objetivo, moneda)
notificaciones    (id, usuario_id, tipo, titulo, mensaje, entidad, entidad_id,
                   leida, creado_en)
definiciones_campo(id, entidad, clave, etiqueta, tipo, opciones, activo)
                                              -- campos personalizados (admin)
auditoria         (id, usuario_id, accion, entidad, entidad_id, cambios, creado_en)
```

Tipos de actividad: `llamada`, `reunion`, `visita_terreno`, `email`, `whatsapp`, `tarea`.
Modalidades de contrato: `proyecto`, `mensual_recurrente`, `outsourcing`.
Estados de propuesta: `borrador`, `pendiente_aprobacion`, `aprobada`, `enviada`, `aceptada`, `rechazada`.
Metas (`tipo`): `monto_adjudicado`, `propuestas_enviadas`, `actividades`, `oportunidades_nuevas`.
Campos personalizados: definiciones en `definiciones_campo` + valores en columna `atributos jsonb` de cuentas/leads/oportunidades.

---

## [7] Diseño y experiencia (UX)

- **Móvil primero y responsive:** perfecto en celular, adaptado a pantalla grande en PC.
- **Registro sin fricción:** mínimos toques; formularios cortos con valores por defecto inteligentes (última cuenta visitada, tipo de actividad más usado).
- **Modo offline en móvil (Fase 5):** registrar actividades sin señal (faenas mineras remotas) y sincronizar al recuperar conexión.
- **Interfaz limpia y profesional, en español**, con acciones rápidas siempre a mano.
- **Carga rápida** y navegación clara: Mi Día · Cuentas · Oportunidades · Reportes.

---

## [8] Requisitos no funcionales

- **Seguridad:** Supabase Auth, RLS por rol en todas las tablas, cifrado en tránsito y reposo, sesiones seguras.
- **Escalabilidad:** preparado para crecer en usuarios, países y datos.
- **Multi-equipo:** varios equipos/oficinas/países bajo la misma empresa, con monedas distintas.
- **Idioma:** español como idioma principal; strings centralizados para i18n futuro (portugués/inglés dado el footprint regional).
- **Respaldos y auditoría:** backups de BD + registro de cambios en tabla `auditoria`.
- **Cumplimiento:** manejo responsable de datos personales (Ley 19.628 CL / LGPD BR / normativas locales).

---

## [9] Plan de desarrollo por fases

1. **Fase 0 — Base:** monorepo, Supabase (esquema + RLS + seeds DIPREM), autenticación, roles y navegación básica (web + móvil). ✅ cerrar funcionando antes de seguir.
2. **Fase 1 — CRM Core:** cuentas, contactos, leads, oportunidades y embudo (Kanban web / tarjetas móvil).
3. **Fase 2 — Gestión diaria:** "Mi Día", actividades, seguimientos, recordatorios y push.
4. **Fase 3 — Metas y dashboards:** KPIs ejecutivo/gerente, reportes exportables.
5. **Fase 4 — Gestión comercial:** catálogo de servicios, propuestas (PDF + aprobación), adjudicaciones.
6. **Fase 5 — Refinamiento:** modo offline, integraciones (WhatsApp, facturación/ERP), pulido UX y pruebas.

**Regla:** cada fase se cierra funcionando y versionada en Git antes de pasar a la siguiente.

---

## [10] Cómo trabajar en este repo

- Leer siempre `docs/CONTEXTO-DIPREM.md` antes de nombrar entidades, etapas o servicios.
- Plan técnico y esquema SQL: `docs/PLAN-ARQUITECTURA.md`.
- Proponer plan → esperar aprobación → construir por fases → mostrar qué quedó funcionando al cerrar cada fase.
- Commits descriptivos en español al cerrar cada bloque funcional.
- Probar en móvil real desde temprano (Expo Go) para validar la fricción del registro diario.
