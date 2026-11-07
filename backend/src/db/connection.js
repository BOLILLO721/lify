const mongoose = require('mongoose');
const models = require('../models');

const RETRY_MS = 5000;

let retryTimer = null;
let listenersAttached = false;
let shuttingDown = false;

/** true cuando hay una conexión viva con MongoDB. */
const isDatabaseReady = () => mongoose.connection.readyState === 1;

/**
 * Crea (si no existen) las colecciones y los índices de todos los modelos.
 * Es idempotente: se puede llamar tantas veces como se quiera. Se ejecuta en
 * cada (re)conexión, así que si se borra todo el contenido de la base y se
 * vuelve a conectar, el esquema se reconstruye solo.
 */
const ensureSchema = async () => {
  for (const Model of Object.values(models)) {
    try {
      await Model.createCollection();
    } catch (error) {
      // 48 = NamespaceExists: la colección ya estaba creada.
      if (error.code !== 48) throw error;
    }
    await Model.syncIndexes();
  }
};

const attachListeners = (logger) => {
  if (listenersAttached) return;
  listenersAttached = true;

  const { connection } = mongoose;

  // `connected` se dispara también tras una reconexión automática del driver.
  connection.on('connected', () => {
    logger.log('[db] Conectado a MongoDB');
    ensureSchema().catch((error) =>
      logger.error('[db] No se pudo preparar el esquema:', error.message)
    );
  });
  connection.on('disconnected', () => {
    if (!shuttingDown) logger.warn('[db] Conexión perdida; el driver reintentará solo');
  });
  connection.on('reconnected', () => logger.log('[db] Reconectado a MongoDB'));
  connection.on('error', (error) => logger.error('[db] Error de MongoDB:', error.message));
};

/**
 * Conecta con MongoDB sin bloquear el arranque de la API.
 *
 * - Si el primer intento falla (MongoDB apagado, red caída), reintenta cada
 *   RETRY_MS hasta lograrlo.
 * - Una vez conectado, el driver mantiene el pool y reconecta por su cuenta
 *   si la conexión se corta, así que la conexión no se pierde.
 * - Borrar la base de datos no cierra la conexión: las colecciones se
 *   recrean en la siguiente escritura y los índices en `ensureSchema()`.
 */
const connectDatabase = async ({ uri, dbName, logger = console } = {}) => {
  if (!uri) {
    logger.warn('[db] Sin MONGODB_URI: la API funciona sin base de datos.');
    return false;
  }

  attachListeners(logger);

  try {
    // Si dbName viene definido, se usa; si no, Mongoose respeta el nombre
    // de la base que va al final de la URI (por ejemplo, "/lify").
    const options = {
      serverSelectionTimeoutMS: 5000,
      heartbeatFrequencyMS: 10000,
      maxPoolSize: 10,
      bufferCommands: false,
    };

    if (dbName) options.dbName = dbName;

    await mongoose.connect(uri, options);

    // Muestra la base a la que se conectó realmente, para confirmar
    // que es la correcta y no la base por defecto.
    logger.log(`[db] Conectado a la base: ${mongoose.connection.name}`);

    return true;
  } catch (error) {
    if (shuttingDown) return false;
    logger.error(`[db] No se pudo conectar (${error.message}). Reintento en ${RETRY_MS / 1000}s`);
    retryTimer = setTimeout(() => connectDatabase({ uri, dbName, logger }), RETRY_MS);
    retryTimer.unref();
    return false;
  }
};

const disconnectDatabase = async () => {
  shuttingDown = true;
  clearTimeout(retryTimer);
  await mongoose.disconnect();
};

module.exports = { connectDatabase, disconnectDatabase, ensureSchema, isDatabaseReady };
