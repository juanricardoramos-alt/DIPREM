# 🚀 Publicar DIPREM en Vercel (leyendo una rama de Neon)

Guía en lenguaje simple. La app se publica en **Vercel** (la web) y lee los
datos de una **rama de Neon** (la base). Qué rama lee se decide con dos
variables de entorno — para una demo, la rama `demo`; para producción real,
la rama que corresponda.

> Regla de oro: **ninguna clave ni cadena de conexión se escribe en el
> repositorio.** Todo secreto vive en las variables de entorno de Vercel o
> en la sesión de PowerShell de quien ejecuta scripts.

---

## Requisitos previos

- El código mergeado en la rama `main` de GitHub.
- La rama de Neon a publicar con **Auth** y **Data API** activados
  (sin marcar "grant public schema access") y sus migraciones aplicadas
  (`pnpm db:migrate` con la `DATABASE_URL` de esa rama).
- Los usuarios que entrarán, creados por allowlist (perfil en `usuarios`
  enlazado a su `auth_id`); el registro público NO da acceso a datos.

## Parte 1 — Proyecto en Vercel

1. **[Vercel]** `vercel.com` → el proyecto DIPREM (o **Add New → Project** →
   importar el repositorio de GitHub).
2. **[Vercel]** Settings → **General** → **Root Directory** = `apps/web`
   (Framework: Next.js).
3. **[Vercel]** Settings → **Git** → **Production Branch** = `main`.

## Parte 2 — Variables de entorno

**[Vercel]** Settings → **Environment Variables** (ambiente *Production*):

| Variable | Valor | De dónde sale |
|---|---|---|
| `NEON_AUTH_BASE_URL` | URL del Auth server de la rama | **[Neon]** rama → pestaña **Auth** |
| `NEXT_PUBLIC_DATA_API_URL` | URL REST del Data API de la rama | **[Neon]** rama → pestaña **Data API** |
| `NEON_AUTH_COOKIE_SECRET` | secreto aleatorio de 32+ caracteres | **[PowerShell]** `[Convert]::ToBase64String((1..48 \| ForEach-Object {Get-Random -Maximum 256}))` |

Opcionales — **candado extra para demos públicas** (Basic-Auth del navegador,
encima del login de la app; se activa solo si ambas existen y se desactiva
borrándolas y redeployando):

| Variable | Valor |
|---|---|
| `BASIC_AUTH_USUARIO` | el usuario del candado |
| `BASIC_AUTH_CLAVE` | la clave del candado |

**`DATABASE_URL` NO va en Vercel**: la app en runtime no la usa. Es solo
para migraciones/scripts desde tu máquina, y es la credencial que se salta
la RLS — mientras menos lugares viva, mejor.

## Parte 3 — Deploy y verificación

1. **[Vercel]** Deployments → el deploy de `main` (se dispara solo al
   mergear; si no, botón **Redeploy**). Espera el ✓ verde → **Visit**.
2. **[Chrome]** Abre la URL. Si el Basic-Auth está activo, el navegador pide
   usuario/clave. Después, `/login` con un usuario de la allowlist.
3. Si el login fallara con un error de *origin/redirect not allowed*:
   **[Neon]** rama → **Auth** → configuración → orígenes/dominios permitidos
   → agrega `https://<tu-proyecto>.vercel.app` y reintenta.

## Antes de compartir el link (F4 mínimo)

Con la URL pública, verifica el perímetro (15 minutos):

1. **[Chrome, ventana de incógnito]** Regístrate con un correo cualquiera →
   entra → debe verse la app **vacía** (0 cuentas, 0 proyectos, 0 de todo):
   es la allowlist trabajando. Ese usuario NO debe poder crear ni ver nada.
2. **[Chrome]** Entra con un usuario `lectura` o `revisor` → no debe haber
   datos de contacto (tel/correo) en ninguna pantalla.
3. **[Neon]** Revisa el tope de filas del Data API (`db-max-rows`) en la
   configuración de la rama (deuda DT-002).

Si el punto 1 muestra CUALQUIER dato, **no compartas el link** y revisa
`docs/DEUDA-TECNICA.md` y las migraciones de seguridad (0012, 0015).

## Cambiar de rama de datos (demo ↔ producción)

**[Vercel]** cambia `NEON_AUTH_BASE_URL` y `NEXT_PUBLIC_DATA_API_URL` por
las de la otra rama → **Redeploy**. El código no cambia; los datos sí.

## Al terminar una demo

- **[Vercel]** borra `BASIC_AUTH_*` si quieres quitar el candado, o todo el
  proyecto si la demo terminó.
- **[Neon]** la rama `demo` se borra completa desde la consola (Branches):
  usuarios de revisión y datos sembrados desaparecen de un golpe.
