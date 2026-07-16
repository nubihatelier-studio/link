# Desplegar Nubih Creator

Es una SPA 100% estática — sin backend, sin API, sin base de datos en el servidor. Cualquier
hosting de archivos estáticos con HTTPS y soporte de "SPA fallback" sirve. Estos pasos son para
**Cloudflare Pages** (gratis, HTTPS automático); al final hay notas para Netlify/Vercel/GitHub
Pages por si prefieres otro.

## Cloudflare Pages

### Build

| Configuración | Valor |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` (o la carpeta de este proyecto si el repo tiene más de uno) |
| Variable de entorno `NODE_VERSION` | `20` (ver `.nvmrc`) |

### Pasos (dashboard)

1. En Cloudflare, **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → elige este repositorio.
2. Completa el build command y el output directory de la tabla de arriba.
3. Agrega la variable de entorno `NODE_VERSION=20` (Settings → Environment variables) — evita builds inconsistentes entre el Node que trae Cloudflare por defecto y el que usamos localmente.
4. Deploy. Cloudflare te da una URL `*.pages.dev` con HTTPS ya activo; un dominio propio se agrega después en Custom domains.

### Pasos (CLI, alternativa)

```bash
npm run build
npx wrangler pages deploy dist
```

### Rutas de React Router (SPA fallback)

`public/_redirects` ya está en el repo:

```
/*  /index.html  200
```

Esto hace que **cualquier** ruta (`/editor/abc123`, `/new/photo`, un typo, lo que sea) que no
coincida con un archivo real del build sirva `index.html` con status 200 — así React Router
recibe la URL y decide él mismo qué mostrar (la página real, o la pantalla 404 propia de la app
si la ruta no existe dentro de React Router tampoco). Sin este archivo, recargar la página en
`/editor/abc123` o entrar directo por ese link daría un 404 del hosting, no de la app.

### Headers de caché

`public/_headers` ya está en el repo:

- `/assets/*` (todo el JS/CSS con hash de contenido en el nombre) → `immutable`, 1 año. El
  nombre del archivo cambia si el contenido cambia, así que cachearlo para siempre es seguro.
- `/index.html`, `/sw.js`, `/manifest.webmanifest` → `no-cache` (revalidar siempre). Son los tres
  archivos que le dicen al navegador "esta es la versión actual" — cachearlos de más rompe la
  detección de actualizaciones (el toast "Hay una nueva versión" de `useAppUpdate`).

Ambos archivos (`_redirects`, `_headers`) viven en `public/`, así que Vite los copia tal cual a
`dist/` en cada build — no hace falta ningún paso extra.

## Otros hostings estáticos

El mecanismo de SPA fallback cambia de nombre según el hosting, pero la idea es la misma
("toda ruta no reconocida sirve `index.html`"):

- **Netlify**: mismo archivo `public/_redirects`, misma sintaxis — funciona sin cambios.
- **Vercel**: necesita un `vercel.json` con `{"rewrites": [{"source": "/(.*)", "destination": "/index.html"}]}` en vez de `_redirects`.
- **GitHub Pages**: no tiene SPA fallback nativo; el truco común es copiar `dist/index.html` a `dist/404.html` después del build.

Los headers de caché (`_headers`) son específicos de Cloudflare Pages/Netlify; en Vercel se
configuran en `vercel.json` bajo `headers`, y en GitHub Pages no se pueden personalizar.

## Después de desplegar

- Recarga directo en una ruta profunda (`/editor/<id-real>`) para confirmar que el SPA fallback
  funciona — no un 404 del hosting.
- Activa modo avión y recarga: si ya visitaste el sitio una vez con conexión (el service worker
  alcanzó a precachear), debe seguir funcionando offline.
- Un patrón creado en un despliegue anterior sigue en IndexedDB del navegador — los datos no
  dependen del hosting ni se pierden entre despliegues.
