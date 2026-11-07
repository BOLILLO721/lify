import { Link } from 'react-router-dom';

/** Se muestra cuando la URL no coincide con ninguna ruta. */
function NotFound() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Lify🍋</h1>
        <p className="App-empty">Esta página no existe.</p>
        <Link className="App-connect" to="/">
          Volver al inicio
        </Link>
      </header>
    </div>
  );
}

export default NotFound;
