/**
 * La Web API de Spotify devuelve hoy el objeto "artist" con muy pocos campos
 * (id, name, images, external_urls). Los campos genres, followers y popularity
 * ya no vienen en la respuesta, así que normalizamos la salida para que el
 * frontend no dependa de la forma exacta que devuelva Spotify.
 */

// Toma un objeto de artista crudo de Spotify y devuelve una versión simplificada.
// Se usa un parámetro por defecto (artist = {}) para evitar errores si se pasa un valor indefinido.
const mapArtist = (artist = {}) => ({
  id: artist.id ?? null, // Si artist.id es null o undefined, asigna null
  name: artist.name ?? null,
  // Usa "Optional Chaining" (?.) para navegar de forma segura. 
  // Si no hay images, o si el array está vacío, no lanza error, simplemente devuelve null.
  image: artist.images?.[0]?.url ?? null,
  url: artist.external_urls?.spotify ?? null,
});

// Toma un objeto de álbum crudo y extrae solo la información relevante.
const mapAlbum = (album = {}) => ({
  id: album.id ?? null,
  name: album.name ?? null,
  // Normaliza el nombre de la propiedad al estilo camelCase (releaseDate en lugar de release_date)
  releaseDate: album.release_date ?? null,
  image: album.images?.[0]?.url ?? null,
  url: album.external_urls?.spotify ?? null,
  totalTracks: album.total_tracks ?? null,
});

// Transforma la información de una canción. Esta función es un poco más compleja
// porque la canción incluye arrays de artistas y un objeto anidado de álbum.
const mapTrack = (track = {}) => ({
  id: track.id ?? null,
  name: track.name ?? null,
  // URI que necesita la Web API para reproducir la canción. Spotify siempre
  // la manda, pero la reconstruimos por si algún endpoint la omite.
  uri: track.uri ?? (track.id ? `spotify:track:${track.id}` : null),
  // Toma el array de artistas crudo, y devuelve un nuevo array solo con los nombres.
  // Si track.artists no existe, cae en el fallback [] para que el map no rompa.
  artists: (track.artists || []).map((artist) => artist.name),
  // Si la canción tiene información del álbum, mapea solo los datos necesarios (id, name, image).
  // Si no tiene álbum, devuelve null.
  album: track.album
    ? {
        id: track.album.id ?? null,
        name: track.album.name ?? null,
        image: track.album.images?.[0]?.url ?? null,
      }
    : null,
  url: track.external_urls?.spotify ?? null,
  durationMs: track.duration_ms ?? null, // Cambia snake_case a camelCase
});

// Exporta las funciones usando la sintaxis de CommonJS (típica de Node.js)
// para que puedan ser importadas en otros archivos (ej. en el cliente de la API).
module.exports = { mapArtist, mapAlbum, mapTrack };