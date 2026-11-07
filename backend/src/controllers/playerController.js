const { readSessionId, clearSessionCookie } = require('../utils/session');

// spotify:track:<id>, spotify:episode:<id>... El SDK solo reproduce audios.
const SPOTIFY_URI_PATTERN = /^spotify:[a-z]+:[A-Za-z0-9]+$/;

/**
 * Control de reproducción. El audio lo produce el Web Playback SDK en el
 * navegador; aquí solo se envían las órdenes a Spotify con el token del
 * usuario, de modo que el refresh token nunca llega al frontend.
 */
class PlayerController {
  constructor(authService, playerService) {
    this.authService = authService;
    this.playerService = playerService;
  }

  play = async (req, res) => {
    const uri = String(req.body?.uri || '').trim();
    const deviceId = String(req.body?.deviceId || '').trim();

    if (!SPOTIFY_URI_PATTERN.test(uri)) {
      res.status(400).json({ error: 'Falta una canción válida (uri).' });
      return;
    }

    if (!deviceId) {
      res.status(400).json({ error: 'Falta el dispositivo del navegador (deviceId).' });
      return;
    }

    const sessionId = readSessionId(req);

    try {
      const accessToken = await this.authService.getValidAccessToken(sessionId);

      if (!accessToken) {
        res.status(401).json({
          error: 'Conecta tu cuenta de Spotify para reproducir música.',
        });
        return;
      }

      await this.playerService.play(accessToken, { uri, deviceId });
      res.status(204).end();
    } catch (err) {
      const status = err?.response?.status;
      const spotifyMessage = err?.response?.data?.error?.message;

      console.error('[player] play:', spotifyMessage || err.message);

      if (status === 401) {
        this.authService.destroySession(sessionId);
        res.setHeader('Set-Cookie', clearSessionCookie());
        res.status(401).json({
          error: 'La sesión de Spotify caducó. Vuelve a conectar tu cuenta.',
        });
        return;
      }

      if (status === 404) {
        res.status(409).json({
          error: 'El reproductor del navegador aún no está listo. Espera un segundo e inténtalo de nuevo.',
        });
        return;
      }

      if (status === 403) {
        res.status(403).json({
          error: `Spotify rechazó la reproducción: ${
            spotifyMessage || 'puede que la canción no esté disponible en tu mercado'
          }`,
        });
        return;
      }

      res.status(502).json({
        error: spotifyMessage
          ? `Error de Spotify: ${spotifyMessage}`
          : 'No se pudo reproducir la canción.',
      });
    }
  };
}

module.exports = PlayerController;
