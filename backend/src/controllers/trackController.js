// src/controllers/trackController.js
const Track = require('../models/Track');
const Playlist = require('../models/Playlist');
const { normalizeText } = require('../models/searchText');

// Auditoría opcional: en los tests puede no inyectarse.
let auditService = null;

class TrackController {
  /** Se llama una vez al construir la app (ver routes/api.js). */
  static setAuditService(service) {
    auditService = service;
  }

  static async audit(req, entry) {
    if (auditService) await auditService.log(req, entry);
  }

  /**
   * PUT /api/tracks/:id
   * Permite al administrador editar el nombre de una canción en la base de datos.
   * Body: { name, uri, artists, album, durationMs }
   */
  static async updateTrackName(req, res) {
    try {
      const { id } = req.params;
      const { name, uri, artists, album, durationMs } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'El nombre de la canción es obligatorio' });
      }

      const trimmedName = name.trim();

      let track = await Track.findById(id);
      let previousName = null;

      if (!track) {
        // Si aún no estaba en la colección Track, se crea con los datos proporcionados
        const artistsList = Array.isArray(artists) ? artists : [];
        track = await Track.create({
          _id: id,
          name: trimmedName,
          uri: uri || `spotify:track:${id}`,
          artists: artistsList,
          album: album || null,
          durationMs: durationMs || null,
          searchText: normalizeText(trimmedName, artistsList, album?.name),
        });
      } else {
        previousName = track.name;
        track.name = trimmedName;
        track.searchText = normalizeText(trimmedName, track.artists, track.album?.name);
        await track.save();
      }

      // Sincronizar el nuevo nombre en todas las playlists donde esté agregada
      await Playlist.updateMany(
        { 'tracks.id': id },
        { $set: { 'tracks.$[elem].name': trimmedName } },
        { arrayFilters: [{ 'elem.id': id }] }
      );

      await TrackController.audit(req, {
        action: 'track.update',
        resource: 'Track',
        resourceId: id,
        details: { before: { name: previousName }, after: { name: track.name } },
      });

      res.json({
        message: 'Nombre de canción actualizado con éxito',
        track: {
          id: track._id,
          name: track.name,
          uri: track.uri,
          artists: track.artists,
          album: track.album,
          durationMs: track.durationMs,
        },
      });
    } catch (error) {
      console.error('[trackController] updateTrackName:', error.message);
      res.status(500).json({ error: 'Error al actualizar el nombre de la canción' });
    }
  }

  /**
   * DELETE /api/tracks/:id
   * Elimina la canción de MongoDB. No modifica Spotify ni las copias que ya
   * estén guardadas dentro de las playlists.
   */
  static async deleteTrack(req, res, store) {
    const id = String((req.params && req.params.id) || '').trim();

    if (!id) {
      res.status(400).json({ error: 'Falta el id de la canción' });
      return;
    }

    if (!store || !store.isReady()) {
      res.status(503).json({
        error: 'La base de datos no está disponible. Inténtalo en unos segundos.',
      });
      return;
    }

    // Los datos se los pasamos al store para que el borrado los devuelva y se
    // puedan dejar en el registro de auditoría.
    const deleted = await store.deleteTrack(id);

    if (!deleted) {
      res.status(404).json({ error: 'La canción no existe en la base de datos' });
      return;
    }

    await TrackController.audit(req, {
      action: 'track.delete',
      resource: 'Track',
      resourceId: id,
      details: { track: deleted },
    });

    res.json({ message: 'Canción eliminada', id });
  }
}

module.exports = TrackController;
