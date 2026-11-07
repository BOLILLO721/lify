const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'clave-super-secreta-de-aprendiz';

/**
 * Middleware para proteger rutas que requieren inicio de sesión.
 * Lee el token del encabezado: Authorization: Bearer <token>
 */
const requireAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Acceso no autorizado. Inicia sesión.' });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { userId, username, role }
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
};

/**
 * Middleware para proteger rutas exclusivas de Administrador.
 */
const requireAdmin = (req, res, next) => {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        error: 'Acceso denegado: se requieren permisos de administrador',
      });
    }
    next();
  });
};

module.exports = { requireAuth, requireAdmin, JWT_SECRET };
