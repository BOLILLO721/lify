# Lify 🍋

App React + API intermediaria en Node/Express que consume la **Web API de Spotify**,
**guarda una copia en MongoDB** y añade encima un pequeño sistema completo con
usuarios propios, playlists y auditoría.

Hay dos capas de autenticación y conviene no confundirlas:

| Capa | Para qué sirve | Cómo funciona |
| ---- | -------------- | ------------- |
| **Cuentas de Lify** | Entrar a la app, crear playlists, ser administrador | `usuario` + `contraseña` (bcrypt) → **JWT** guardado en `localStorage` |
| **Cuenta de Spotify** | Reproducir audio en el navegador | *Authorization Code* → sesión en cookie `httpOnly` + **Web Playback SDK** |

El catálogo y las búsquedas usan *Client Credentials* de Spotify (no requieren
ninguna de las dos sesiones).

```
lify/
├── src/                        # Frontend (Create React App)
│   ├── api/spotify.js          # Cliente HTTP (axios) hacia el backend
│   ├── routes/AppRoutes.jsx    # Rutas: /login, /home, /playlists y 404
│   ├── pages/
│   │   ├── Login.jsx           # Login / registro de usuario de Lify
│   │   ├── Home.jsx            # Catálogo, buscador, reproductor y panel admin
│   │   ├── Playlists.jsx       # CRUD de playlists y gestión de canciones
│   │   └── NotFound.jsx
│   ├── hooks/useSpotifyPlayer.js  # Estado del Web Playback SDK
│   └── utils/spotifySdk.js     # Carga del SDK de Spotify
├── backend/                    # API intermediaria (Express)
│   ├── src/
│   │   ├── server.js           # Entry point (app Express + arranque)
│   │   ├── config/index.js     # Configuración vía .env
│   │   ├── routes/api.js       # Rutas /api/*
│   │   ├── controllers/        # Lógica de cada endpoint
│   │   ├── middleware/auth.js  # requireAuth / requireAdmin (JWT)
│   │   ├── models/             # Esquemas de Mongoose
│   │   ├── db/connection.js    # Conexión a MongoDB con reintentos
│   │   ├── services/           # Spotify, sesiones, MusicStore y auditoría
│   │   ├── mappers/            # Normaliza la respuesta de Spotify
│   │   ├── scripts/db.js       # Utilidades `sync` / `reset` de la base
│   │   └── test/               # Tests unitarios y de integración (Jest + Supertest)
│   └── .env.example
└── public/
```

## Qué hace la app

1. **Login de Lify**: al entrar pide usuario y contraseña. Si no tienes cuenta,
   puedes registrarte y elegir *Usuario normal* o *Administrador*.
2. En **Home** se muestra un **catálogo** con canciones de unos artistas semilla
   y un **buscador** que alterna entre **Canciones** (por nombre, o por artista
   o álbum, que Spotify también indexa) y **Artistas** (sus últimos álbumes; al
   pulsar uno se ven sus canciones).
3. Con el botón **"Conectar con Spotify"** y una cuenta **Premium** se activa el
   reproductor dentro del navegador.
4. En **Mis Playlists** se crean, editan y borran playlists propias, se añaden
   canciones buscándolas en la base de datos y se reordenan con ▲ / ▼.
5. Si tu cuenta es **Administrador**, además aparecen:
   - edición del nombre de una canción (se propaga a todas las playlists donde esté),
   - borrado de canciones de la base de datos,
   - **Reiniciar base de datos**,
   - **historial de auditoría** de los últimos movimientos.

## Requisitos

- Node.js >= 18
- Una app en el [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
  con **Client ID** y **Client Secret**
- Una base de datos **MongoDB** local o en la nube (Atlas). Es opcional para
  arrancar, pero sin ella no hay playlists, ni usuarios, ni auditoría.

## Puesta en marcha

### 1. Instalar dependencias

```bash
npm install                   # frontend
npm --prefix backend install  # backend
```

### 2. Configurar las credenciales

```bash
cp backend/.env.example backend/.env
```

Edita `backend/.env`:

```
SPOTIFY_CLIENT_ID=tu_client_id
SPOTIFY_CLIENT_SECRET=tu_client_secret
PORT=3001

SPOTIFY_MARKET=ES
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3001/api/auth/callback
FRONTEND_URL=http://127.0.0.1:3000

# MongoDB (cualquiera de estos nombres vale)
MONGODB_URI=mongodb://127.0.0.1:27017/lify
# Opcional, solo si el nombre de la base no va en la URI
# MONGODB_DB_NAME=lify

# Secreto para firmar los JWT de las cuentas de Lify
JWT_SECRET=cambia_esto_por_algo_largo_y_aleatorio
```

Variables opcionales:

| Variable      | Efecto |
| ------------- | ------ |
| `CATALOG_SEEDS` | Artistas del catálogo inicial, p. ej. `"Bad Bunny,Rosalía"` |
| `SPOTIFY_MARKET` | Mercado de Spotify (por defecto `ES`) |
| `DATA_SOURCE` | `spotify` = consultar siempre Spotify primero; `database` = solo MongoDB, sin Spotify (ver abajo) |

> Ningún archivo `.env` se sube al repositorio: `.gitignore` ignora
> `.env`, `backend/.env` y todo `*.env`.

### 3. Levantar los dos servidores

```bash
npm run start:backend   # API en http://localhost:3001
npm start               # Frontend en http://localhost:3000
```

Abre <http://127.0.0.1:3000> (no `localhost`: la cookie de sesión de Spotify y
el redirect usan la IP de loopback). El proxy de CRA reenvía las peticiones
`/api/*` del frontend al backend.

