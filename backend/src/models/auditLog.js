const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    // Quién hizo la acción
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    username: { type: String, default: null, index: true },
    role: { type: String, enum: ['user', 'admin', 'anonymous'], default: 'anonymous' },

    // Qué hizo
    action: {
      type: String,
      required: true,
      enum: [
        'auth.register',
        'auth.login',
        'auth.logout',
        'playlist.create',
        'playlist.update',
        'playlist.delete',
        'playlist.track.add',
        'playlist.track.remove',
        'playlist.track.reorder',
        'track.update',
        'track.delete',
        'database.reset',
      ],
      index: true,
    },

    // Sobre qué lo hizo
    resource: { type: String, default: null, index: true }, // 'Playlist', 'Track', 'User'...
    resourceId: { type: String, default: null, index: true },

    // Detalles libres: payload antes/después, campos cambiados, etc.
    details: { type: mongoose.Schema.Types.Mixed, default: null },

    // Resultado
    success: { type: Boolean, default: true, index: true },
    errorMessage: { type: String, default: null },

    // Contexto de la petición
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },

    // Cuándo (además de timestamps, para TTL / consultas rápidas)
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

// Índice compuesto para "historial de un usuario ordenado por fecha"
auditLogSchema.index({ userId: 1, createdAt: -1 });
// Índice para "últimos movimientos sobre un recurso"
auditLogSchema.index({ resource: 1, resourceId: 1, createdAt: -1 });

// TTL opcional: borra automáticamente registros de más de 90 días.
// Comenta esta línea si quieres conservarlos para siempre.
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);