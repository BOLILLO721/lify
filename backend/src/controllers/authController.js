const {
  readSessionId,
  sessionCookie,
  clearSessionCookie,
  stateCookie,
  clearStateCookie,
  STATE_COOKIE,
} = require('../utils/session');
const { readCookie } = require('../utils/cookies');

/**
 * Endpoints del login con Spotify (Authorization Code).
 *
 * El navegador solo ve el access token (el SDK lo necesita en JavaScript).
 * El refresh token se queda en la sesión en memoria del backend.
 */
class AuthController {
  constructor(authService, { frontendUrl }) {
    this.authService = authService;
    this.frontendUrl = (frontendUrl || '').replace(/\/$/, '');
  }

  /** Redirige a Spotify pidiendo permiso para los scopes configurados. */
  login = (req, res) => {
    const state = this.authService.createState();

    res.setHeader('Set-Cookie', stateCookie(state));
    res.redirect(this.authService.buildAuthorizeUrl(state));
  };

  /** Vuelve de Spotify: canjea el code y crea la sesión. */
  callback = async (req, res) => {
    const { code, state, error } = req.query || {};

    // El usuario puede rechazar el acceso desde la pantalla de Spotify.
    if (error) {
      res.redirect(`${this.frontendUrl}/?auth=error`);
      return;
    }

    const expectedState = readCookie(req, STATE_COOKIE);

    if (!code || !state || !expectedState || state !== expectedState) {
      res.status(400).json({
        error: 'Respuesta de Spotify inválida. Vuelve a iniciar el login.',
      });
      return;
    }

    try {
      const sessionId = await this.authService.exchangeCode(String(code));
      const session = this.authService.getSession(sessionId);

      // El perfil es solo decorativo: si falla, el login sigue valiendo.
      session.profile = await this.authService
        .getProfile(session.accessToken)
        .catch(() => null);

      res.setHeader('Set-Cookie', [clearStateCookie(), sessionCookie(sessionId)]);
      res.redirect(`${this.frontendUrl}/`);
    } catch (err) {
      console.error(
        '[auth] callback:',
        err?.response?.data?.error_description || err.message
      );
      res.redirect(`${this.frontendUrl}/?auth=error`);
    }
  };

  /** ¿Hay sesión activa? El frontend lo usa al arrancar. */
  me = (req, res) => {
    const session = this.authService.getSession(readSessionId(req));

    if (!session) {
      res.json({ connected: false, user: null });
      return;
    }

    res.json({ connected: true, user: session.profile ?? null });
  };

  /**
   * Token fresco para el Web Playback SDK. El SDK llama a esta ruta cada vez
   * que conecta y cuando el token de una hora caduca.
   */
  token = async (req, res) => {
    const sessionId = readSessionId(req);

    try {
      const accessToken = await this.authService.getValidAccessToken(sessionId);

      if (!accessToken) {
        res.status(401).json({ error: 'No hay una sesión de Spotify activa.' });
        return;
      }

      // Nunca cachear: es un token de acceso.
      res.setHeader('Cache-Control', 'no-store');
      res.json({ access_token: accessToken });
    } catch (err) {
      console.error(
        '[auth] token:',
        err?.response?.data?.error_description || err.message
      );
      res.status(502).json({ error: 'No se pudo renovar el token de Spotify.' });
    }
  };

  /** Cierra la sesión local (no revoca el acceso en Spotify). */
  logout = (req, res) => {
    this.authService.destroySession(readSessionId(req));

    res.setHeader('Set-Cookie', clearSessionCookie());
    res.status(204).end();
  };
}

module.exports = AuthController;