El **primer usuario que se registre se convierte en Administrador**; el resto
son usuarios normales (salvo que elijan el rol al registrarse).

> ⚠️ El registro acepta el rol `admin` desde el propio formulario. Es una
> decisión de desarrollo: en una app real el rol lo asignaría el servidor, nunca
> el cliente.

### 4. Utilidades de base de datos (opcional)

```bash
cd backend
node src/scripts/db.js sync          # crea colecciones e índices que falten
node src/scripts/db.js reset --yes   # BORRA toda la base y la recrea vacía
```

## Base de datos

La API arranca aunque MongoDB no esté disponible: se conecta en segundo plano y
reintenta cada 5 s. La base **nunca** tumba la API; si no está, guardar no hace
nada y leer devuelve listas vacías.

Colecciones:

| Colección  | Contenido | `_id` |
| ---------- | --------- | ----- |
| `tracks`   | Canciones de Spotify (con `searchText` sin tildes para buscar) | id de Spotify |
| `artists`  | Artistas | id de Spotify |
| `albums`   | Álbumes de cada artista (`artistId`) | id de Spotify |
| `users`    | Cuentas de Lify (contraseña hasheada con bcrypt, rol `user` / `admin`) | ObjectId |
| `playlists`| Playlists de cada usuario, con copia de sus canciones | ObjectId |
| `auditlogs`| Historial de movimientos (borra solo lo de más de 90 días) | ObjectId |

Cómo se combinan Spotify y MongoDB:

- **Por defecto (si hay `MONGODB_URI`)**: *base de datos primero*. Se sirve lo
  que ya está guardado y Spotify solo se consulta para completar lo que falte.
- **`DATA_SOURCE=spotify`**: comportamiento clásico, Spotify primero; la base
  actúa de respaldo si Spotify falla.
- **`DATA_SOURCE=database`**: Spotify se apaga. Catálogo, búsquedas, álbumes y
  artistas salen solo de MongoDB (responde **503** si la base no está conectada).

Lo que llega de Spotify se guarda con `$setOnInsert`: si un registro ya existe
**no se sobrescribe**, así lo que edites a mano en MongoDB no se pisa.

## API

Todas las rutas cuelgan de `/api`. Las marcadas con 🔒 necesitan
`Authorization: Bearer <JWT>`; las marcadas con 👑 requieren rol `admin`.

| Método | Ruta                                | Descripción |
| ------ | ----------------------------------- | ----------- |
| GET    | `/health`                           | ¿Backend vivo? Incluye estado de la BD y nº de registros guardados |
| GET    | `/catalog?limit=…`                  | Catálogo inicial de canciones |
| GET    | `/tracks?q=…&limit=…`               | Busca canciones por nombre |
| GET    | `/albums/tracks?albumId=…`          | Canciones de un álbum |
| GET    | `/artists/top?artistId=…`           | Artista normalizado + sus últimos álbumes |
| GET    | `/artists/search?q=…`               | Busca artistas por nombre |
| PUT    | 🔒👑 `/tracks/:id`                  | Renombra una canción (se sincroniza en las playlists) |
| DELETE | 🔒👑 `/tracks/:id`                  | Borra una canción de la base de datos |
| POST   | `/basic-auth/register`              | Crea una cuenta de Lify |
| POST   | `/basic-auth/login`                 | Devuelve el JWT y el usuario |
| GET    | `/basic-auth/me`                    | Usuario actual a partir del token |
| GET    | `/playlists`                        | 🔒 Playlists del usuario (el admin ve todas) |
| GET    | `/playlists/:id`                    | 🔒 Detalle de una playlist |
| POST   | `/playlists`                        | 🔒 Crea una playlist |
| PUT    | `/playlists/:id`                    | 🔒 Edita nombre/descripción |
| DELETE | `/playlists/:id`                    | 🔒 Borra una playlist |
| POST   | `/playlists/:id/tracks`             | 🔒 Añade una canción |
| PUT    | `/playlists/:id/tracks`             | 🔒 Reordena las canciones |
| DELETE | `/playlists/:id/tracks/:trackId`    | 🔒 Quita una canción |
| POST   | 🔒👑 `/admin/reset-database`        | Borra y recrea tracks, artists, albums, playlists y auditlogs |
| GET    | 🔒👑 `/admin/audit-logs?limit=…`    | Historial de movimientos (filtros: `action`, `resource`, `resourceId`, `username`) |
| GET    | `/auth/login`                       | Redirige a Spotify para conectar la cuenta |
| GET    | `/auth/callback`                    | Vuelve de Spotify y crea la sesión |
| GET    | `/auth/me`                          | ¿Hay una sesión de Spotify activa? |
| GET    | `/auth/token`                       | Access token para el Web Playback SDK |
| POST   | `/auth/logout`                      | Cierra la sesión de Spotify |
| POST   | `/player/play`                      | Reproduce una canción en el navegador |

