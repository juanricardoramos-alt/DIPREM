# 🚀 Publicar DIPREM CRM en internet (entorno de prueba)

Guía en lenguaje simple, sin herramientas de programador. Tiempo total: **~15 minutos**.
Costo: **$0** (plan gratuito de Supabase + plan gratuito Hobby de Vercel).

> Resultado final: una URL tipo `https://diprem.vercel.app` que abres desde
> cualquier navegador (PC o teléfono) y donde entras con los usuarios demo.

---

## Parte 1 — Base de datos en Supabase (~7 min)

1. Entra a **[supabase.com](https://supabase.com)** → botón **Start your project** →
   **Continue with GitHub** (usa la misma cuenta de GitHub donde está este repositorio).
2. Botón **New project**:
   - **Name:** `diprem-crm-prueba`
   - **Database Password:** inventa una y **guárdala** (no la volverás a necesitar hoy,
     pero sí más adelante).
   - **Region:** `South America (São Paulo)` (la más cercana al equipo).
   - Plan **Free** → **Create new project**. Espera ~2 minutos a que quede verde.
3. En el menú de la izquierda, abre **SQL Editor** → **New query**.
4. Abre en GitHub el archivo [`supabase/deploy/setup_completo.sql`](../supabase/deploy/setup_completo.sql),
   tócale el botón de **copiar** (icono de dos cuadrados), **pega todo** en el SQL Editor
   y aprieta **Run** (o Ctrl+Enter). Debe terminar con **"Success. No rows returned"**.
   > Esto crea las 21 tablas, la seguridad por rol (RLS), el catálogo DIPREM
   > (3 pilares, 29 servicios, embudo de 7 etapas) y los usuarios/cuentas demo.
5. Ve a **⚙️ Project Settings → API** (o "API Keys") y deja a mano dos valores:
   - **Project URL** → algo como `https://abcdefgh.supabase.co`
   - **anon public** key → un texto largo que empieza con `eyJ…`

---

## Parte 2 — Web en Vercel (~5 min)

1. Entra a **[vercel.com](https://vercel.com)** → **Sign Up** → **Continue with GitHub**.
2. Botón **Add New… → Project** → busca **DIPREM** en la lista → **Import**.
3. En la pantalla de configuración, **un solo ajuste importante**:
   - **Root Directory** → botón **Edit** → selecciona la carpeta **`apps/web`** → Continue.
   - (Framework Preset debe decir **Next.js** solo.)
4. Despliega la sección **Environment Variables** y agrega estas dos
   (nombre a la izquierda, valor a la derecha):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | el **Project URL** de Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la key **anon public** de Supabase |

5. Botón **Deploy**. Espera 2–3 minutos → botón **Visit**.
   **Esa es tu URL** (ej. `https://diprem-xxxx.vercel.app`). Guárdala / compártela.

---

## Parte 3 — Entrar y probar

Todos los usuarios demo usan la contraseña **`diprem123`**:

| Correo | Rol | Qué vas a ver |
|---|---|---|
| `ejecutivo.ar@diprem.local` | Ejecutivo (Argentina) | Mi Día, cartera minera demo (MILICIC, GANFENG, WORLEY…) |
| `gerente.ar@diprem.local` | Gerente Argentina | Todo lo de su equipo |
| `ejecutivo.cl@diprem.local` | Ejecutivo (Chile) | Cartera vacía (¡no ve nada de Argentina!) |
| `admin@diprem.local` | Administrador | Todo + menú Administración (editar etapas del embudo) |
| `lectura@diprem.local` | Solo lectura | Reportes/consulta, sin Mi Día ni edición |

**Ruta de prueba sugerida (5 min):** entra como `ejecutivo.ar@…` →
1. **Mi Día**: usa "📞 Registrar llamada" sobre GANFENG → mira cómo el seguimiento pasa a "contactada hoy".
2. **Cuentas**: abre GANFENG, agrega un contacto.
3. **Leads**: crea uno y tócale **Convertir** → se crean cuenta + oportunidad solas.
4. **Oportunidades**: arrastra una tarjeta entre etapas; suéltala en *Perdido* → pide el motivo.
5. Sal y entra como `ejecutivo.cl@…` para comprobar que no ve nada de Argentina.

---

## Parte 4 — Verlo en el teléfono (sin instalar nada)

La vía más simple hoy: **abre la URL de Vercel en el navegador del teléfono** —
la web es "móvil primero" y se ve como app. Para que quede con icono propio:

- **iPhone (Safari):** botón compartir □↑ → **Añadir a pantalla de inicio**.
- **Android (Chrome):** menú ⋮ → **Añadir a pantalla principal**.

> La **app nativa** (Expo, con notificaciones push) es otro paso: requiere o un PC
> con Node.js (`pnpm dev` + app Expo Go), o un **build en la nube con EAS** que
> genera un archivo instalable. Se deja para cuando toquen las push (Fase 3+).

---

## Si algo falla

| Síntoma | Causa probable | Arreglo |
|---|---|---|
| El deploy de Vercel falla | Root Directory no es `apps/web` | Settings → Build & Deployment → Root Directory |
| "Correo o contraseña incorrectos" | El script SQL no corrió completo | Repite Parte 1 paso 4 en un proyecto limpio |
| La página carga pero todo vacío/error | Claves mal pegadas | Vercel → Settings → Environment Variables → corrige y **Redeploy** |
| Quieres borrar todo y partir de cero | — | Supabase → Settings → General → Delete project, y repite Parte 1 |

**Notas de seguridad (entorno de prueba):** la key `anon public` está diseñada para
ser pública — los datos los protege la seguridad por rol (RLS) en la base de datos.
Los usuarios demo con clave `diprem123` son solo para esta prueba: **antes de usar
datos reales, se eliminan y se crean usuarios reales** (te guío cuando toque).

**Actualizaciones futuras:** cada vez que subamos código nuevo a la rama, Vercel
**redespliega solo** — tu URL siempre tendrá la última versión. Si cambia el esquema
de BD, te pasaré el script SQL nuevo para pegar en el SQL Editor.
