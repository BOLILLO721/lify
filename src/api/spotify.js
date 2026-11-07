import axios from 'axios';

/**
 * Cliente HTTP hacia la API intermediaria de Lify (backend/).
 * En desarrollo el proxy de CRA (campo "proxy" del package.json) reenvía
 * /api al backend, así que no hace falta CORS ni URL absoluta.
 * En producción se define REACT_APP_API_URL con la URL del backend.
 */
const API_BASE = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  // Necesario para que la cookie de sesión viaje si el backend está en otro
  // origen (en desarrollo las peticiones van por el proxy y son same-origin).
  withCredentials: true,
});

// Inyecta el token de autenticación del usuario en cada petición si existe
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * El login es una navegación completa del navegador (no una petición XHR),
 * así que necesita la URL absoluta del backend. Si no hay REACT_APP_API_URL
 * asumimos el backend de desarrollo en el puerto 3001.
 */
const backendOrigin = process.env.REACT_APP_API_URL
  ? process.env.REACT_APP_API_URL.replace(/\/api\/?$/, '')
  : 'http://127.0.0.1:3001';

/** Catálogo inicial: varias canciones de los últimos lanzamientos. */
export const getCatalog = (limit = 24) => api.get('/catalog', { params: { limit } });

/** Búsqueda de canciones por nombre. */
export const searchTracks = (q, limit = 20) => api.get('/tracks', { params: { q, limit } });

/** Borra una canción de la base de datos (solo Admin). */
export const deleteTrack = (id) => api.delete(`/tracks/${id}`);

/** Actualiza el nombre de una canción en la base de datos (solo Admin). */
export const updateTrackName = (id, data) => api.put(`/tracks/${id}`, data);

/** Canciones de un álbum. */
export const getAlbumTracks = (albumId, limit = 20) =>
  api.get('/albums/tracks', { params: { albumId, limit } });

/** Artista + sus últimos álbumes. */
export const getArtistInfo = (artistId) => api.get('/artists/top', { params: { artistId } });

/** Búsqueda de artistas por nombre. */
export const searchArtists = (q, limit = 10) => api.get('/artists/search', { params: { q, limit } });

export const getHealth = () => api.get('/health');

/** URL a la que mandamos al navegador para iniciar sesión en Spotify. */
export const getLoginUrl = () => `${backendOrigin}/api/auth/login`;

/** ¿Hay una sesión de Spotify activa? */
export const getAuthStatus = () => api.get('/auth/me');

/** Access token para el Web Playback SDK (el backend lo renueva si caduca). */
export const getPlaybackToken = () => api.get('/auth/token');

/** Cierra la sesión local del backend. */
export const logout = () => api.post('/auth/logout');

/** Reproduce una canción en el dispositivo del navegador. */
export const playTrack = ({ uri, deviceId }) => api.post('/player/play', { uri, deviceId });

// --- Playlists ---
export const getPlaylists = () => api.get('/playlists');

export const getPlaylist = (id) => api.get(`/playlists/${id}`);

export const createPlaylist = ({ name, description }) =>
  api.post('/playlists', { name, description });

export const updatePlaylist = (id, { name, description }) =>
  api.put(`/playlists/${id}`, { name, description });

export const deletePlaylist = (id) => api.delete(`/playlists/${id}`);

// El cliente SOLO envía el id: el servidor valida contra MongoDB.
export const addTrackToPlaylist = (playlistId, trackId, trackData = null) =>
  api.post(`/playlists/${playlistId}/tracks`, { trackId, track: trackData });

export const reorderPlaylistTracks = (playlistId, order) =>
  api.put(`/playlists/${playlistId}/tracks`, { order });

export const removeTrackFromPlaylist = (playlistId, trackId) =>
  api.delete(`/playlists/${playlistId}/tracks/${trackId}`);

// --- Login básico ---
export const register = ({ username, password }) =>
  api.post('/basic-auth/register', { username, password });

export const login = ({ username, password }) =>
  api.post('/basic-auth/login', { username, password });

export const getMe = (token) => {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return api.get('/basic-auth/me', { headers });
};

// --- Administración (solo Admin) ---

/**
 * Borra las colecciones de canciones, artistas y álbumes y las vuelve a crear
 * vacías (también limpia playlists y el historial de auditoría).
 * El servidor es quien valida que el usuario sea Administrador.
 */
export const resetDatabase = () => api.post('/admin/reset-database');

/** Historial de movimientos de la base de datos (crear, mover, eliminar...). */
export const getAuditLogs = (limit = 50) => api.get('/admin/audit-logs', { params: { limit } });

export default api;
