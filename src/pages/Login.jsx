import { useEffect, useState } from 'react';
import { getMe, login, register } from '../api/spotify';
import { Navigate } from 'react-router-dom';

const readError = (err, fallback) =>
  err?.response?.data?.error || err?.message || fallback;

function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('user'); // 'user' | 'admin'
  const [user, setUser] = useState(null); // el usuario logueado
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Al cargar la página, si había un token guardado, preguntamos quién es.
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    getMe(token)
      .then((res) => setUser(res.data.user))
      .catch(() => {
        localStorage.removeItem('token');
      });
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'register') {
        await register({ username, password, role });
        // Tras registrarse, hacemos login automático para que no tenga
        // que escribir otra vez.
        const res = await login({ username, password });
        saveSession(res.data);
      } else {
        const res = await login({ username, password });
        saveSession(res.data);
      }
    } catch (err) {
      setError(readError(err, 'No se pudo completar la operación'));
    } finally {
      setLoading(false);
    }
  };

  const saveSession = (data) => {
    localStorage.setItem('token', data.token);
    setUser(data.user);
    setUsername('');
    setPassword('');
  };

  // --- Si ya está logueado ---
  if (user) {
    return <Navigate to="/home" replace />;
  }

  // --- Formulario de login / registro ---
  return (
    <div className="App">
      <header className="App-header">
        <h1>Lify🍋</h1>
        <p className="App-subtitle">
          {mode === 'login' ? 'Inicia sesión' : 'Crea tu cuenta'}
        </p>

        {error && (
          <p className="App-error" role="alert">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="App-search">
          <div className="App-search-row">
            <input
              className="App-search-input"
              type="text"
              placeholder="Nombre de usuario"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
            />
          </div>

          <div
            className="App-search-row"
            style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
          >
            <input
              className="App-search-input"
              type={showPassword ? 'text' : 'password'}
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={{ paddingRight: '46px' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '10px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.2rem',
                padding: '4px 6px',
                lineHeight: 1,
              }}
              title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>

          {mode === 'register' && (
            <div
              className="App-search-row"
              style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}
            >
              <label style={{ fontSize: '0.85rem', color: '#b3b3b3' }}>
                Tipo de cuenta:
              </label>
              <select
                className="App-search-input"
                style={{
                  padding: '0.6rem',
                  cursor: 'pointer',
                  background: '#181c24',
                  color: '#fff',
                }}
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="user">Usuario normal (Gestión de Playlists)</option>
                <option value="admin">Administrador (Acceso total y edición)</option>
              </select>
            </div>
          )}

          <button className="App-search-button" type="submit" disabled={loading}>
            {loading
              ? 'Espera…'
              : mode === 'login'
              ? 'Entrar'
              : 'Registrarme'}
          </button>
        </form>

        <button
          type="button"
          className="App-auth-button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
        >
          {mode === 'login'
            ? '¿No tienes cuenta? Regístrate'
            : '¿Ya tienes cuenta? Inicia sesión'}
        </button>
      </header>
    </div>
  );
}

export default Login;
