const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const basicAuthController = require('../controllers/userAuthController');
const TrackController = require('../controllers/trackController');
const SpotifyController = require('../controllers/spotifyController');
const AuthController = require('../controllers/authController');
const PlayerController = require('../controllers/playerController');

/**
 * Fábrica de rutas: recibe el servicio ya construido (con sus credenciales)
 * y devuelve el router. Así el módulo se puede importar en los tests sin
 * necesidad de tener credenciales de Spotify en el entorno.
 *
 * `authService` y `playerService` son opcionales: si no se pasan (tests
 * antiguos), solo se montan las rutas de catálogo y búsqueda.
 */
const createApiRouter = (spotifyService, options = {}) => {
  const {
    authService,
    playerService,
    frontendUrl,
    auditService,
    isDatabaseReady = () => false,
  } = options;
  const router = express.Router();

  const PlaylistController = require('../controllers/playlistController');
  const AdminController = require('../controllers/adminController');

  // Auditoría: si no se inyecta (tests antiguos), los controladores siguen
  // funcionando igual gracias a los valores por defecto.
  const audit = auditService || {
    log: async () => false,
    list: async () => [],
  };

  // Administración de la base de datos (solo Administrador).
  const adminController = new AdminController({ audit, isReady: isDatabaseReady });

  router.post('/admin/reset-database', requireAdmin, adminController.resetDatabase);
  router.get('/admin/audit-logs', requireAdmin, adminController.getAuditLogs);

  // Dejar constancia de los movimientos en las playlists y en las canciones.
  PlaylistController.setAuditService(audit);
  TrackController.setAuditService(audit);

  // Playlists protegidas: requieren token de usuario autenticado
  router.get('/playlists', requireAuth, PlaylistController.getPlaylists);
  router.get('/playlists/:id', requireAuth, PlaylistController.getPlaylistById);
  router.post('/playlists', requireAuth, PlaylistController.createPlaylist);
  router.put('/playlists/:id', requireAuth, PlaylistController.updatePlaylist);
  router.delete('/playlists/:id', requireAuth, PlaylistController.deletePlaylist);

  router.post('/playlists/:id/tracks', requireAuth, PlaylistController.addTrack);
  router.put('/playlists/:id/tracks', requireAuth, PlaylistController.reorderTracks);
  router.delete('/playlists/:id/tracks/:trackId', requireAuth, PlaylistController.removeTrack);

  // Instanciamos el servicio y lo inyectamos en el controlador.
  const spotifyController = new SpotifyController(spotifyService, options);

  router.get('/health', async (req, res) => {
    const { store, databaseOnly } = options;
    const body = { status: 'ok' };

    if (store) {
      body.source = databaseOnly ? 'database' : options.dbFirst ? 'database-first' : 'spotify';
      body.database = store.isReady() ? 'connected' : 'disconnected';
      // Registros guardados: si siguen en 0 tras navegar, algo no se guarda.
      body.stored = await store.counts();
    }

    res.json(body);
  });

  // Catálogo inicial: varias canciones sin necesidad de buscar.
  router.get('/catalog', spotifyController.getCatalog);
  // Búsqueda de canciones por nombre.
  router.get('/tracks', spotifyController.searchTracks);
  // Gestión de canciones en la BD (solo Administrador)
  router.put('/tracks/:id', requireAdmin, TrackController.updateTrackName);
  router.delete('/tracks/:id', requireAdmin, (req, res) =>
    TrackController.deleteTrack(req, res, options.store)
  );
  // Canciones de un álbum.
  router.get('/albums/tracks', spotifyController.getAlbumTracks);
  // Artista + sus últimos álbumes.
  router.get('/artists/top', spotifyController.getArtistInfo);
  // Búsqueda de artistas por nombre.
  router.get('/artists/search', spotifyController.searchArtists);
  // Login básico (usuario + contraseña)
router.post('/basic-auth/register', basicAuthController.register);
router.post('/basic-auth/login', basicAuthController.login);
router.get('/basic-auth/me', basicAuthController.me);

  // Login de usuario y reproducción en el navegador.
  if (authService) {
    const authController = new AuthController(authService, { frontendUrl });

    router.get('/auth/login', authController.login);
    router.get('/auth/callback', authController.callback);
    router.get('/auth/me', authController.me);
    router.get('/auth/token', authController.token);
    router.post('/auth/logout', authController.logout);

    if (playerService) {
      const playerController = new PlayerController(authService, playerService);
      router.post('/player/play', playerController.play);
    }
  }

  return router;
};

module.exports = createApiRouter;