Parámetros opcionales: `q` (búsqueda), `artistId`, `albumId` y `limit`
(máximo 50 en listados, **10 en búsquedas** porque Spotify rechaza más).
`q` y `albumId` son obligatorios en sus rutas: si faltan, se responde con un
**400** y un mensaje claro.

Las respuestas de catálogo están **normalizadas**, con una forma propia estable
independiente de cómo Spotify decida cambiar su payload:

```json
{
  "tracks": [
    { "id": "…", "name": "Primaveral", "uri": "spotify:track:…",
      "artists": ["Mon Laferte"],
      "album": { "id": "…", "name": "La Trenza", "image": "https://…" },
      "url": "https://…", "durationMs": 210000 }
  ]
}
```

```json
{
  "artist": { "id": "…", "name": "Bad Bunny", "image": "https://…", "url": "https://…" },
  "albums": [
    { "id": "…", "name": "DeBÍ TiRAR MáS FOToS", "releaseDate": "2025-01-05",
      "image": "https://…", "url": "https://…", "totalTracks": 17 }
  ]
}
```

### Cuentas y roles

- La contraseña se guarda **hasheada con bcrypt** (nunca en claro, nunca se devuelve).
- El login devuelve un **JWT firmado con `JWT_SECRET`** que caduca a los 7 días.
  Contiene `userId`, `username` y `role`.
- `requireAuth` valida el token; `requireAdmin` exige además `role === 'admin'`.
- El frontend lo guarda en `localStorage` y lo añade a cada petición con un
  interceptor de axios. `AppRoutes` redirige a `/login` si no hay token.
- Las playlists se filtran por `userId`: un usuario normal **no puede ver ni
  tocar** las de otro; el administrador ve todas.

### Autenticación con Spotify

Para leer de la API (Client Credentials):

1. `POST https://accounts.spotify.com/api/token` con Basic Auth
   (Client ID / Client Secret) y `grant_type=client_credentials`.
2. El token dura 3600 s, por lo que `SpotifyService` lo cachea y lo renueva
   automáticamente antes de que venza.
3. Cada llamada a `api.spotify.com/v1` usa `Authorization: Bearer <token>`.

Las credenciales **nunca** salen del backend: el frontend solo habla con `/api/*`.

Para reproducir audio hace falta además un token **de usuario** (flujo
*Authorization Code*), que se obtiene al pulsar "Conectar con Spotify". El
canje del `code` y la renovación con el `refresh_token` también ocurren en el
backend; al navegador solo llega el `access_token` que exige el SDK.

### Limitaciones actuales de la Web API de Spotify

Esto se comprobó contra la API en vivo, no es teoría:

- El objeto **artist ya no incluye `genres`, `followers` ni `popularity`**.
  Spotify devuelve solo `id`, `name`, `images`, `external_urls`, `href`, `type`
  y `uri`. Por eso el backend normaliza la respuesta en vez de reenviarla tal cual.
- `GET /v1/artists/:id/top-tracks` devuelve **403 Forbidden** con un token de
  aplicación (Client Credentials). Por eso `/artists/top` resuelve los
  "tops" con los últimos álbumes (`/v1/artists/:id/albums`), que sí funcionan.
- Los endpoints **`/v1/browse/*`** (new-releases, categories, featured-playlists)
  y **`/v1/playlists/*`** también devuelven **403** con token de aplicación.
  Por eso el catálogo no se pide "lo más escuchado", sino que se arma buscando
  canciones por el nombre de unos artistas semilla (`/v1/search?type=track`).
- `GET /v1/search` responde **400 "Invalid limit"** por encima de 10, aunque
  otros listados admitan 50.
- `GET /v1/search?q=…&type=artist` y `type=track` sí funcionan con token de
  aplicación.
