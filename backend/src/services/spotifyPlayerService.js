const axios = require('axios');

const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

/**
 * Órdenes de reproducción contra la Web API usando el token del usuario.
 * El audio suena en el dispositivo Connect que crea el Web Playback SDK
 * dentro del navegador; aquí solo se le dice qué canción poner.
 */
class SpotifyPlayerService {
  async request(accessToken, { method, path, params, data }) {
    return axios({
      method,
      url: `${SPOTIFY_API_URL}${path}`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      params,
      data,
    });
  }

  /**
   * Activa el dispositivo del navegador. Spotify no empieza a sonar con la
   * transferencia (play: false), así que después lanzamos el play.
   */
  async transfer(accessToken, deviceId) {
    await this.request(accessToken, {
      method: 'put',
      path: '/me/player',
      data: { device_ids: [deviceId], play: false },
    });
  }

  /**
   * Reproduce una canción en el dispositivo indicado.
   * Si la transferencia falla (por ejemplo, el dispositivo aún no aparece en
   * Spotify) seguimos con el play: su error será el que se muestre.
   */
  async play(accessToken, { uri, deviceId }) {
    if (deviceId) {
      await this.transfer(accessToken, deviceId).catch(() => {});
    }

    await this.request(accessToken, {
      method: 'put',
      path: '/me/player/play',
      params: deviceId ? { device_id: deviceId } : undefined,
      data: { uris: [uri] },
    });
  }
}

module.exports = SpotifyPlayerService;
