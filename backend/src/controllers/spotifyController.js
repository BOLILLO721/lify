const { mapArtist, mapAlbum, mapTrack } = require('../mappers/spotifyMapper');

const DEFAULT_SEARCH_LIMIT = 10;
const DEFAULT_CATALOG_LIMIT = 24;
const DEFAULT_ALBUM_TRACK_LIMIT = 20;
const DEFAULT_ARTIST_LIMIT = 10;
// Tope de la Web API de Spotify: 50 elementos por página.
const MAX_LIMIT = 50;
// /v1/search tiene un tope menor: Spotify responde 400 "Invalid limit" por
// encima de 10 (ver spotifyService.MAX_SEARCH_LIMIT).
const MAX_SEARCH_LIMIT = 10;

/**
 * Artistas que forman el catálogo inicial.
 *
 * Spotify bloquea `/v1/browse/*` y las playlists para los tokens de
 * aplicación (devuelven 403), así que no hay forma de pedir "lo más
 * escuchado" directamente. La alternativa es buscar canciones por el nombre
 * de unos artistas: `/v1/search?q=<artista>&type=track` sí funciona con
 * Client Credentials y devuelve sus temas más relevantes.
 *
 * Se puede cambiar por entorno con CATALOG_SEEDS="Bad Bunny,Rosalía".
*/
const DEFAULT_CATALOG_SEEDS = [
  'Nsqk',
  'Diomedes diaz',
  'Mon Laferte',
  'Alvaro Diaz',
  'silvestre dangond',
];
 

/**
 * Une dos listas sin repetir ids. Va primero la de la base de datos, así lo
 * que se edite a mano en MongoDB manda sobre lo que devuelva Spotify.
 */