- `GET /v1/albums/:id/tracks` no incluye el álbum en cada canción, así que
  `/albums/tracks` pide además `/v1/albums/:id` para devolver las canciones
  completas.

## Reproducción en el navegador (Web Playback SDK)

La app crea un reproductor de Spotify dentro del navegador. Requisitos:

1. **Cuenta Spotify Premium** (no Lite/Mini). Sin Premium el SDK devuelve
   `account_error` al conectar.
2. **Registrar la redirect URI** en el Dashboard de Spotify
   (Settings → Redirect URIs):
   ```
   http://127.0.0.1:3001/api/auth/callback
   ```
   `localhost` ya no se acepta, hay que usar la IP de loopback.
3. **Abrir la app en `http://127.0.0.1:3000`**, no en `localhost:3000`, para
   que la cookie de sesión viaje bien entre el frontend y el backend.
4. La app en el Dashboard debe incluir al usuario en **User Management** si
   está en modo desarrollo (límite de 25 usuarios).

Flujo:

1. Pulsa **"Conectar con Spotify"**: el backend redirige a Spotify con los
   scopes `streaming`, `user-read-email`, `user-read-private`,
   `user-read-playback-state` y `user-modify-playback-state`.
2. Al volver, el backend guarda el `access_token` y el `refresh_token` en una
   sesión en memoria asociada a una cookie `httpOnly` y redirige a la app.
3. El frontend carga `sdk.scdn.co/spotify-player.js`, crea el `Spotify.Player`
   y pide el token al backend (`GET /api/auth/token`), que lo renueva si
   caducó.
4. Al pulsar **▶** en una canción se envía `POST /api/player/play` con la URI y
   el `device_id` del navegador; el backend transfiere el audio al dispositivo
   y lanza la reproducción. Pausa/reanudación lo hace el SDK en el navegador.

Notas:

- El `refresh_token` nunca llega al navegador; solo se expone el `access_token`
  porque el SDK lo necesita en JavaScript.
- Las sesiones de Spotify viven en memoria: si reinicias el backend, habrá que
  reconectar (la sesión de Lify, al ser JWT, sigue valiendo).
- Las canciones del catálogo se obtienen con Client Credentials, así que el
  catálogo y las búsquedas funcionan sin conectar Spotify; solo el ▶ lo requiere.

## Auditoría

Cada movimiento relevante se guarda en `auditlogs` con quién lo hizo (usuario,
rol, IP y user-agent), qué acción fue, sobre qué recurso y el detalle
antes/después.

Acciones registradas hoy:

- `playlist.create`, `playlist.update`, `playlist.delete`
- `playlist.track.add`, `playlist.track.remove`, `playlist.track.reorder`
- `track.update`, `track.delete`
- `database.reset`

El modelo ya contempla `auth.register`, `auth.login` y `auth.logout`, pero
todavía **no** se registran desde los controladores de autenticación.

La auditoría nunca hace fallar una petición: si MongoDB no está, se avisa por
consola y la operación sigue adelante.

## Tests

```bash
npm test              # frontend (Jest + React Testing Library)
npm run test:backend  # backend (Jest + Supertest)
```

Los tests del backend usan servicios y modelos simulados: **no** necesitan
credenciales de Spotify ni una MongoDB real. Cubren el controlador de Spotify,
el reproductor, el login de Spotify, `MusicStore` (upsert, búsqueda sin tildes,
respaldo cuando Spotify falla, modo `database` y `dbFirst`) y la auditoría.

## Producción

- `npm run build` genera el frontend en `build/`.
- Define `REACT_APP_API_URL` con la URL pública del backend (`https://…/api`)
  para que el frontend apunte a producción en lugar de al proxy local.
- Define `SPOTIFY_REDIRECT_URI` y `FRONTEND_URL` con las URLs públicas y añade
  la redirect URI al dashboard de Spotify. Todo debe ir por **HTTPS**: el SDK,
  las cookies y la propia redirect URI lo exigen fuera de loopback.
- Define un **`JWT_SECRET` largo y aleatorio** (el valor por defecto es solo
  para desarrollo) y restringe `MONGODB_URI` a un usuario con permisos mínimos.
- Las sesiones de Spotify están en memoria: con varias instancias hace falta un
  almacén compartido (Redis u similar).

## Observación

Esto se desarrolló debido a mi gusto excesivo por la música. Se usó la API de
Spotify porque es muy completa y ya pago por el servicio, así que no hay
problema con que sea de paga. La finalidad de este proyecto es intentar entender
el flujo de datos cuando se consume una API, además de ver las limitaciones y
problemas que esto conlleva (por eso el proyecto creció hasta incluir base de
datos, autenticación, playlists y auditoría).
