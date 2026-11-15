# Porra Elecciones España 2026 (29-N)

Aplicación web móvil y escritorio para organizar una porra entre amigos sobre las elecciones generales al Congreso de los Diputados (350 escaños).

## Características incluidas

- **Sin PIN:** cualquier amigo elige su nombre (o crea uno nuevo) y puede modificar su porra libremente hasta el **sábado 28 de noviembre de 2026 a las 23:59 (hora peninsular CET)**.
- **Base oficial 23-J (2023) y encuestas 29-N (2026):** candidaturas ordenadas por expectativa de representación en encuestas de noviembre de 2026 (incluyendo Adelante Andalucía, Compromís, SALF, Podemos, UPC, Ara Més, etc.) y opción para añadir cualquier otra candidatura del BOE.
- **Comparativa en vivo:** tabla comparativa y vista individual con hemiciclo SVG de 350 escaños.
- **Puntuación `+1 / -1` explicada:** `+1` por cada diputado acertado y `-1` por cada diputado de desviación, con sección explicativa y calculadora interactiva.
- **Almacenamiento compartido gratuito:** preparado para **Supabase** (plan gratuito) + alojamiento estático gratuito en **GitHub Pages**, **Netlify** o **Cloudflare Pages**, y también con un servidor local en Python (`server.py`) para pruebas rápidas.

---

## Opción recomendada: Publicar gratis en internet para tus amigos (Supabase + GitHub Pages / Netlify)

### 1. Crear el almacenamiento compartido gratis en Supabase
1. Crea una cuenta gratuita en [supabase.com](https://supabase.com) y pulsa **New Project**.
2. En el menú lateral ve a **SQL Editor → New Query**.
3. Abre el archivo [supabase_schema.sql](supabase_schema.sql), cambia `'CAMBIA-ESTE-CODIGO'` por tu contraseña secreta de organizador (la usarás la noche electoral para cargar los resultados oficiales) y ejecútalo (**Run**).
4. En **Settings (rueda dentada)**:
   - En **Configuration → API Keys**, copia la **Publishable key** (empieza por `sb_publishable_...`). *(Nunca copies la Secret key `sb_secret_...`)*.
   - En **Integrations → Data API** (o pulsando el botón verde **Connect** arriba), copia la **URL / Project URL** (`https://...supabase.co`).

### 2. Conectar las claves en la web
Abre [js/config.js](js/config.js) y pega ambos valores:

```js
SUPABASE_URL: 'https://tuproyecto.supabase.co',
SUPABASE_ANON_KEY: 'sb_publishable_...',
```

### 3. Subir la web gratis (cualquiera de estas opciones)
- **Netlify Drop:** entra en [app.netlify.com/drop](https://app.netlify.com/drop) y arrastra la carpeta `Elecciones2026` (tarda 10 segundos y te da un enlace HTTPS para compartir por WhatsApp).
- **GitHub Pages:** sube la carpeta a un repositorio de GitHub y activa *Settings → Pages → Deploy from branch*.

> El cierre automático del **28/11/2026 a las 23:59 CET** está protegido tanto en la interfaz como en las políticas **Row Level Security (RLS)** de Postgres en Supabase.

---

## Opción alternativa: Probar en local con Python

Si quieres probarla ahora mismo en tu PC o en tu red local sin configurar Supabase:

```powershell
python server.py
```

Abre `http://localhost:8080` en tu navegador. Los datos se guardarán en `data/porra.json` (código de organizador por defecto: `ADMIN2026`, configurable con la variable de entorno `PORRA_ADMIN_CODE`).
