const axios = require('axios');

const SPOTIFY_API_URL = 'https://api.spotify.com/v1';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

// Renovamos el token unos segundos antes de que expire para no usarlo vencido.
const TOKEN_EXPIRY_MARGIN_SECONDS = 60;

const MAX_SEARCH_LIMIT =10;

/**
 * Deja el `limit` de búsqueda dentro de lo que Spotify acepta: si llega algo
 * inválido usamos el máximo permitido y nunca lo superamos.
 */
const clampSearchLimit = (limit) => {
  const parsed = Number(limit);

  if (!Number.isFinite(parsed) || parsed <= 0) return MAX_SEARCH_LIMIT;

  return Math.min(Math.floor(parsed), MAX_SEARCH_LIMIT);
};

class SpotifyService {
  constructor({ clientId, clientSecret, market = 'ES' } = {}) {
    if (!clientId || !clientSecret) {
      throw new Error(
        'Faltan las credenciales de Spotify (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET).'
      );
    }

    this.clientId = clientId;
    this.clientSecret = clientSecret;
    // Mercado para los catálogos por país (álbumes, etc.).
    this.market = market;
    this.accessToken = null;
    this.expiresAt = 0;
  }

  /**
   * Client Credentials flow: pide un token de aplicación (no de usuario).
   * Spotify lo devuelve con expires_in = 3600, por eso lo cacheamos y
   * solo lo pedimos de nuevo cuando está por vencer.
   */
  async getAccessToken() {
    if (this.accessToken && Date.now() < this.expiresAt) {
      return this.accessToken;
    }

    const body = new URLSearchParams({ grant_type: 'client_credentials' });

    const { data } = await axios.post(SPOTIFY_TOKEN_URL, body.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          `${this.clientId}:${this.clientSecret}`
        ).toString('base64')}`,
      },
    });

    this.accessToken = data.access_token;
    this.expiresAt =
      Date.now() + (data.expires_in - TOKEN_EXPIRY_MARGIN_SECONDS) * 1000;

    return this.accessToken;
  }

  async request(path, { params } = {}) {
    const token = await this.getAccessToken();

    // Delegamos los query params a axios para que los codifique correctamente
    // (los títulos con acentos o espacios no se pueden concatenar a mano).
    return axios.get(`${SPOTIFY_API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      params,
    });
  }

  /**
   * Búsqueda de canciones. Spotify indexa en `q` también el nombre del
   * artista y el del álbum, así que esta misma ruta sirve para buscar por
   * título, por artista o por álbum.
   */
  async searchTracks(query, { limit = MAX_SEARCH_LIMIT } = {}) {
    const response = await this.request('/search', {
      params: {
        q: query,
        type: 'track',
        limit: clampSearchLimit(limit),
        market: this.market,
      },
    });
    return response.data;
  }

  /**
   * Datos de un álbum. Con token de aplicación, /albums/{id}/tracks no
   * incluye el álbum en cada canción, así que lo pedimos aparte para
   * devolver las canciones completas.
   */
  async getAlbum(albumId) {
    const response = await this.request(`/albums/${albumId}`);
    return response.data;
  }

  /**
   * Canciones de un álbum. La respuesta trae los mismos campos que la
   * búsqueda de canciones, así que el mapper es el mismo.
   */
  async getAlbumTracks(albumId, { limit = 20 } = {}) {
    const response = await this.request(`/albums/${albumId}/tracks`, {
      params: { market: this.market, limit },
    });
    return response.data;
  }

  async getArtist(artistId) {
    const response = await this.request(`/artists/${artistId}`);
    return response.data;
  }

  async getArtistAlbums(artistId, { limit = 6 } = {}) {
    const response = await this.request(`/artists/${artistId}/albums`, {
      params: {
        market: this.market,
        include_groups: 'album,single',
        limit,
      },
    });
    return response.data;
  }

  async searchArtists(query, { limit = MAX_SEARCH_LIMIT } = {}) {
    const response = await this.request('/search', {
      params: {
        q: query,
        type: 'artist',
        limit: clampSearchLimit(limit),
        market: this.market,
      },
    });
    return response.data;
  }
}

module.exports = SpotifyService;
