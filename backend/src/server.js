const express = require('express');
const cors = require('cors');

const config = require('./config');
const SpotifyService = require('./services/spotifyService');
const SpotifyAuthService = require('./services/spotifyAuthService');
const SpotifyPlayerService = require('./services/spotifyPlayerService');
const createApiRouter = require('./routes/api');
const models = require('./models');
const MusicStore = require('./services/musicStore');
const AuditService = require('./services/auditService');
const { connectDatabase, disconnectDatabase, isDatabaseReady } = require('./db/connection');

/**
 * Crea la app de Express con el servicio ya inyectado.
 * Se exporta como fábrica para que los tests puedan usar un servicio simulado
 * sin necesidad de credenciales reales de Spotify.
 */
const createApp = (spotifyService, options = {}) => {
  const frontendUrl = options.frontendUrl || config.frontendUrl;
  const app = express();

  // El frontend corre en el puerto 3000 (CRA). `credentials` permite que la
  // cookie de sesión viaje cuando el frontend llama con una URL absoluta.
  app.use(cors({ origin: frontendUrl, credentials: true }));
  app.use(express.json());

  app.use(
    '/api',
    createApiRouter(spotifyService, { ...options, frontendUrl })
  );

  // 404 para rutas inexistentes.
  app.use((req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
  });

  // Manejador de errores global.
  app.use((err, req, res, next) => {
    console.error('[error]', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  });

  return app;
};

if (require.main === module) {
  const { databaseOnly } = config;

  // Spotify solo es imprescindible si se va a consultar. En modo base de
  // datos las credenciales son opcionales (solo hacen falta para reproducir).
  if (!databaseOnly && config.missingSpotifyEnv.length) {
    console.error(
      `Faltan variables de entorno: ${config.missingSpotifyEnv.join(', ')}`
    );
    process.exit(1);
  }

  if (databaseOnly && !config.mongo.uri) {
    console.error('DATA_SOURCE=database necesita MONGODB_URI en el .env');
    process.exit(1);
  }

  const hasSpotifyCredentials = config.missingSpotifyEnv.length === 0;

  const app = createApp(hasSpotifyCredentials ? new SpotifyService(config.spotify) : null, {
    catalogSeeds: config.catalogSeeds,
    authService: hasSpotifyCredentials ? new SpotifyAuthService(config.spotify) : undefined,
    playerService: hasSpotifyCredentials ? new SpotifyPlayerService(config.spotify) : undefined,
    frontendUrl: config.frontendUrl,
    store: new MusicStore({ models, isReady: isDatabaseReady }),
    auditService: new AuditService({ models, isReady: isDatabaseReady }),
    isDatabaseReady,
    databaseOnly,
    dbFirst: config.dbFirst,
  });

  const server = app.listen(config.port, () => {
    console.log(`Lify API escuchando en http://localhost:${config.port}`);
    console.log(
      databaseOnly
        ? 'Modo base de datos: Spotify apagado, todo se responde desde MongoDB.'
        : config.dbFirst
        ? 'Lectura desde MongoDB; Spotify solo completa lo que falte.'
        : `Login de Spotify: ${config.spotify.redirectUri}`
    );
  });

  // MongoDB se conecta en segundo plano: la API arranca aunque la base tarde
  // o no esté disponible, y reintenta hasta conseguirlo.
  connectDatabase(config.mongo);

  const shutdown = () => {
    server.close();
    disconnectDatabase().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = createApp;
