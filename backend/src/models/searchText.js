/**
 * Texto en minúsculas y sin tildes para buscar en la base de datos
 * ("Rosalía" == "rosalia"). Se guarda en un campo aparte (`searchText`).
 */
const normalizeText = (...parts) =>
  parts
    .flat()
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

module.exports = { normalizeText };
