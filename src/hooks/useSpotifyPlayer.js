import { useCallback, useEffect, useRef, useState } from 'react';
import { getPlaybackToken, playTrack } from '../api/spotify';
import { loadSpotifySdk } from '../utils/spotifySdk';

// Nombre con el que aparecerá este navegador como dispositivo en Spotify.
const PLAYER_NAME = 'Lify (navegador)';

// Volumen inicial del reproductor: 0 = silencio, 1 = máximo.
const DEFAULT_VOLUME = 1;

/**
 * Convierte cualquier error en un texto que se pueda mostrar en pantalla.
 * - Los errores del backend llegan como { response: { data: { error } } }.
 * - Los errores de red o del SDK llegan como Error con la propiedad .message.
 * - Si no hay ninguno de los dos, se usa el mensaje de respaldo (fallback).
 */
const readError = (error, fallback) =>
  error?.response?.data?.error || error?.message || fallback;

/**
 * Hook que crea y controla un reproductor de Spotify dentro del navegador
 * usando el Web Playback SDK.
 *
 * Recibe `enabled`: cuando es true (el usuario tiene sesión de Spotify) se
 * carga el SDK y se crea el reproductor; cuando pasa a false se destruye.
 *
 * Puntos clave:
 * - El SDK pide el access token al backend cada vez que conecta o cuando el
 *   token caduca (getOAuthToken), así que la renovación ocurre en el servidor
 *   y el refresh token nunca llega al navegador.
 * - El audio solo suena con cuentas Premium y sobre http en loopback o https.
 *
 * Devuelve el estado del reproductor y las acciones que usa la interfaz.
 */
