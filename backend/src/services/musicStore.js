const { normalizeText } = require('../models/searchText');

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Guarda en MongoDB lo que llega de Spotify y lo vuelve a servir cuando
 * Spotify no responde.
 *
 * Regla de oro: la base de datos NUNCA debe tumbar la API. Ningún método
 * lanza; si MongoDB no está disponible, guardar no hace nada y leer devuelve
 * una lista vacía.
 */
class MusicStore {
  constructor({ models, isReady, logger = console }) {
    this.models = models;
    this.isReady = isReady;
    this.logger = logger;
  }

  /** Upsert por id de Spotify: repetir la misma canción solo la actualiza. */
  async #upsertMany(Model, docs) {
    const valid = docs.filter((doc) => doc && doc._id);
    if (!valid.length) return 0;

    if (!this.isReady()) {
      this.logger.warn(`[db] ${Model.modelName}: sin conexión a MongoDB, no se guardó`);
      return 0;
    }

    try {
      await Model.bulkWrite(
        valid.map(({ _id, ...fields }) => ({
          updateOne: {
            filter: { _id },
            // $setOnInsert: si el registro ya existe NO se toca, así lo que
            // modifiques a mano en la base no se pisa con datos de Spotify.
            update: { $setOnInsert: fields },
            upsert: true,
          },
        })),
        { ordered: false }
      );
      this.logger.log(`[db] ${Model.modelName}: ${valid.length} registro(s) procesado(s)`);
      return valid.length;
    } catch (error) {
      this.logger.error(`[db] No se pudo guardar en ${Model.modelName}:`, error.message);
      return 0;
    }
  }

  saveTracks(tracks = []) {
    return this.#upsertMany(
      this.models.Track,
      tracks.map((track) => ({
        _id: track.id,
        name: track.name,
        uri: track.uri,
        artists: track.artists,
        album: track.album,
        url: track.url,
        durationMs: track.durationMs,
        searchText: normalizeText(track.name, track.artists, track.album?.name),
      }))
    );
  }

  /**
   * Borra una canción de la colección Track.
   * Devuelve el documento borrado (para poder auditarlo) o null si no existe,
   * si MongoDB no está disponible o si la escritura falla.
   */
  async deleteTrack(id) {
    if (!this.isReady()) {
      this.logger.warn('[db] Track: sin conexión a MongoDB, no se borró');
      return null;
    }

    try {
      const deleted = await this.models.Track.findByIdAndDelete(id).lean();
      if (!deleted) return null;

      return {
        id: deleted._id,
        name: deleted.name,
        uri: deleted.uri,
        artists: deleted.artists,
        album: deleted.album,
      };
    } catch (error) {
      this.logger.error('[db] No se pudo borrar Track:', error.message);
      return null;
    }
  }

  saveArtists(artists = []) {
    return this.#upsertMany(
      this.models.Artist,
      artists.map((artist) => ({
        _id: artist.id,
        name: artist.name,
        image: artist.image,
        url: artist.url,
        searchText: normalizeText(artist.name),
      }))
    );
  }

  saveAlbums(albums = [], artistId = null) {
    return this.#upsertMany(
      this.models.Album,
      albums.map((album) => ({
        _id: album.id,
        name: album.name,
        releaseDate: album.releaseDate,
        image: album.image,
        url: album.url,
        totalTracks: album.totalTracks,
        artistId,
      }))
    );
  }

  /** Mismo formato que `mapTrack`, para que el frontend no note la diferencia. */
  #toTrack(doc) {
    return {
      id: doc._id,
      name: doc.name,
      uri: doc.uri,
      artists: doc.artists,
      album: doc.album,
      url: doc.url,
      durationMs: doc.durationMs,
    };
  }

  /**
   * Busca en `searchText` (sin tildes) y también directamente en los campos
   * reales, para que los datos editados a mano en la base se sigan encontrando.
   */
  #textFilter(text, fields = ['name', 'artists']) {
    const plain = new RegExp(escapeRegex(text));
    const loose = new RegExp(escapeRegex(text), 'i');
    return { $or: [{ searchText: plain }, ...fields.map((field) => ({ [field]: loose }))] };
  }

  /** Cuántos registros hay en cada colección (para diagnóstico). */
  async counts() {
    if (!this.isReady()) return null;

    try {
      const [tracks, artists, albums] = await Promise.all([
        this.models.Track.estimatedDocumentCount(),
        this.models.Artist.estimatedDocumentCount(),
        this.models.Album.estimatedDocumentCount(),
      ]);
      return { tracks, artists, albums };
    } catch {
      return null;
    }
  }

  async findTracks(query, limit = 10) {
    if (!this.isReady()) return [];

    try {
      const text = normalizeText(query);
      const filter = text ? this.#textFilter(text) : {};
      const docs = await this.models.Track.find(filter).sort({ updatedAt: -1 }).limit(limit).lean();
      return docs.map((doc) => this.#toTrack(doc));
    } catch (error) {
      this.logger.error('[db] No se pudo leer Track:', error.message);
      return [];
    }
  }

  async findAlbumTracks(albumId, limit = 20) {
    if (!this.isReady()) return [];

    try {
      const docs = await this.models.Track.find({ 'album.id': albumId }).limit(limit).lean();
      return docs.map((doc) => this.#toTrack(doc));
    } catch (error) {
      this.logger.error('[db] No se pudo leer las canciones del álbum:', error.message);
      return [];
    }
  }

  async getAlbum(albumId) {
    if (!this.isReady()) return null;

    try {
      return await this.models.Album.findById(albumId).lean();
    } catch (error) {
      this.logger.error('[db] No se pudo leer Album:', error.message);
      return null;
    }
  }

  async getArtist(artistId) {
    if (!this.isReady()) return null;

    try {
      const doc = await this.models.Artist.findById(artistId).lean();
      return doc ? { id: doc._id, name: doc.name, image: doc.image, url: doc.url } : null;
    } catch (error) {
      this.logger.error('[db] No se pudo leer Artist:', error.message);
      return null;
    }
  }

  async getArtistAlbums(artistId, limit = 10) {
    if (!this.isReady()) return [];

    try {
      const docs = await this.models.Album.find({ artistId })
        .sort({ releaseDate: -1 })
        .limit(limit)
        .lean();
      return docs.map((doc) => ({
        id: doc._id,
        name: doc.name,
        releaseDate: doc.releaseDate,
        image: doc.image,
        url: doc.url,
        totalTracks: doc.totalTracks,
      }));
    } catch (error) {
      this.logger.error('[db] No se pudo leer Album:', error.message);
      return [];
    }
  }

  async findArtists(query, limit = 10) {
    if (!this.isReady()) return [];

    try {
      const text = normalizeText(query);
      const docs = await this.models.Artist.find(this.#textFilter(text, ['name']))
        .limit(limit)
        .lean();
      return docs.map((doc) => ({ id: doc._id, name: doc.name, image: doc.image, url: doc.url }));
    } catch (error) {
      this.logger.error('[db] No se pudo leer Artist:', error.message);
      return [];
    }
  }

  getCatalog(limit = 24) {
    return this.findTracks('', limit);
  }
}

module.exports = MusicStore;
