const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET } = require('../middleware/auth');

const JWT_EXPIRES_IN = '7d'; // el token dura 7 días

/**
 * REGISTRO: POST /api/basic-auth/register
 * Body: { username, password, role }
 */
const register = async (req, res) => {
  try {
    const { username, password, role: requestedRole } = req.body;

    // 1. Comprobar que llegan los dos campos
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
    }

    // 2. ¿Ya existe ese nombre?
    const exists = await User.findOne({ username: username.toLowerCase().trim() });
    if (exists) {
      return res.status(409).json({ error: 'Ese nombre de usuario ya está cogido' });
    }

    // 3. Determinar rol:
    // - Si solicita 'admin', se le asigna 'admin'.
    // - Si es el primer usuario de la base, se convierte en 'admin'.
    // - De lo contrario, 'user' (usuario normal).
    const isFirstUser = (await User.estimatedDocumentCount()) === 0;
    const role = requestedRole === 'admin' ? 'admin' : isFirstUser ? 'admin' : 'user';

    const user = await User.create({ username, password, role });

    // 4. Devolver el usuario SIN la contraseña
    res.status(201).json({
      user: { id: user._id, username: user.username, role: user.role },
    });
  } catch (error) {
    console.error('[basicAuth] register:', error.message);
    res.status(500).json({ error: 'Error al registrar el usuario' });
  }
};

/**
 * LOGIN: POST /api/basic-auth/login
 * Body: { username, password }
 */
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // 1. Comprobar campos
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
    }

    // 2. Buscar al usuario por nombre
    const user = await User.findOne({ username: username.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    // 3. Comprobar la contraseña
    const ok = await user.comparePassword(password);
    if (!ok) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const userRole = user.role || 'user';

    // 4. Crear el token incluyendo el rol
    const token = jwt.sign(
      { userId: user._id, username: user.username, role: userRole },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // 5. Devolver el token y el usuario con su rol
    res.json({
      token,
      user: { id: user._id, username: user.username, role: userRole },
    });
  } catch (error) {
    console.error('[basicAuth] login:', error.message);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
};

/**
 * PERFIL: GET /api/basic-auth/me
 * Necesita enviar el token en la cabecera: Authorization: Bearer <token>
 */
const me = async (req, res) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'No hay token. Inicia sesión.' });
    }

    // verify lanza error si el token está mal o caducó
    const payload = jwt.verify(token, JWT_SECRET);

    // Buscamos el rol más actualizado en la BD
    const dbUser = await User.findById(payload.userId).lean().catch(() => null);
    const role = dbUser ? dbUser.role : payload.role || 'user';

    res.json({
      user: { id: payload.userId, username: payload.username, role },
    });
  } catch (error) {
    res.status(401).json({ error: 'Token inválido o caducado' });
  }
};

module.exports = { register, login, me };
