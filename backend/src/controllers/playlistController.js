// src/controllers/playlistController.js
const mongoose = require('mongoose');
const Playlist = require('../models/Playlist');
const Track = require('../models/Track');

// Auditoría opcional: en los tests puede no inyectarse.
let auditService = null;

/**
 * CRUD de playlists con control de roles:
 * - Admin: Acceso completo a ver, gestionar y moderar todas las playlists.
 * - Usuario normal: Solo puede ver, crear, reordenar y eliminar canciones de sus propias playlists.
 */
class PlaylistController {
  /** Se llama una vez al construir la app (ver routes/api.js). */
  static setAuditService(service) {
    auditService = service;
  }

  static async audit(req, entry) {
    if (auditService) await auditService.log(req, entry);
  }

  // GET /api/playlists
  static async getPlaylists(req, res) {
    try {
      const isAdmin = req.user.role === 'admin';
      const filter = isAdmin ? {} : { userId: req.user.userId };
      const playlists = await Playlist.find(filter).sort({ updatedAt: -1 }).lean();
      res.json({ playlists });
    } catch (error) {
      console.error('[playlistController] getPlaylists:', error.message);
      res.status(500).json({ error: 'Error al obtener las playlists' });
    }
  }

  // GET /api/playlists/:id
  static async getPlaylistById(req, res) {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'ID de playlist no válido' });
      }

      const isAdmin = req.user.role === 'admin';
      const filter = isAdmin
        ? { _id: req.params.id }
        : { _id: req.params.id, userId: req.user.userId };

      const playlist = await Playlist.findOne(filter).lean();

      if (!playlist) return res.status(404).json({ error: 'Playlist no encontrada' });
      res.json({ playlist });
    } catch (error) {
      console.error('[playlistController] getPlaylistById:', error.message);
      res.status(500).json({ error: 'Error al obtener la playlist' });
    }
  }

  // POST /api/playlists
  static async createPlaylist(req, res) {
    try {
      const { name, description = '' } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'El nombre de la playlist es obligatorio' });
      }

      const playlist = await Playlist.create({
        userId: req.user.userId,
        name: name.trim(),
        description: typeof description === 'string' ? description.trim() : '',
        tracks: [],
      });

      await PlaylistController.audit(req, {
        action: 'playlist.create',
        resource: 'Playlist',
        resourceId: playlist._id,
        details: { name: playlist.name },
      });

      res.status(201).json({ playlist });
    } catch (error) {
      console.error('[playlistController] createPlaylist:', error.message);
      res.status(500).json({ error: 'Error al crear la playlist' });
    }
  }

  // PUT /api/playlists/:id  (solo metadatos: nombre y descripción)
  static async updatePlaylist(req, res) {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'ID de playlist no válido' });
      }

      const { name, description } = req.body;
      const updateData = {};

      if (name !== undefined) {
        if (typeof name !== 'string' || !name.trim()) {
          return res.status(400).json({ error: 'El nombre no puede estar vacío' });
        }
        updateData.name = name.trim();
      }

      if (description !== undefined) {
        updateData.description =
          typeof description === 'string' ? description.trim() : '';
      }

      const isAdmin = req.user.role === 'admin';
      const filter = isAdmin
        ? { _id: req.params.id }
        : { _id: req.params.id, userId: req.user.userId };

      const playlist = await Playlist.findOneAndUpdate(filter, updateData, {
        new: true,
        runValidators: true,
      });

      if (!playlist) return res.status(404).json({ error: 'Playlist no encontrada' });

      await PlaylistController.audit(req, {
        action: 'playlist.update',
        resource: 'Playlist',
        resourceId: playlist._id,
        details: { changes: updateData },
      });

      res.json({ playlist });
    } catch (error) {
      console.error('[playlistController] updatePlaylist:', error.message);
      res.status(500).json({ error: 'Error al actualizar la playlist' });
    }
  }

  // DELETE /api/playlists/:id
  static async deletePlaylist(req, res) {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'ID de playlist no válido' });
      }

      const isAdmin = req.user.role === 'admin';
      const filter = isAdmin
        ? { _id: req.params.id }
        : { _id: req.params.id, userId: req.user.userId };

      const playlist = await Playlist.findOneAndDelete(filter);

      if (!playlist) return res.status(404).json({ error: 'Playlist no encontrada' });

      await PlaylistController.audit(req, {
        action: 'playlist.delete',
        resource: 'Playlist',
        resourceId: playlist._id,
        details: { name: playlist.name, trackCount: playlist.tracks.length },
      });

      res.json({ message: 'Playlist eliminada', id: req.params.id });
    } catch (error) {
      console.error('[playlistController] deletePlaylist:', error.message);
      res.status(500).json({ error: 'Error al eliminar la playlist' });
    }
  }

  // POST /api/playlists/:id/tracks  { trackId }
  static async addTrack(req, res) {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'ID de playlist no válido' });
      }

      const { trackId } = req.body;

      if (!trackId || typeof trackId !== 'string') {
        return res.status(400).json({
          error: 'Falta trackId. Las canciones solo se eligen de la base de datos.',
        });
      }

      let track = await Track.findById(trackId).lean();
      if (!track && req.body.track) {
        const t = req.body.track;
        const newTrack = await Track.create({
          _id: trackId,
          name: t.name || 'Canción',
          uri: t.uri || `spotify:track:${trackId}`,
          artists: Array.isArray(t.artists) ? t.artists : [],
          album: t.album || null,
          url: t.url || null,
          durationMs: t.durationMs || null,
        });
        track = newTrack.toObject();
      }

      if (!track) {
        return res.status(404).json({
          error: 'La canción no existe en la base de datos.',
        });
      }

      const isAdmin = req.user.role === 'admin';
      const filter = isAdmin
        ? { _id: req.params.id }
        : { _id: req.params.id, userId: req.user.userId };

      const playlist = await Playlist.findOne(filter);

      if (!playlist) return res.status(404).json({ error: 'Playlist no encontrada' });

      if (playlist.tracks.some((t) => t.id === trackId)) {
        return res.status(409).json({ error: 'La canción ya está en esta playlist' });
      }

      playlist.tracks.push({
        id: track._id,
        name: track.name,
        uri: track.uri,
        artists: track.artists || [],
        album: track.album || null,
        url: track.url || null,
        durationMs: track.durationMs || null,
      });

      await playlist.save();

      await PlaylistController.audit(req, {
        action: 'playlist.track.add',
        resource: 'Playlist',
        resourceId: playlist._id,
        details: { trackId, trackName: track.name, position: playlist.tracks.length },
      });

      res.json({ playlist });
    } catch (error) {
      console.error('[playlistController] addTrack:', error.message);
      res.status(500).json({ error: 'Error al agregar la canción' });
    }
  }

  // PUT /api/playlists/:id/tracks  { order: ['id1','id2',...] }
  static async reorderTracks(req, res) {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'ID de playlist no válido' });
      }

      const { order } = req.body;

      if (!Array.isArray(order) || order.length === 0) {
        return res.status(400).json({ error: 'order debe ser un array de trackIds' });
      }

      const isAdmin = req.user.role === 'admin';
      const filter = isAdmin
        ? { _id: req.params.id }
        : { _id: req.params.id, userId: req.user.userId };

      const playlist = await Playlist.findOne(filter);

      if (!playlist) return res.status(404).json({ error: 'Playlist no encontrada' });

      const before = playlist.tracks.map((t) => t.id);
      const byId = new Map(playlist.tracks.map((t) => [t.id, t]));
      const reordered = [];

      for (const id of order) {
        if (!byId.has(id)) {
          return res.status(400).json({ error: `La canción ${id} no está en la playlist` });
        }
        reordered.push(byId.get(id));
      }

      for (const [id, track] of byId) {
        if (!order.includes(id)) reordered.push(track);
      }

      playlist.tracks = reordered;
      await playlist.save();

      await PlaylistController.audit(req, {
        action: 'playlist.track.reorder',
        resource: 'Playlist',
        resourceId: playlist._id,
        details: { before, after: reordered.map((t) => t.id) },
      });

      res.json({ playlist });
    } catch (error) {
      console.error('[playlistController] reorderTracks:', error.message);
      res.status(500).json({ error: 'Error al reordenar las canciones' });
    }
  }

  // DELETE /api/playlists/:id/tracks/:trackId
  static async removeTrack(req, res) {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'ID de playlist no válido' });
      }

      const isAdmin = req.user.role === 'admin';
      const filter = isAdmin
        ? { _id: req.params.id }
        : { _id: req.params.id, userId: req.user.userId };

      const playlist = await Playlist.findOne(filter);

      if (!playlist) return res.status(404).json({ error: 'Playlist no encontrada' });

      const removed = playlist.tracks.find((t) => t.id === req.params.trackId);
      playlist.tracks = playlist.tracks.filter((t) => t.id !== req.params.trackId);
      await playlist.save();

      await PlaylistController.audit(req, {
        action: 'playlist.track.remove',
        resource: 'Playlist',
        resourceId: playlist._id,
        details: {
          trackId: req.params.trackId,
          trackName: removed?.name || null,
        },
      });

      res.json({ playlist });
    } catch (error) {
      console.error('[playlistController] removeTrack:', error.message);
      res.status(500).json({ error: 'Error al quitar la canción' });
    }
  }
}

module.exports = PlaylistController;
