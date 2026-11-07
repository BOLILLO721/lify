const mongoose = require('mongoose');
const { ensureSchema } = require('../db/connection');

// Colecciones que se borran y se vuelven a crear con el botón de reset.
// Se incluyen las playlists porque apuntan a canciones que dejan de existir.
const RESET_COLLECTIONS = ['tracks', 'artists', 'albums', 'playlists', 'auditlogs'];

/**
 * Funciones de administración de la base de datos.
 *
 * Todas las rutas que usan este controlador pasan antes por `requireAdmin`.
 */
class AdminController {
  constructor({ audit, isReady }) {
    this.audit = audit;
    this.isReady = isReady;
  }

  /**
   * POST /api/admin/reset-database
   * Borra las colecciones de canciones, artistas y álbumes y las crea de nuevo
   * (vacías y con sus índices). La tabla de auditoría también se vacía para que
   * el "reset" quede como primer movimiento del historial nuevo.
   *
   * El borrado se hace colección por colección y no con dropDatabase(): así no
   * se tocan los usuarios ni cualquier otra colección de la misma base.
   */
  resetDatabase = async (req, res) => {
    if (!this.isReady()) {
      res.status(503).json({
        error: 'La base de datos no está disponible. Inténtalo en unos segundos.',
      });
      return;
    }

    const removed = {};

    try {
      for (const name of RESET_COLLECTIONS) {
        // drop() lanza 26 (NamespaceNotFound) si la colección aún no existía
        // (por ejemplo, ya se había reseteado y nadie volvió a guardar nada).
        try {
          await mongoose.connection.dropCollection(name);
          removed[name] = true;
        } catch (error) {
          if (error.code === 26) {
            removed[name] = false;
            continue;
          }
          throw error;
        }
      }

      // Vuelve a crear todas las colecciones (también las de usuarios y
      // playlists) y reconstruye sus índices sobre las vacías.
      await ensureSchema();

      await this.audit.log(req, {
        action: 'database.reset',
        resource: 'Database',
        details: { collections: RESET_COLLECTIONS, removed },
      });

      res.json({
        message: 'Base de datos reiniciada: colecciones eliminadas y creadas de nuevo',
        collections: RESET_COLLECTIONS.map((name) => ({ name, recreated: true })),
      });
    } catch (error) {
      console.error('[adminController] resetDatabase:', error.message);

      await this.audit.log(req, {
        action: 'database.reset',
        resource: 'Database',
        success: false,
        errorMessage: error.message,
      });

      res.status(500).json({ error: 'No se pudo reiniciar la base de datos' });
    }
  };

  /**
   * GET /api/admin/audit-logs?limit=50&action=&resource=&resourceId=&username=
   * Historial de movimientos, del más reciente al más antiguo.
   */
  getAuditLogs = async (req, res) => {
    if (!this.isReady()) {
      res.status(503).json({
        error: 'La base de datos no está disponible. Inténtalo en unos segundos.',
      });
      return;
    }

    try {
      const { limit, action, resource, resourceId, username } = req.query || {};
      const logs = await this.audit.list({ limit, action, resource, resourceId, username });
      res.json({ logs });
    } catch (error) {
      console.error('[adminController] getAuditLogs:', error.message);
      res.status(500).json({ error: 'No se pudo leer el historial de auditoría' });
    }
  };
}

module.exports = AdminController;
