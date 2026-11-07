/**
 * Registra movimientos (crear, actualizar, reordenar, eliminar...) en la
 * colección `auditlogs` a través del modelo AuditLog.
 *
 * Regla: la auditoría NUNCA debe tumbar la petición. Ningún método lanza;
 * si MongoDB no está disponible se avisa por consola y se sigue adelante.
 */
class AuditService {
  constructor({ models, isReady = () => true, logger = console }) {
    this.AuditLog = models.AuditLog;
    this.isReady = isReady;
    this.logger = logger;
  }

  /**
   * Guarda un movimiento.
   *
   * @param {object} req      Petición de Express (de donde sale quién lo hizo).
   * @param {object} entry
   * @param {string} entry.action       Uno de los valores del enum del modelo.
   * @param {string} [entry.resource]   'Track', 'Artist', 'Album', 'Playlist'...
   * @param {string} [entry.resourceId] Id del documento afectado.
   * @param {*}      [entry.details]    Datos antes/después, campos cambiados...
   * @param {boolean}[entry.success]    true por defecto.
   * @param {string} [entry.errorMessage]
   * @returns {Promise<boolean>} true si se guardó el registro.
   */
  async log(req, entry = {}) {
    const { action, resource = null, resourceId = null, details = null } = entry;
    const success = entry.success !== false;
    const errorMessage = entry.errorMessage || null;

    if (!this.AuditLog) {
      this.logger.warn(`[audit] ${action}: modelo AuditLog no disponible`);
      return false;
    }

    if (!this.isReady()) {
      this.logger.warn(`[audit] ${action}: sin conexión a MongoDB, no se registró`);
      return false;
    }

    try {
      await this.AuditLog.create({
        ...this.#actor(req),
        action,
        resource,
        resourceId: resourceId == null ? null : String(resourceId),
        details,
        success,
        errorMessage,
        ip: this.#ip(req),
        userAgent: req?.headers?.['user-agent'] || null,
      });
      return true;
    } catch (error) {
      this.logger.error(`[audit] No se pudo registrar ${action}:`, error.message);
      return false;
    }
  }

  /** Quién hizo la acción: sale del token (req.user) que pone requireAuth. */
  #actor(req) {
    const user = req?.user;

    if (!user || !user.userId) {
      return { userId: null, username: null, role: 'anonymous' };
    }

    return {
      userId: user.userId,
      username: user.username || null,
      role: user.role === 'admin' ? 'admin' : 'user',
    };
  }

  #ip(req) {
    const forwarded = req?.headers?.['x-forwarded-for'];

    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0].trim();
    }

    return req?.ip || req?.socket?.remoteAddress || null;
  }

  /** Últimos movimientos, del más reciente al más antiguo. */
  async list({ limit = 50, action, resource, resourceId, username } = {}) {
    if (!this.AuditLog || !this.isReady()) return [];

    const filter = {};

    if (action) filter.action = action;
    if (resource) filter.resource = resource;
    if (resourceId) filter.resourceId = String(resourceId);
    if (username) filter.username = String(username).toLowerCase();

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);

    try {
      const docs = await this.AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .limit(safeLimit)
        .lean();

      return docs.map((doc) => ({
        id: doc._id,
        userId: doc.userId,
        username: doc.username,
        role: doc.role,
        action: doc.action,
        resource: doc.resource,
        resourceId: doc.resourceId,
        details: doc.details,
        success: doc.success,
        errorMessage: doc.errorMessage,
        ip: doc.ip,
        createdAt: doc.createdAt,
      }));
    } catch (error) {
      this.logger.error('[audit] No se pudo leer el historial:', error.message);
      return [];
    }
  }
}

module.exports = AuditService;