const mergeById = (primary, secondary, limit) => {
  const seen = new Set();

  return [...primary, ...secondary]
    .filter((item) => {
      const key = item.id ?? item.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
};

/**
 * Normaliza el `limit` que llega por la query: si no es un número válido
 * usamos el valor por defecto y nunca superamos el máximo de Spotify.
 */
const clampLimit = (value, fallback, max = MAX_LIMIT) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;

  return Math.min(Math.floor(parsed), max);
};

/**
 * Traduce un fallo del servicio en una respuesta HTTP. Si Spotify contestó con
 * un error propio (400, 401, 403...) se reenvía su mensaje para que el
 * frontend muestre la causa real y no un "error de comunicación" genérico.
 */
const sendSpotifyError = (res, error, fallback) => {
  const spotifyMessage = error?.response?.data?.error?.message;

  if (spotifyMessage) {
    res.status(502).json({ error: `Error de Spotify: ${spotifyMessage}` });
    return;
  }

  res.status(500).json({ error: fallback });
};

class SpotifyController {
  // Se aplica Inyección de Dependencias pasando el servicio por el constructor.
  // Esto permite reemplazar el servicio real por uno simulado (mock) durante las
  // pruebas unitarias, desacoplando el código del transporte HTTP.
  constructor(
    spotifyService,
    { catalogSeeds = DEFAULT_CATALOG_SEEDS, store = null, databaseOnly = false, dbFirst = false } = {}
  ) {
    this.spotifyService = spotifyService;
    this.catalogSeeds = catalogSeeds;
    // MusicStore opcional (MongoDB). Si no se pasa, la API funciona igual que antes.
    this.store = store;
    // Con databaseOnly Spotify no se consulta nunca: todo sale de MongoDB.
    this.databaseOnly = databaseOnly && Boolean(store);
    // Con dbFirst se lee primero de MongoDB y Spotify solo completa lo que falta.
    this.dbFirst = dbFirst && Boolean(store) && !this.databaseOnly;
  }

  /** En modo base de datos, si MongoDB no está conectado se avisa con un 503. */
  dbUnavailable(res) {
    if (this.store.isReady()) return false;

    res.status(503).json({ error: 'La base de datos no está disponible. Inténtalo en unos segundos.' });
    return true;
  }

  /**
   * Catálogo inicial: varias canciones sin que el usuario tenga que buscar.
   * Se arma buscando por unos artistas semilla (ver DEFAULT_CATALOG_SEEDS).
   */
  getCatalog = async (req, res) => {
    try {
      const limit = clampLimit(req.query && req.query.limit, DEFAULT_CATALOG_LIMIT);

      if (this.databaseOnly) {
        if (this.dbUnavailable(res)) return;
        res.json({ tracks: await this.store.getCatalog(limit) });
        return;
      }
      const perSeed = Math.max(1, Math.ceil(limit / this.catalogSeeds.length));

      // Base de datos primero: si ya hay suficiente, no se llama a Spotify.
      const stored = this.dbFirst ? await this.store.getCatalog(limit) : [];

      if (stored.length >= limit) {
        res.json({ tracks: stored });
        return;
      }

      // Cada artista se busca en paralelo y, si uno falla, el resto del
      // catálogo se conserva.
      const results = await Promise.all(
        this.catalogSeeds.map((seed) =>
          this.spotifyService
            .searchTracks(seed, { limit: perSeed })
            .then((data) => {
              console.log('[DEBUG getCatalog][RAW] seed:', seed, JSON.stringify(data, null, 2));
              return ((data.tracks && data.tracks.items) || []).map(mapTrack);
            })
            .catch(() => [])
        )
      );

      let tracks = mergeById(stored, results.flat(), limit);

      if (results.flat().length) {
        // Sin await: guardar en la base no debe retrasar la respuesta.
        this.store?.saveTracks(tracks);
      } else if (this.store && !stored.length) {
        // Spotify no respondió: se sirve lo que ya está guardado.
        tracks = await this.store.getCatalog(limit);
      }

      res.json({ tracks });
    } catch (error) {
      console.error(
        '[spotify] getCatalog:',
        error?.response?.data?.error?.message || error.message
      );
      sendSpotifyError(res, error, 'Error de comunicación con Spotify');
    }
  };

  /**
   * Búsqueda de canciones por nombre (Spotify también indexa artista y álbum).
   * A diferencia de las demás rutas, `q` es obligatorio: sin él no hay nada
   * que buscar, así que se responde con un 400 en vez de inventar un valor.
   */
  searchTracks = async (req, res) => {
    try {
      const query = String((req.query && req.query.q) || '').trim();

      if (!query) {
        res.status(400).json({ error: 'Falta el parámetro de búsqueda (q)' });
        return;
      }

      const limit = clampLimit(
        req.query && req.query.limit,
        DEFAULT_SEARCH_LIMIT,
        MAX_SEARCH_LIMIT
      );

      if (this.databaseOnly) {
        if (this.dbUnavailable(res)) return;
        res.json({ tracks: await this.store.findTracks(query, limit) });
        return;
      }

      // Base de datos primero; Spotify solo completa lo que falte.
      const stored = this.dbFirst ? await this.store.findTracks(query, limit) : [];

      if (stored.length >= limit) {
        res.json({ tracks: stored });
        return;
      }

      const data = await this.spotifyService.searchTracks(query, { limit });
      const items = (data.tracks && data.tracks.items) || [];
      const fresh = items.map(mapTrack);

      this.store?.saveTracks(fresh);

      res.json({ tracks: mergeById(stored, fresh, limit) });
    } catch (error) {
      // Si Spotify falló pero hay copia en la base, se responde con ella.
      const stored = this.store
        ? await this.store.findTracks(String(req.query?.q || '').trim(), DEFAULT_SEARCH_LIMIT)
        : [];

      if (stored.length) {
        res.json({ tracks: stored });
        return;
      }

      console.error(
        '[spotify] searchTracks:',
        error?.response?.data?.error?.message || error.message
      );
      sendSpotifyError(res, error, 'Error de comunicación con Spotify');
    }
  };

  /**
   * Canciones de un álbum concreto.
   * Spotify no incluye el álbum en cada canción de /albums/{id}/tracks, así
   * que lo pedimos aparte para que el frontend reciba las canciones
   * completas (con nombre y portada del álbum).
   */
  getAlbumTracks = async (req, res) => {
    try {
      const albumId = String((req.query && req.query.albumId) || '').trim();

      if (!albumId) {
        res.status(400).json({ error: 'Falta el parámetro albumId' });
        return;
      }

      const limit = clampLimit(
        req.query && req.query.limit,
        DEFAULT_ALBUM_TRACK_LIMIT
      );

      if (this.databaseOnly) {
        if (this.dbUnavailable(res)) return;
        res.json({ tracks: await this.store.findAlbumTracks(albumId, limit) });
        return;
      }

      // Base de datos primero: se usa si ya están todas las canciones del álbum.
      if (this.dbFirst) {
        const [storedTracks, storedAlbum] = await Promise.all([
          this.store.findAlbumTracks(albumId, limit),
          this.store.getAlbum(albumId),
        ]);
        const expected = Math.min(limit, storedAlbum?.totalTracks ?? limit);

        if (storedTracks.length && storedTracks.length >= expected) {
          res.json({ tracks: storedTracks });
          return;
        }
      }

      const data = await this.spotifyService.getAlbumTracks(albumId, { limit });
      const items = (data && data.items) || [];

      // Si el álbum no se puede leer, las canciones se devuelven igual.
      const album = await this.spotifyService.getAlbum(albumId).catch(() => null);
      const albumInfo = album
        ? {
            id: album.id ?? null,
            name: album.name ?? null,
            image: album.images?.[0]?.url ?? null,
          }
        : null;

      const tracks = items.map((track) => ({ ...mapTrack(track), album: albumInfo }));

      this.store?.saveTracks(tracks);

      res.json({ tracks });
    } catch (error) {
      console.error(
        '[spotify] getAlbumTracks:',
        error?.response?.data?.error?.message || error.message
      );
      sendSpotifyError(res, error, 'Error de comunicación con Spotify');
    }
  };

  /**
   * Perfil del artista: sus datos básicos y sus últimos lanzamientos.
   * Nota: /v1/artists/:id/top-tracks devuelve 403 con un token de aplicación
   * (Client Credentials), por eso los "tops" se resuelven con los álbumes.
   */
  getArtistInfo = async (req, res) => {
    try {
      const artistId = (req.query && req.query.artistId) || '';
      const limit = clampLimit(req.query && req.query.limit, DEFAULT_ARTIST_LIMIT);

      if (!artistId) {
        res.status(400).json({ error: 'Falta el parámetro artistId' });
        return;
      }

      if (this.databaseOnly) {
        if (this.dbUnavailable(res)) return;

        const stored = await this.store.getArtist(artistId);

        if (!stored) {
          res.status(404).json({ error: 'Artista no encontrado en la base de datos' });
          return;
        }

        res.json({ artist: stored, albums: await this.store.getArtistAlbums(artistId, limit) });
        return;
      }

      // Base de datos primero: se usa si el artista y sus álbumes ya están guardados.
      if (this.dbFirst) {
        const storedArtist = await this.store.getArtist(artistId);
        const storedAlbums = storedArtist
          ? await this.store.getArtistAlbums(artistId, limit)
          : [];

        if (storedArtist && storedAlbums.length) {
          res.json({ artist: storedArtist, albums: storedAlbums });
          return;
        }
      }

      const [artist, albums] = await Promise.all([
        this.spotifyService.getArtist(artistId),
        this.spotifyService.getArtistAlbums(artistId, { limit }),
      ]);

      const mappedArtist = mapArtist(artist);
      const mappedAlbums = (albums.items || []).map(mapAlbum);

      this.store?.saveArtists([mappedArtist]);
      this.store?.saveAlbums(mappedAlbums, mappedArtist.id);

      res.json({ artist: mappedArtist, albums: mappedAlbums });
    } catch (error) {
      console.error(
        '[spotify] getArtistInfo:',
        error?.response?.data?.error?.message || error.message
      );
      sendSpotifyError(res, error, 'Error al obtener el artista');
    }
  };

  searchArtists = async (req, res) => {
    try {
      const query = String((req.query && req.query.q) || '').trim();

      if (!query) {
        res.status(400).json({ error: 'Falta el parámetro de búsqueda (q)' });
        return;
      }

      const limit = clampLimit(
        req.query && req.query.limit,
        DEFAULT_ARTIST_LIMIT,
        MAX_SEARCH_LIMIT
      );

      if (this.databaseOnly) {
        if (this.dbUnavailable(res)) return;
        res.json({ artists: await this.store.findArtists(query, limit) });
        return;
      }

      const stored = this.dbFirst ? await this.store.findArtists(query, limit) : [];

      if (stored.length >= limit) {
        res.json({ artists: stored });
        return;
      }

      const data = await this.spotifyService.searchArtists(query, { limit });

      const fresh = (data.artists && data.artists.items
        ? data.artists.items
        : []
      ).map(mapArtist);

      this.store?.saveArtists(fresh);

      res.json({ artists: mergeById(stored, fresh, limit) });
    } catch (error) {
      console.error(
        '[spotify] searchArtists:',
        error?.response?.data?.error?.message || error.message
      );
      sendSpotifyError(res, error, 'Error al buscar el artista');
    }
  };
}

module.exports = SpotifyController;
