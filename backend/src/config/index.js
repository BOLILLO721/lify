const path = require('path');

// Se resuelve la ruta de forma absoluta para que el .env se encuentre
// sin importar desde qué carpeta se ejecute `node src/server.js`.
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const REQUIRED_SPORTIFY_VARS = ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'];

const missingSpotifyEnv = REQUIRED_SPORTIFY_VARS.filter((name) => !process.env[name]);

const port = Number(process.env.PORT) || 3001;

// URL a la que Spotify devuelve al usuario tras autorizar la app.
// Ojo: Spotify ya no acepta `localhost`, hay que usar la IP de loopback.
const redirectUri =
  process.env.SPOTIFY_REDIRECT_URI || `http://127.0.0.1:${port}/api/auth/callback`;

// A dónde volvemos al terminar el login (la app de React).
const frontendUrl = (process.env.FRONTEND_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

// Scopes mínimos para crear un reproductor en el navegador:
// - streaming: reproducir audio con el Web Playback SDK.
// - user-read-email / user-read-private: leer el perfil (nombre y foto).
// - user-read-playback-state: conocer el estado de reproducción.
// - user-modify-playback-state: enviar órdenes (transferir y reproducir).
const scopes = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
];

// Artistas semilla del catálogo inicial. Si no se define, el controlador usa
// su lista por defecto.
const catalogSeeds = process.env.CATALOG_SEEDS
  ? process.env.CATALOG_SEEDS.split(',')
      .map((seed) => seed.trim())
      .filter(Boolean)
  : undefined;

// Conexión a MongoDB. Acepta varios nombres habituales de variable para no
// obligar a renombrar el .env existente.
const mongoUri =
  process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL || '';

// DATA_SOURCE=database -> Spotify apagado: catálogo, búsquedas, álbumes y
// artistas se responden solo desde MongoDB (la API y la conexión siguen vivas).
// Cualquier otro valor (por defecto) -> se consulta Spotify y MongoDB guarda
// copia y sirve de respaldo.
const databaseOnly = String(process.env.DATA_SOURCE || '').toLowerCase() === 'database';

// Por defecto (si hay MongoDB configurado) la base de datos va PRIMERO: el
// frontend lee de ahí y Spotify solo se consulta para completar lo que falte.
// DATA_SOURCE=spotify -> comportamiento antiguo (Spotify primero).
const dbFirst =
  !databaseOnly &&
  String(process.env.DATA_SOURCE || '').toLowerCase() !== 'spotify' &&
  Boolean(mongoUri);

module.exports = {
  port,
  databaseOnly,
  dbFirst,
  mongo: {
    uri: mongoUri,
    // Opcional: solo hace falta si el nombre de la base no va dentro de la URI.
    dbName: process.env.MONGODB_DB_NAME || process.env.MONGO_DB_NAME || undefined,
  },
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID || '',
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
    // Mercado para los catálogos por país (álbumes, lanzamientos).
    market: process.env.SPOTIFY_MARKET || 'ES',
    redirectUri,
    scopes,
  },
  frontendUrl,
  catalogSeeds,
  // Las reportamos en vez de lanzar aquí, para que el servidor pueda explicar
  // qué falta con un mensaje útil en lugar de un stack trace.
  missingSpotifyEnv,
};
