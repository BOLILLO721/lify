import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  addTrackToPlaylist,
  deleteTrack,
  getAlbumTracks,
  getArtistInfo,
  getAuditLogs,
  getAuthStatus,
  getCatalog,
  getLoginUrl,
  getMe,
  getPlaylists,
  logout,
  resetDatabase,
  searchArtists,
  searchTracks,
  updateTrackName,
} from '../api/spotify';
import { useSpotifyPlayer } from '../hooks/useSpotifyPlayer';


// Límite de resultados por petición.
const CATALOG_LIMIT = 10;
const SEARCH_LIMIT = 10;
const ARTIST_LIMIT = 10;
const ALBUM_TRACK_LIMIT = 20;

// Spotify devuelve fechas como "2025-01-05" o solo "2025".
const formatDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString('es', { year: 'numeric', month: 'short' });
};

// Milisegundos a "m:ss".
const formatDuration = (ms) => {
  if (!ms) return null;
  const minutes = Math.floor(ms / 60000);
  const seconds = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return `${minutes}:${seconds}`;
};

// Los errores del backend llegan como { error: "..." } y los de red como
// AxiosError, así que normalizamos ambos casos en un solo mensaje.
const readError = (error, fallback) =>
  error?.response?.data?.error || error?.message || fallback;

