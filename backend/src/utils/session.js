const { readCookie, serializeCookie } = require('./cookies');

// Nombres de las cookies que usa el flujo OAuth.
const SESSION_COOKIE = 'lify_sid';
const STATE_COOKIE = 'lify_oauth_state';

// La sesión dura 30 días, pero el refresh token puede revocarse antes.
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Id. de sesión de la petición (null si el usuario no ha conectado Spotify). */
const readSessionId = (req) => readCookie(req, SESSION_COOKIE);

/** Cookie httpOnly que asocia el navegador con su sesión en memoria. */
const sessionCookie = (sessionId) =>
  serializeCookie(SESSION_COOKIE, sessionId, { maxAge: SESSION_MAX_AGE_SECONDS });

/** Cookie que elimina la sesión del navegador. */
const clearSessionCookie = () => serializeCookie(SESSION_COOKIE, '', { maxAge: 0 });

/** Cookie temporal con el `state` de OAuth (10 minutos). */
const stateCookie = (state) => serializeCookie(STATE_COOKIE, state, { maxAge: 600 });

/** Cookie que elimina el `state` una vez usado. */
const clearStateCookie = () => serializeCookie(STATE_COOKIE, '', { maxAge: 0 });

module.exports = {
  SESSION_COOKIE,
  STATE_COOKIE,
  readSessionId,
  sessionCookie,
  clearSessionCookie,
  stateCookie,
  clearStateCookie,
};
