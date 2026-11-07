/**
 * Utilidades mínimas para leer y escribir cookies sin añadir dependencias.
 * Solo se usan cookies httpOnly de sesión y del `state` de OAuth.
 */

/** Convierte la cabecera "Cookie" en un objeto { nombre: valor }. */
const parseCookies = (header = '') =>
  String(header)
    .split(';')
    .reduce((cookies, part) => {
      const separator = part.indexOf('=');
      if (separator === -1) return cookies;

      const name = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();

      if (name) cookies[name] = decodeURIComponent(value);
      return cookies;
    }, {});

/** Lee una cookie concreta de la petición. Devuelve null si no existe. */
const readCookie = (req, name) => {
  const cookies = parseCookies(req?.headers?.cookie);
  return Object.prototype.hasOwnProperty.call(cookies, name) ? cookies[name] : null;
};

/**
 * Construye una cabecera Set-Cookie.
 * `maxAge` va en segundos; 0 la borra inmediatamente.
 */
const serializeCookie = (name, value, options = {}) => {
  const { maxAge, httpOnly = true, sameSite = 'Lax', path = '/', secure = false } = options;
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];

  if (typeof maxAge === 'number') parts.push(`Max-Age=${maxAge}`);
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');

  return parts.join('; ');
};

module.exports = { parseCookies, readCookie, serializeCookie };