export const useSpotifyPlayer = ({ enabled }) => {
  // ---------------------------------------------------------------------------
  // Referencias: datos internos que NO deben provocar un re-render.
  // ---------------------------------------------------------------------------

  // Instancia de Spotify.Player, es decir, el "mando" del reproductor.
  const playerRef = useRef(null);

  // Identificador que Spotify asigna a ESTE navegador al conectar. Es necesario
  // para enviar las órdenes de reproducción a este dispositivo concreto.
  const deviceIdRef = useRef(null);

  // ---------------------------------------------------------------------------
  // Estado: datos que la interfaz necesita ver y que repintan al cambiar.
  // ---------------------------------------------------------------------------

  // Ciclo de vida del reproductor:
  // 'idle'       -> no hay reproductor (sin sesión o ya desconectado)
  // 'connecting' -> cargando el SDK / conectando / reconectando
  // 'ready'      -> Spotify ya reconoció el dispositivo; se puede reproducir
  // 'error'      -> falló la inicialización, el token, la cuenta, etc.
  const [status, setStatus] = useState('idle');

  // Último mensaje de error para mostrar al usuario (null = sin error).
  const [error, setError] = useState(null);

  // Si Spotify está reproduciendo ahora mismo (false = pausado o parado).
  // La fuente de verdad es Spotify: se actualiza con 'player_state_changed'.
  const [isPlaying, setIsPlaying] = useState(false);

  // ---------------------------------------------------------------------------
  // Efecto principal: crear el reproductor cuando hay sesión.
  // Se ejecuta al montar y cada vez que cambia `enabled`.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Sin sesión de Spotify no se carga nada: el catálogo y las búsquedas
    // siguen funcionando porque usan Client Credentials en el backend.
    if (!enabled) return undefined;

    // Bandera de cancelación: evita escribir estado si el componente se
    // desmonta o la sesión se cierra mientras el SDK aún está cargando.
    let canceled = false;

    // Mientras conecta, la UI muestra "Preparando el reproductor…".
    setStatus('connecting');
    setError(null);

    const connect = async () => {
      try {
        // Carga diferida: el script del SDK solo se descarga si hay sesión.
        const Spotify = await loadSpotifySdk();
        if (canceled) return;

        // Creamos el reproductor. `getOAuthToken` es la función que el SDK
        // llama cuando necesita un token: al conectar y cada vez que el token
        // de una hora caduca. El backend lo renueva y aquí solo lo entregamos.
        const player = new Spotify.Player({
          name: PLAYER_NAME,
          volume: DEFAULT_VOLUME,
          getOAuthToken: async (callback) => {
            try {
              const res = await getPlaybackToken();
              callback(res.data.access_token);
            } catch (err) {
              // Sin token el reproductor no puede funcionar.
              setError(
                readError(err, 'No se pudo obtener el token de reproducción de Spotify.')
              );
              setStatus('error');
            }
          },
        });

        playerRef.current = player;

        // ---------------------------------------------------------------------
        // Listeners del SDK: cada uno avisa de un momento distinto.
        // ---------------------------------------------------------------------

        // El dispositivo ya está registrado en Spotify y tiene un id.
        player.addListener('ready', ({ device_id }) => {
          deviceIdRef.current = device_id;
          setStatus('ready');
        });

        // El dispositivo se desconectó (por ejemplo, la pestaña perdió la
        // conexión o Spotify lo expulsó). Se intenta reconectar.
        player.addListener('not_ready', () => {
          deviceIdRef.current = null;
          setStatus('connecting');
          setIsPlaying(false);
        });

        // Spotify informa del estado real de reproducción. La app no decide
        // por su cuenta: `state.paused === true` significa pausa, así que
        // guardamos lo contrario en `isPlaying`.
        player.addListener('player_state_changed', (state) => {
          if (!state) return;
          setIsPlaying(!state.paused);
        });

        // Errores que puede reportar el SDK. Cada uno tiene un mensaje
        // distinto porque la solución que necesita el usuario también lo es.
        player.addListener('initialization_error', ({ message }) => {
          setError(`No se pudo iniciar el reproductor: ${message}`);
          setStatus('error');
        });

        player.addListener('authentication_error', ({ message }) => {
          setError(
            `La sesión de Spotify ya no es válida (${message}). Vuelve a conectar tu cuenta.`
          );
          setStatus('error');
        });

        // El caso típico: la cuenta de Spotify no es Premium.
        player.addListener('account_error', () => {
          setError('La reproducción dentro de la app requiere Spotify Premium.');
          setStatus('error');
        });

        // Fallo al reproducir una canción concreta. El reproductor sigue vivo,
        // por eso aquí NO se cambia `status`.
        player.addListener('playback_error', ({ message }) => {
          setError(`Error de reproducción: ${message}`);
        });

        // Conecta el dispositivo con Spotify. Devuelve true o false.
        const connected = await player.connect();

        // Si mientras conectaba el usuario cerró sesión o se desmontó el
        // componente, desconectamos para no dejar un reproductor huérfano.
        if (canceled) {
          player.disconnect();
          return;
        }

        if (!connected) {
          setError('No se pudo conectar con el reproductor de Spotify.');
          setStatus('error');
        }
      } catch (err) {
        if (canceled) return;

        // Aquí caen, por ejemplo, los fallos al cargar el script del SDK.
        setError(readError(err, 'No se pudo cargar el reproductor de Spotify.'));
        setStatus('error');
      }
    };

    connect();

    // Limpieza: se ejecuta al desmontar o cuando `enabled` pasa a false
    // (por ejemplo, al pulsar "Desconectar").
    return () => {
      canceled = true;

      if (playerRef.current) {
        playerRef.current.disconnect();
        playerRef.current = null;
      }

      deviceIdRef.current = null;
      setIsPlaying(false);
      setStatus('idle');
    };
  }, [enabled]);

  /**
   * Reproduce una canción en este navegador.
   * Devuelve true si Spotify aceptó la orden y false si algo falló.
   */
  const play = useCallback(async (uri) => {
    const player = playerRef.current;
    const deviceId = deviceIdRef.current;

    // Si el SDK aún no está listo, no hay a quién enviar la orden.
    if (!player || !deviceId) {
      setError('El reproductor aún se está preparando. Espera un segundo e inténtalo de nuevo.');
      return false;
    }

    try {
      setError(null);

      // Debe ejecutarse dentro del gesto del usuario (el click) para que el
      // navegador permita el audio (política de autoplay).
      if (typeof player.activateElement === 'function') {
        await player.activateElement();
      }

      // El backend hace la llamada real a Spotify con el token del usuario.
      await playTrack({ uri, deviceId });

      // Actualización optimista: el listener 'player_state_changed' la
      // corregirá si Spotify informa de otro estado.
      setIsPlaying(true);
      return true;
    } catch (err) {
      setError(readError(err, 'No se pudo reproducir la canción.'));
      return false;
    }
  }, []);

  /**
   * Pausa o reanuda sin pasar por la Web API: lo hace el propio SDK en el
   * navegador, así que no gasta peticiones ni necesita un token nuevo.
   */
  const togglePlay = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;

    try {
      await player.togglePlay();
    } catch (err) {
      setError(readError(err, 'No se pudo cambiar el estado de reproducción.'));
    }
  }, []);

  /** Borra el mensaje de error (botón "Cerrar" de la interfaz). */
  const clearError = useCallback(() => setError(null), []);

  // Lo que consume App.js. `canPlay` es un valor derivado: no hace falta
  // guardarlo en estado porque se calcula a partir de `status`.
  return {
    status,
    isPlaying,
    error,
    canPlay: status === 'ready',
    play,
    togglePlay,
    clearError,
  };
};