function Home() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [mode, setMode] = useState('tracks'); // 'tracks' | 'artists'
  const [query, setQuery] = useState('');

  // Lista principal: catálogo, resultados de búsqueda o tracks de un álbum.
  const [songs, setSongs] = useState([]);
  const [songsTitle, setSongsTitle] = useState('Catálogo');
  const [songsStatus, setSongsStatus] = useState('loading'); // loading | ready | error
  const [songsError, setSongsError] = useState(null);

  const [artists, setArtists] = useState([]);
  const [artistsStatus, setArtistsStatus] = useState('idle'); // idle | loading | ready | error
  const [artistsError, setArtistsError] = useState(null);

  // Artista elegido y sus álbumes.
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [albums, setAlbums] = useState([]);
  const [albumsStatus, setAlbumsStatus] = useState('idle'); // idle | loading | ready | error

  // Sesión de Spotify (se comprueba con el backend).
  const [auth, setAuth] = useState({ status: 'loading', user: null }); // loading | connected | disconnected
  const [authError, setAuthError] = useState(null);

  // Canción cargada en el reproductor.
  const [playingSong, setPlayingSong] = useState(null);

  // Edición de nombres de canciones (solo Admin).
  const [editingTrackId, setEditingTrackId] = useState(null);
  const [editingName, setEditingName] = useState('');

  // Playlists del usuario para añadir canciones desde el catálogo
  const [userPlaylists, setUserPlaylists] = useState([]);
  const [addingToPlaylistTrackId, setAddingToPlaylistTrackId] = useState(null);
  const [playlistNotice, setPlaylistNotice] = useState(null);

  // Administración de la base de datos (solo Admin).
  const [adminStatus, setAdminStatus] = useState('idle'); // idle | resetting | done | error
  const [adminMessage, setAdminMessage] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditStatus, setAuditStatus] = useState('idle'); // idle | loading | ready | error
  const [auditError, setAuditError] = useState(null);

  // Reproductor del navegador con el Web Playback SDK.
  const {
    status: playerStatus,
    isPlaying,
    error: playerError,
    canPlay,
    play,
    togglePlay,
    clearError,
  } = useSpotifyPlayer({ enabled: auth.status === 'connected' });

  // Solo la petición más reciente puede escribir en el estado: así una
  // respuesta lenta no pisa el resultado de una búsqueda posterior.
  const requestId = useRef(0);

  // Carga el usuario autenticado de Lify
  useEffect(() => {
    getMe()
      .then((res) => {
        if (res.data?.user) {
          setCurrentUser(res.data.user);
          getPlaylists()
            .then((pRes) => setUserPlaylists(pRes.data?.playlists ?? []))
            .catch(() => {});
        }
      })
      .catch(() => {
        localStorage.removeItem('token');
        navigate('/login');
      });
  }, [navigate]);

  const handleToggleAddToPlaylist = (songId) => {
    setAddingToPlaylistTrackId((prev) => (prev === songId ? null : songId));
  };

  const handleAddToPlaylist = async (playlistId, song) => {
    try {
      await addTrackToPlaylist(playlistId, song.id, song);
      setPlaylistNotice(`¡«${song.name}» añadida a la playlist!`);
      setTimeout(() => setPlaylistNotice(null), 3500);
      setAddingToPlaylistTrackId(null);
    } catch (err) {
      alert(readError(err, 'No se pudo añadir a la playlist.'));
    }
  };

  const handleLifyLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  // Comprueba si hay una sesión de Spotify activa y si volvimos con error de OAuth.
  useEffect(() => {
    let canceled = false;

    getAuthStatus()
      .then((res) => {
        if (canceled) return;

        setAuth({
          status: res.data?.connected ? 'connected' : 'disconnected',
          user: res.data?.user ?? null,
        });
      })
      .catch(() => {
        if (canceled) return;

        setAuth({ status: 'disconnected', user: null });
      });

    const params = new URLSearchParams(window.location.search);

    if (params.get('auth') === 'error') {
      setAuthError('No se pudo conectar con Spotify. Inténtalo de nuevo.');
      window.history.replaceState({}, '', window.location.pathname);
    }

    return () => {
      canceled = true;
    };
  }, []);

  // Carga inicial del catálogo.
  useEffect(() => {
    let canceled = false;

    const loadCatalog = async () => {
      try {
        const res = await getCatalog(CATALOG_LIMIT);

        if (canceled) return;

        setSongs(res.data?.tracks ?? []);
        setSongsTitle('Catálogo');
        setSongsStatus('ready');
      } catch (err) {
        if (canceled) return;

        setSongsError(readError(err, 'No se pudo cargar el catálogo.'));
        setSongsStatus('error');
      }
    };

    loadCatalog();

    return () => {
      canceled = true;
    };
  }, []);

  const handleSearch = async (event) => {
    event.preventDefault();

    const term = query.trim();
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;

    // Modo artistas.
    if (mode === 'artists') {
      if (!term) {
        setArtistsError('Escribe el nombre de un artista para buscar.');
        setArtistsStatus('error');
        return;
      }

      setArtistsStatus('loading');
      setArtistsError(null);

      try {
        const res = await searchArtists(term, ARTIST_LIMIT);
        if (currentRequest !== requestId.current) return;

        setArtists(res.data?.artists ?? []);
        setArtistsStatus('ready');
      } catch (err) {
        if (currentRequest !== requestId.current) return;

        setArtistsError(readError(err, 'No se pudo buscar el artista.'));
        setArtistsStatus('error');
      }

      return;
    }

    // Modo canciones.
    if (!term) {
      setSongsError('Escribe el nombre de una canción para buscar.');
      setSongsStatus('error');
      return;
    }

    setSongsStatus('loading');
    setSongsError(null);

    try {
      const res = await searchTracks(term, SEARCH_LIMIT);
      if (currentRequest !== requestId.current) return;

      setSongs(res.data?.tracks ?? []);
      setSongsTitle(`Resultados de «${term}»`);
      setSongsStatus('ready');
    } catch (err) {
      if (currentRequest !== requestId.current) return;

      setSongsError(readError(err, 'No se pudo buscar la canción.'));
      setSongsStatus('error');
    }
  };

  // Al elegir un artista se cargan sus álbumes.
  const handleSelectArtist = async (artist) => {
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;

    setSelectedArtist(artist);
    setAlbums([]);
    setAlbumsStatus('loading');

    try {
      const res = await getArtistInfo(artist.id);
      if (currentRequest !== requestId.current) return;

      setAlbums(res.data?.albums ?? []);
      setAlbumsStatus('ready');
    } catch (err) {
      if (currentRequest !== requestId.current) return;

      setAlbumsStatus('error');
    }
  };

  // Al elegir un álbum se reemplaza la lista principal por sus canciones.
  const handleSelectAlbum = async (album) => {
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;

    setSongsStatus('loading');
    setSongsError(null);

    try {
      const res = await getAlbumTracks(album.id, ALBUM_TRACK_LIMIT);
      if (currentRequest !== requestId.current) return;

      setSongs(res.data?.tracks ?? []);
      setSongsTitle(`Canciones de «${album.name}»`);
      setSongsStatus('ready');
    } catch (err) {
      if (currentRequest !== requestId.current) return;

      setSongsError(readError(err, 'No se pudieron cargar las canciones del álbum.'));
      setSongsStatus('error');
    }
  };

  // Reproduce la canción elegida en el reproductor del navegador.
  const handlePlaySong = async (song) => {
    const uri = song.uri || (song.id ? `spotify:track:${song.id}` : null);

    if (!uri) return;

    const ok = await play(uri);

    if (ok) {
      setPlayingSong(song);
    }
  };

  // Inicia la edición del nombre de una canción (Admin)
  const handleStartEdit = (song) => {
    setEditingTrackId(song.id);
    setEditingName(song.name);
  };

  const handleCancelEdit = () => {
    setEditingTrackId(null);
    setEditingName('');
  };

  const handleSaveEdit = async (song) => {
    if (!editingName.trim()) return;

    try {
      await updateTrackName(song.id, {
        name: editingName.trim(),
        uri: song.uri,
        artists: song.artists,
        album: song.album,
        durationMs: song.durationMs,
      });

      setSongs((prev) =>
        prev.map((item) =>
          item.id === song.id ? { ...item, name: editingName.trim() } : item
        )
      );

      if (playingSong?.id === song.id) {
        setPlayingSong((prev) => ({ ...prev, name: editingName.trim() }));
      }

      setEditingTrackId(null);
      setEditingName('');
    } catch (err) {
      setSongsError(readError(err, 'No se pudo actualizar el nombre de la canción.'));
    }
  };

  // Borra la canción de la base de datos (no de las playlists).
  const handleDeleteSong = async (song) => {
    if (!song.id) return;

    const confirmed = window.confirm(
      `¿Eliminar «${song.name}» de la base de datos?`
    );
    if (!confirmed) return;

    try {
      await deleteTrack(song.id);
      setSongs((prev) => prev.filter((item) => item.id !== song.id));
      if (playingSong?.id === song.id) setPlayingSong(null);
    } catch (err) {
      setSongsError(readError(err, 'No se pudo eliminar la canción.'));
      setSongsStatus('error');
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      // Ignoramos el fallo de red: limpiamos el estado local de todos modos.
    }

    setAuth({ status: 'disconnected', user: null });
    setPlayingSong(null);
  };

  // --- Administración de la base de datos (solo Admin) ---

  // Vuelve a cargar el catálogo tras vaciar las tablas.
  const reloadCatalog = async () => {
    setSongsStatus('loading');
    setSongsError(null);

    try {
      const res = await getCatalog(CATALOG_LIMIT);
      setSongs(res.data?.tracks ?? []);
      setSongsTitle('Catálogo');
      setSongsStatus('ready');
    } catch (err) {
      setSongsError(readError(err, 'No se pudo cargar el catálogo.'));
      setSongsStatus('error');
    }
  };

  const handleLoadAuditLogs = async () => {
    setAuditStatus('loading');
    setAuditError(null);

    try {
      const res = await getAuditLogs(50);
      setAuditLogs(res.data?.logs ?? []);
      setAuditStatus('ready');
    } catch (err) {
      setAuditError(readError(err, 'No se pudo cargar el historial de auditoría.'));
      setAuditStatus('error');
    }
  };

  // Botón de reset: elimina canciones, artistas y álbumes y los vuelve a crear.
  const handleResetDatabase = async () => {
    const confirmed = window.confirm(
      '¿Reiniciar la base de datos?\n\n' +
        'Se eliminarán y crearán de nuevo las tablas de canciones, artistas y álbumes. ' +
        'También se vaciarán las playlists y el historial de auditoría de la base de datos.\n\n' +
        'Esta acción no se puede deshacer.'
    );
    if (!confirmed) return;

    setAdminStatus('resetting');
    setAdminMessage(null);

    try {
      const res = await resetDatabase();

      setEditingTrackId(null);
      setEditingName('');
      setSelectedArtist(null);
      setAlbums([]);
      setArtists([]);
      setArtistsStatus('idle');
      setPlayingSong(null);

      await reloadCatalog();
      await handleLoadAuditLogs();

      setAdminMessage(res.data?.message || 'Base de datos reiniciada correctamente.');
      setAdminStatus('done');
    } catch (err) {
      setAdminMessage(readError(err, 'No se pudo reiniciar la base de datos.'));
      setAdminStatus('error');
    }
  };

  // Carga el historial la primera vez que un Admin entra a la página.
  useEffect(() => {
    if (currentUser?.role === 'admin') handleLoadAuditLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const hasPlayer = auth.status === 'connected' && Boolean(playingSong);

  return (
    <div className={hasPlayer ? 'App App--with-player' : 'App'}>
      <header className="App-header">
        {/* Barra superior de usuario Lify */}
        <div className="App-user-bar">
          <span className="App-user-name">
            👤 <strong>{currentUser ? currentUser.username : '...'}</strong>
            {currentUser && (
              <span
                className={`App-role-badge ${
                  currentUser.role === 'admin' ? 'App-role-badge--admin' : ''
                }`}
              >
                {currentUser.role === 'admin' ? 'Administrador' : 'Usuario'}
              </span>
            )}
          </span>
          <div className="App-user-nav">
            <Link to="/playlists" className="App-nav-link">
              🎵 Mis Playlists
            </Link>
            <button
              type="button"
              className="App-logout-button"
              onClick={handleLifyLogout}
            >
              Cerrar sesión
            </button>
          </div>
        </div>

        <h1>Lify🍋</h1>
        <p className="App-subtitle">Tu soundtrack, conectada a Spotify.</p>

        {/* Estado de la sesión de Spotify. */}
        <div className="App-auth">
          {auth.status === 'loading' && (
            <span className="App-status">Comprobando sesión…</span>
          )}

          {auth.status === 'disconnected' && (
            <a className="App-connect" href={getLoginUrl()}>
              Conectar con Spotify
            </a>
          )}

          {auth.status === 'connected' && (
            <>
              <span className="App-auth-user">
                {auth.user?.image && <img src={auth.user.image} alt="" />}
                Conectado{auth.user?.name ? ` como ${auth.user.name}` : ''}
              </span>
              <button
                type="button"
                className="App-auth-button"
                onClick={handleLogout}
              >
                Desconectar
              </button>
            </>
          )}
        </div>

        {authError && (
          <p className="App-error" role="alert">
            {authError}
          </p>
        )}

        {/* Panel de administración de la base de datos (solo Admin) */}
        {currentUser?.role === 'admin' && (
          <section className="AdminPanel" aria-label="Administración de la base de datos">
            <div className="AdminPanel-header">
              <h2 className="AdminPanel-title">🛠️ Administración de la base de datos</h2>
              <div className="AdminPanel-actions">
                <button
                  type="button"
                  className="AdminPanel-refresh"
                  onClick={handleLoadAuditLogs}
                  disabled={auditStatus === 'loading'}
                >
                  Ver historial
                </button>
                <button
                  type="button"
                  className="AdminPanel-reset"
                  onClick={handleResetDatabase}
                  disabled={adminStatus === 'resetting'}
                >
                  {adminStatus === 'resetting' ? 'Reiniciando…' : 'Reiniciar base de datos'}
                </button>
              </div>
            </div>

            <p className="AdminPanel-hint">
              Elimina y vuelve a crear las tablas de canciones, artistas y álbumes. También
              vacía las playlists y el historial de auditoría de la base de datos.
            </p>

            {adminMessage && (
              <p
                className={adminStatus === 'error' ? 'App-error' : 'AdminPanel-notice'}
                role={adminStatus === 'error' ? 'alert' : 'status'}
              >
                {adminMessage}
              </p>
            )}

            {auditError && (
              <p className="App-error" role="alert">
                {auditError}
              </p>
            )}

            {auditStatus === 'ready' && auditLogs.length === 0 && (
              <p className="App-empty">Todavía no hay movimientos registrados.</p>
            )}

            {auditLogs.length > 0 && (
              <div className="AdminPanel-logs">
                <h3 className="AdminPanel-subtitle">Últimos movimientos</h3>
                <ul className="AuditList">
                  {auditLogs.map((log) => (
                    <li
                      key={log.id}
                      className={
                        log.success === false ? 'AuditItem AuditItem--error' : 'AuditItem'
                      }
                    >
                      <span className="AuditItem-action">{log.action}</span>
                      <span className="AuditItem-who">{log.username || 'anónimo'}</span>
                      {log.resource && (
                        <span className="AuditItem-resource">
                          {log.resource}
                          {log.details?.track?.name
                            ? ` · «${log.details.track.name}»`
                            : log.resourceId
                            ? ` · ${log.resourceId}`
                            : ''}
                        </span>
                      )}
                      <time className="AuditItem-date" dateTime={log.createdAt}>
                        {log.createdAt
                          ? new Date(log.createdAt).toLocaleString('es')
                          : ''}
                      </time>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {playerError && (
          <div className="App-player-error" role="alert">
            <span>{playerError}</span>
            <button type="button" className="App-auth-button" onClick={clearError}>
              Cerrar
            </button>
          </div>
        )}

        <form className="App-search" onSubmit={handleSearch} role="search">
          <div className="App-modes" role="group" aria-label="Tipo de búsqueda">
            <button
              type="button"
              className={mode === 'tracks' ? 'App-mode App-mode--active' : 'App-mode'}
              onClick={() => setMode('tracks')}
            >
              Canciones
            </button>
            <button
              type="button"
              className={mode === 'artists' ? 'App-mode App-mode--active' : 'App-mode'}
              onClick={() => setMode('artists')}
            >
              Artistas
            </button>
          </div>

          <div className="App-search-row">
            <input
              className="App-search-input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                mode === 'tracks'
                  ? 'Busca cualquier canción…'
                  : 'Busca cualquier artista…'
              }
              aria-label={mode === 'tracks' ? 'Buscar canción' : 'Buscar artista'}
            />
            <button className="App-search-button" type="submit">
              Buscar
            </button>
          </div>
        </form>

        {/* Canciones: catálogo, resultados de búsqueda o tracks de un álbum. */}
        <section className="App-songs">
          <h2>{songsTitle}</h2>

          {songsStatus === 'loading' && <p className="App-status">Cargando…</p>}

          {songsStatus === 'error' && (
            <p className="App-error" role="alert">
              {songsError}
            </p>
          )}

          {songsStatus === 'ready' && songs.length === 0 && (
            <p className="App-empty">No encontramos canciones.</p>
          )}

          {playlistNotice && (
            <div
              style={{
                background: 'rgba(29, 185, 84, 0.2)',
                border: '1px solid #1db954',
                color: '#1ed760',
                padding: '10px 16px',
                borderRadius: '8px',
                margin: '12px 0',
                textAlign: 'center',
                fontWeight: 600,
              }}
            >
              {playlistNotice}
            </div>
          )}

          <ul className="App-songlist">
            {songs.map((song) => {
              const isCurrent = playingSong?.id && song.id === playingSong.id;

              return (
                <li
                  className={isCurrent ? 'App-song App-song--playing' : 'App-song'}
                  key={song.id ?? song.name}
                >
                  {song.album?.image && (
                    <img
                      className="App-song-cover"
                      src={song.album.image}
                      alt={`Portada de ${song.name}`}
                    />
                  )}
                  <div className="App-song-info">
                    {editingTrackId === song.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleSaveEdit(song);
                        }}
                        style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}
                      >
                        <input
                          type="text"
                          className="App-search-input"
                          style={{ padding: '4px 8px', fontSize: '0.9rem', maxWidth: '240px' }}
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          autoFocus
                          required
                        />
                        <button
                          type="submit"
                          className="App-auth-button"
                          style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          className="App-logout-button"
                          style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                          onClick={handleCancelEdit}
                        >
                          Cancelar
                        </button>
                      </form>
                    ) : (
                      <strong>{song.name}</strong>
                    )}
                    <span>{song.artists?.join(', ')}</span>
                    {song.album?.name && (
                      <span className="App-song-album">{song.album.name}</span>
                    )}
                    {song.durationMs ? <span>{formatDuration(song.durationMs)}</span> : null}
                  </div>

                  <div className="App-song-actions">
                    <button
                      type="button"
                      className={
                        isCurrent ? 'App-play App-play--active' : 'App-play'
                      }
                      onClick={() => handlePlaySong(song)}
                      disabled={auth.status !== 'connected' || !canPlay}
                      title={
                        auth.status !== 'connected'
                          ? 'Conecta tu cuenta de Spotify para reproducir en la app'
                          : playerStatus === 'connecting'
                          ? 'Preparando el reproductor…'
                          : `Reproducir ${song.name}`
                      }
                      aria-label={`Reproducir ${song.name}`}
                    >
                      ▶
                    </button>

                    <button
                      type="button"
                      className="App-auth-button"
                      onClick={() => handleToggleAddToPlaylist(song.id)}
                      title="Añadir canción a una de mis playlists"
                    >
                      + Playlist
                    </button>

                    {/* Acciones exclusivas del Administrador */}
                    {currentUser?.role === 'admin' && (
                      <>
                        {editingTrackId !== song.id && (
                          <button
                            type="button"
                            className="App-auth-button"
                            onClick={() => handleStartEdit(song)}
                            title="Editar nombre de la canción en la base de datos"
                            aria-label={`Editar nombre de ${song.name}`}
                          >
                            ✏️ Editar
                          </button>
                        )}
                        <button
                          type="button"
                          className="App-logout-button"
                          onClick={() => handleDeleteSong(song)}
                          title="Eliminar de la base de datos"
                          aria-label={`Eliminar ${song.name} de la base de datos`}
                        >
                          Eliminar
                        </button>
                      </>
                    )}
                  </div>

                  {/* Selector desplegable para añadir a playlist */}
                  {addingToPlaylistTrackId === song.id && (
                    <div
                      style={{
                        width: '100%',
                        marginTop: '10px',
                        padding: '10px 14px',
                        background: 'rgba(29, 185, 84, 0.08)',
                        borderRadius: '8px',
                        border: '1px solid rgba(29, 185, 84, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ fontSize: '0.85rem', color: '#1db954', fontWeight: 600 }}>
                        Añadir a playlist:
                      </span>
                      {userPlaylists.length === 0 ? (
                        <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                          No tienes playlists creadas.{' '}
                          <Link to="/playlists" style={{ color: '#1db954', textDecoration: 'underline' }}>
                            Crea una aquí
                          </Link>
                          .
                        </span>
                      ) : (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {userPlaylists.map((pl) => (
                            <button
                              key={pl._id}
                              type="button"
                              className="App-nav-link"
                              style={{ padding: '3px 10px', fontSize: '0.8rem', cursor: 'pointer', border: 'none' }}
                              onClick={() => handleAddToPlaylist(pl._id, song)}
                            >
                              + {pl.name}
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        className="App-logout-button"
                        style={{ padding: '2px 8px', fontSize: '0.75rem', marginLeft: 'auto' }}
                        onClick={() => setAddingToPlaylistTrackId(null)}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Grilla de artistas, solo en modo "artistas". */}
        {mode === 'artists' && (
          <section className="App-artists">
            <h2>Artistas</h2>

            {artistsStatus === 'loading' && (
              <p className="App-status">Buscando artistas…</p>
            )}

            {artistsStatus === 'error' && (
              <p className="App-error" role="alert">
                {artistsError}
              </p>
            )}

            {artistsStatus === 'ready' && artists.length === 0 && (
              <p className="App-empty">No encontramos artistas.</p>
            )}

            <div className="App-artists-grid">
              {artists.map((artist) => (
                <button
                  type="button"
                  key={artist.id ?? artist.name}
                  className={
                    selectedArtist?.id === artist.id
                      ? 'App-artist App-artist--selected'
                      : 'App-artist'
                  }
                  onClick={() => handleSelectArtist(artist)}
                  aria-label={`Ver los álbumes de ${artist.name}`}
                >
                  {artist.image && (
                    // alt vacío: el nombre del artista ya está en el botón.
                    <img src={artist.image} alt="" />
                  )}
                  <strong>{artist.name}</strong>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Álbumes del artista seleccionado. */}
        {selectedArtist && (
          <section className="App-albums">
            <h2>Álbumes de {selectedArtist.name}</h2>

            {albumsStatus === 'loading' && <p className="App-status">Cargando álbumes…</p>}

            {albumsStatus === 'error' && (
              <p className="App-error" role="alert">
                No se pudieron cargar los álbumes de {selectedArtist.name}.
              </p>
            )}

            <div className="App-albums-grid">
              {albums.map((album) => (
                <button
                  type="button"
                  className="App-album"
                  key={album.id ?? album.name}
                  onClick={() => handleSelectAlbum(album)}
                  aria-label={`Ver las canciones de ${album.name}`}
                >
                  {album.image && (
                    // alt vacío: el nombre del álbum ya está en el botón.
                    <img src={album.image} alt="" />
                  )}
                  <strong>{album.name}</strong>
                  {album.releaseDate && <span>{formatDate(album.releaseDate)}</span>}
                </button>
              ))}
            </div>
          </section>
        )}
      </header>

      {/* Reproductor en la barra inferior. */}
      {hasPlayer && (
        <div className="PlayerBar" role="region" aria-label="Reproductor">
          {playingSong.album?.image && (
            <img src={playingSong.album.image} alt="" />
          )}
          <div className="PlayerBar-info">
            <strong>{playingSong.name}</strong>
            <span>{playingSong.artists?.join(', ')}</span>
          </div>
          <button
            type="button"
            className="PlayerBar-toggle"
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
          >
            {isPlaying ? '❚❚' : '▶'}
          </button>
        </div>
      )}
    </div>
  );
}

export default Home;
