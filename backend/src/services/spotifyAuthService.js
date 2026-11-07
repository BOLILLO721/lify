const axios = require('axios');
const crypto = require('crypto');

const SPOTIFY_ACCOUNTS_URL = 'https://accounts.spotify.com';
const SPOTIFY_TOKEN_URL = `${SPOTIFY_ACCOUNTS_URL}/api/token`;
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

// Renovamos el token unos segundos antes de que expire, igual que en
// SpotifyService, para no entregar un token a punto de vencer al SDK.
const TOKEN_EXPIRY_MARGIN_SECONDS = 60;

/**
 * Flujo Authorization Code con token de usuario.
 *
 * A diferencia de SpotifyService (Client Credentials), aquí el token pertenece
 * a una persona: es el único que puede reproducir audio con el Web Playback SDK.
 *
 * Las sesiones se guardan en memoria y se asocian al navegador con una cookie
 * httpOnly. El refresh token nunca sale del backend; al frontend solo se le
 * entrega el access token ya que el SDK lo necesita en JavaScript.
 */
class SpotifyAuthService {
  constructor({ clientId, clientSecret, redirectUri, scopes = [] } = {}) {
    if (!clientId || !clientSecret) {
      throw new Error(
        'Faltan las credenciales de Spotify (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET).'
      );
    }

    if (!redirectUri) {
      throw new Error('Falta SPOTIFY_REDIRECT_URI.');
    }

    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.scopes = scopes;

    // sessionId -> { accessToken, refreshToken, expiresAt, profile }
    this.sessions = new Map();
  }

  get authorizationHeader() {
    return `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`;
  }

  /** Valor aleatorio para protegernos de CSRF en el callback de OAuth. */
  createState() {
    return crypto.randomBytes(16).toString('hex');
  }

  /** URL de autorización a la que mandamos al navegador. */
  buildAuthorizeUrl(state) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: this.scopes.join(' '),
      state,
    });

    return `${SPOTIFY_ACCOUNTS_URL}/authorize?${params.toString()}`;
  }

  /** POST a /api/token con Basic Auth (el secreto nunca viaja al navegador). */
  async requestToken(body) {
    const { data } = await axios.post(SPOTIFY_TOKEN_URL, body.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: this.authorizationHeader,
      },
    });

    return data;
  }

  /** Guarda los tokens y devuelve el id. de sesión. */
  createSession(tokenData) {
    const sessionId = crypto.randomUUID();

    this.sessions.set(sessionId, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? null,
      expiresAt:
        Date.now() + (tokenData.expires_in - TOKEN_EXPIRY_MARGIN_SECONDS) * 1000,
      profile: null,
    });

    return sessionId;
  }

  /** Canjea el `code` del callback por un token de usuario. */
  async exchangeCode(code) {
    const data = await this.requestToken(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
      })
    );

    return this.createSession(data);
  }

  getSession(sessionId) {
    if (!sessionId) return null;
    return this.sessions.get(sessionId) ?? null;
  }

  destroySession(sessionId) {
    if (sessionId) this.sessions.delete(sessionId);
  }

  /** Pide un token nuevo con el refresh token (Spotify puede rotarlo). */
  async refreshSession(sessionId) {
    const session = this.getSession(sessionId);

    if (!session?.refreshToken) return null;

    const data = await this.requestToken(
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: session.refreshToken,
      })
    );

    session.accessToken = data.access_token;
    session.expiresAt =
      Date.now() + (data.expires_in - TOKEN_EXPIRY_MARGIN_SECONDS) * 1000;

    if (data.refresh_token) session.refreshToken = data.refresh_token;

    return session;
  }

  /**
   * Token de usuario listo para usar. Lo renueva si está por caducar.
   * Devuelve null cuando no hay sesión o el refresh token ya no vale.
   */
  async getValidAccessToken(sessionId) {
    const session = this.getSession(sessionId);

    if (!session) return null;
    if (Date.now() < session.expiresAt) return session.accessToken;

    try {
      await this.refreshSession(sessionId);
    } catch (error) {
      // invalid_grant: el usuario revocó el acceso o el refresh token caducó.
      if (error?.response?.status === 400) {
        this.destroySession(sessionId);
        return null;
      }
      throw error;
    }

    return this.getSession(sessionId)?.accessToken ?? null;
  }

  /** Perfil básico para saludar al usuario en la interfaz. */
  async getProfile(accessToken) {
    const { data } = await axios.get(`${SPOTIFY_API_URL}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    return {
      id: data.id ?? null,
      name: data.display_name || data.id || null,
      image: data.images?.[0]?.url ?? null,
    };
  }
}

module.exports = SpotifyAuthService;
