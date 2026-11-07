import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  addTrackToPlaylist,
  createPlaylist,
  deletePlaylist,
  getMe,
  getPlaylist,
  getPlaylists,
  removeTrackFromPlaylist,
  reorderPlaylistTracks,
  searchTracks,
  updatePlaylist,
} from '../api/spotify';
import '../App.css';

const readError = (err, fallback) =>
  err?.response?.data?.error || err?.message || fallback;

function Playlists() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);

  const [playlists, setPlaylists] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);

  // Playlist seleccionada (detalle).
  const [selected, setSelected] = useState(null);

  // Formulario crear / editar.
  const [form, setForm] = useState({ name: '', description: '' });
  const [editingId, setEditingId] = useState(null);

  // Buscador de canciones en la BD para añadir a la playlist.
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Cargar usuario autenticado
  useEffect(() => {
    getMe()
      .then((res) => {
        if (res.data?.user) {
          setCurrentUser(res.data.user);
        }
      })
      .catch(() => {
        localStorage.removeItem('token');
        navigate('/login');
      });
  }, [navigate]);

  const handleLifyLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const loadPlaylists = async () => {
    try {
      setStatus('loading');
      const res = await getPlaylists();
      setPlaylists(res.data?.playlists ?? []);
      setStatus('ready');
    } catch (err) {
      setError(readError(err, 'No se pudieron cargar las playlists.'));
      setStatus('error');
    }
  };

  useEffect(() => {
    loadPlaylists();
  }, []);

  const openPlaylist = async (id) => {
    try {
      const res = await getPlaylist(id);
      setSelected(res.data?.playlist ?? null);
      setSearch('');
      setSearchResults([]);
    } catch (err) {
      setError(readError(err, 'No se pudo abrir la playlist.'));
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    try {
      if (editingId) {
        await updatePlaylist(editingId, form);
      } else {
        await createPlaylist(form);
      }
      setForm({ name: '', description: '' });
      setEditingId(null);
      await loadPlaylists();
    } catch (err) {
      setError(readError(err, 'No se pudo guardar la playlist.'));
    }
  };

  const startEdit = (playlist) => {
    setEditingId(playlist._id);
    setForm({
      name: playlist.name,
      description: playlist.description || '',
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Seguro que quieres eliminar esta playlist?')) return;
    setError(null);

    try {
      await deletePlaylist(id);
      if (selected?._id === id) {
        setSelected(null);
      }
      await loadPlaylists();
    } catch (err) {
      setError(readError(err, 'No se pudo eliminar la playlist.'));
    }
  };

  const handleSearchTracks = async (event) => {
    event.preventDefault();
    const term = search.trim();
    if (!term) return;

    setSearching(true);
    setError(null);
    try {
      const res = await searchTracks(term, 10);
      setSearchResults(res.data?.tracks ?? []);
    } catch (err) {
      setError(readError(err, 'No se pudieron buscar canciones.'));
    } finally {
      setSearching(false);
    }
  };

  // Solo se manda el trackId: el backend valida y copia los datos desde Track.
  const handleAddTrack = async (track) => {
    if (!selected) return;
    try {
      const res = await addTrackToPlaylist(selected._id, track.id, track);
      setSelected(res.data?.playlist ?? null);
      await loadPlaylists();
    } catch (err) {
      setError(readError(err, 'No se pudo añadir la canción.'));
    }
  };

  const handleRemoveTrack = async (trackId) => {
    if (!selected) return;
    try {
      const res = await removeTrackFromPlaylist(selected._id, trackId);
      setSelected(res.data?.playlist ?? null);
      await loadPlaylists();
    } catch (err) {
      setError(readError(err, 'No se pudo quitar la canción.'));
    }
  };

  const handleMove = async (index, direction) => {
    if (!selected) return;
    const order = selected.tracks.map((t) => t.id);
    const [moved] = order.splice(index, 1);
    order.splice(index + direction, 0, moved);
    try {
      const res = await reorderPlaylistTracks(selected._id, order);
      setSelected(res.data?.playlist ?? null);
      await loadPlaylists();
    } catch (err) {
      setError(readError(err, 'No se pudo reordenar.'));
    }
  };
  

  return (
    <div className="App-page">
      {/* Barra superior de navegación y usuario */}
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
          <Link to="/home" className="App-nav-link">
            ⬅ Ir al Catálogo
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

      <h1>Mis Playlists🍋</h1>
      <p className="App-subtitle">Crea y personaliza tus colecciones de música guardada.</p>

      <main className="App-main" style={{ maxWidth: 860, margin: '0 auto', padding: '0 1rem 3rem' }}>
        {error && (
          <p className="App-error" role="alert">
            {error}
          </p>
        )}

        {/* Formulario crear / editar */}
        <section className="Playlist-card">
          <h2 style={{ marginTop: 0 }}>
            {editingId ? 'Editar Playlist' : 'Crear Nueva Playlist'}
          </h2>
          <form onSubmit={handleSubmit} className="Playlist-form">
            <div className="App-search-row">
              <input
                className="App-search-input"
                type="text"
                placeholder="Nombre de la playlist (ej. Favoritas)"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="App-search-row">
              <input
                className="App-search-input"
                type="text"
                placeholder="Descripción (opcional)"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button className="App-search-button" type="submit">
                {editingId ? 'Guardar cambios' : 'Crear playlist'}
              </button>
              {editingId && (
                <button
                  type="button"
                  className="App-auth-button"
                  onClick={() => {
                    setEditingId(null);
                    setForm({ name: '', description: '' });
                  }}
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </section>

        {/* Lista de playlists */}
        <section className="Playlist-card">
          <h2 style={{ marginTop: 0 }}>Tus Playlists</h2>
          {status === 'loading' && <p className="App-status">Cargando tus playlists…</p>}
          {status === 'ready' && playlists.length === 0 && (
            <p className="App-status">Todavía no has creado playlists. ¡Crea una arriba!</p>
          )}

          <ul className="Playlist-list">
            {playlists.map((p) => (
              <li
                key={p._id}
                className={`Playlist-item ${selected?._id === p._id ? 'Playlist-item--active' : ''}`}
              >
                <button
                  type="button"
                  className="Playlist-item-main"
                  onClick={() => openPlaylist(p._id)}
                >
                  <strong style={{ fontSize: '1.05rem' }}>{p.name}</strong>
                  <span style={{ opacity: 0.7, fontSize: '0.85rem', display: 'block', marginTop: '0.2rem' }}>
                    {p.tracks?.length ?? 0} canción{(p.tracks?.length ?? 0) === 1 ? '' : 'es'}
                    {p.description ? ` · ${p.description}` : ''}
                  </span>
                </button>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    type="button"
                    className="App-auth-button"
                    onClick={() => startEdit(p)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="App-logout-button"
                    onClick={() => handleDelete(p._id)}
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Detalle de la playlist seleccionada */}
        {selected && (
          <section className="Playlist-card Playlist-card--detail">
            <h2 style={{ marginTop: 0 }}>🎵 {selected.name}</h2>
            {selected.description && (
              <p style={{ opacity: 0.8, marginTop: '-0.3rem', marginBottom: '1rem' }}>
                {selected.description}
              </p>
            )}

            <h3>Canciones en la playlist ({selected.tracks.length})</h3>
            {selected.tracks.length === 0 && (
              <p className="App-status">Esta playlist está vacía. Busca canciones abajo para añadirlas.</p>
            )}
            <ol className="Playlist-track-list">
              {selected.tracks.map((t, i) => (
                <li key={t.id} className="Playlist-track-item">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{t.name}</strong>
                    <span style={{ display: 'block', opacity: 0.7, fontSize: '0.85rem' }}>
                      {t.artists?.join(', ')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    <button
                      type="button"
                      className="App-auth-button"
                      onClick={() => handleMove(i, -1)}
                      disabled={i === 0}
                      title="Subir canción"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="App-auth-button"
                      onClick={() => handleMove(i, 1)}
                      disabled={i === selected.tracks.length - 1}
                      title="Bajar canción"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      className="App-logout-button"
                      onClick={() => handleRemoveTrack(t.id)}
                    >
                      Quitar
                    </button>
                  </div>
                </li>
              ))}
            </ol>

            {/* Buscador de canciones en la BD para añadir */}
            <div style={{ marginTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.2rem' }}>
              <h3 style={{ marginTop: 0 }}>Añadir canciones a «{selected.name}»</h3>
              <form onSubmit={handleSearchTracks} className="App-search-row">
                <input
                  className="App-search-input"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar en el catálogo guardado..."
                />
                <button className="App-search-button" type="submit" disabled={searching}>
                  {searching ? 'Buscando…' : 'Buscar'}
                </button>
              </form>

              {searchResults.length > 0 && (
                <ul className="Playlist-track-list" style={{ marginTop: '1rem' }}>
                  {searchResults.map((t) => {
                    const already = selected.tracks.some((x) => x.id === t.id);
                    return (
                      <li key={t.id} className="Playlist-track-item">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <strong>{t.name}</strong>
                          <span style={{ display: 'block', opacity: 0.7, fontSize: '0.85rem' }}>
                            {t.artists?.join(', ')}
                          </span>
                        </div>
                        <button
                          type="button"
                          className={already ? 'App-auth-button' : 'App-search-button'}
                          disabled={already}
                          onClick={() => handleAddTrack(t)}
                        >
                          {already ? 'Ya añadida' : '+ Añadir'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default Playlists;
