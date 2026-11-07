const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';

let sdkPromise = null;

/**
 * Carga el Web Playback SDK una sola vez y devuelve window.Spotify.
 *
 * Se carga de forma diferida (no en index.html) para que la app siga
 * funcionando sin sesión de Spotify y sin descargar el SDK si no se usa.
 */
export const loadSpotifySdk = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('El reproductor solo funciona en el navegador.'));
  }

  if (window.Spotify) return Promise.resolve(window.Spotify);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    // El SDK llama a este global cuando termina de cargar.
    window.onSpotifyWebPlaybackSDKReady = () => resolve(window.Spotify);

    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;

    script.onerror = () => {
      // Permitimos reintentar si falla la red.
      sdkPromise = null;
      reject(new Error('No se pudo cargar el reproductor de Spotify.'));
    };

    document.body.appendChild(script);
  });

  return sdkPromise;
};
