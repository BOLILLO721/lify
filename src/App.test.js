import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import {
  getAlbumTracks,
  getArtistInfo,
  getAuthStatus,
  getCatalog,
  getLoginUrl,
  logout,
  searchArtists,
  searchTracks,
} from './api/spotify';

jest.mock('./api/spotify');

const mockPlay = jest.fn();

jest.mock('./hooks/useSpotifyPlayer', () => ({
  useSpotifyPlayer: () => ({
    status: 'ready',
    isPlaying: false,
    error: null,
    canPlay: true,
    play: mockPlay,
    togglePlay: jest.fn(),
    clearError: jest.fn(),
  }),
}));

const buildTrack = (id, name) => ({
  id,
  name,
  uri: `spotify:track:${id}`,
  artists: ['Mon Laferte'],
  album: { id: 'album-1', name: 'La Trenza', image: null },
  url: `https://open.spotify.com/track/${id}`,
  durationMs: 210000,
});

beforeEach(() => {
  jest.clearAllMocks();

  getAuthStatus.mockResolvedValue({
    data: { connected: false, user: null },
  });
  getLoginUrl.mockReturnValue('http://127.0.0.1:3001/api/auth/login');
  logout.mockResolvedValue({});

  getCatalog.mockResolvedValue({
    data: {
      tracks: [buildTrack('t1', 'Primaveral'), buildTrack('t2', 'Violeta')],
    },
  });
  searchTracks.mockResolvedValue({
    data: { tracks: [buildTrack('t3', 'Tití Me Preguntó')] },
  });
  searchArtists.mockResolvedValue({
    data: {
      artists: [
        {
          id: '4q3ewBCX7sLwd24euuV69X',
          name: 'Bad Bunny',
          image: null,
          url: null,
        },
      ],
    },
  });
  getArtistInfo.mockResolvedValue({
    data: {
      artist: { id: '4q3ewBCX7sLwd24euuV69X', name: 'Bad Bunny', image: null, url: null },
      albums: [
        {
          id: 'a1',
          name: 'DeBÍ TiRAR MáS FOToS',
          releaseDate: '2025-01-05',
          image: null,
          url: null,
        },
      ],
    },
  });
  getAlbumTracks.mockResolvedValue({
    data: { tracks: [buildTrack('t4', 'Tití Me Preguntó')] },
  });

  mockPlay.mockResolvedValue(true);
});

test('muestra el catálogo de canciones al arrancar', async () => {
  render(<App />);

  expect(await screen.findByText('Primaveral')).toBeInTheDocument();
  expect(await screen.findByText('Violeta')).toBeInTheDocument();
  expect(getCatalog).toHaveBeenCalledTimes(1);
});

test('muestra la opción de conectar cuando no hay sesión de Spotify', async () => {
  render(<App />);

  const link = await screen.findByRole('link', { name: 'Conectar con Spotify' });
  expect(link).toHaveAttribute('href', 'http://127.0.0.1:3001/api/auth/login');
});

test('permite reproducir una canción cuando hay sesión activa', async () => {
  getAuthStatus.mockResolvedValue({
    data: { connected: true, user: { id: 'u1', name: 'Lify User' } },
  });

  render(<App />);

  expect(await screen.findByText('Conectado como Lify User')).toBeInTheDocument();

  const playButton = screen.getByRole('button', { name: 'Reproducir Primaveral' });
  expect(playButton).not.toBeDisabled();

  fireEvent.click(playButton);

  await waitFor(() =>
    expect(mockPlay).toHaveBeenCalledWith('spotify:track:t1')
  );
  expect(await screen.findByRole('region', { name: 'Reproductor' })).toBeInTheDocument();
});

test('el buscador pide las canciones escritas por el usuario', async () => {
  render(<App />);
  await screen.findByText('Primaveral');

  fireEvent.change(screen.getByLabelText('Buscar canción'), {
    target: { value: 'Tití Me Preguntó' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

  await waitFor(() =>
    expect(searchTracks).toHaveBeenCalledWith('Tití Me Preguntó', 10)
  );
  expect(await screen.findByText('Resultados de «Tití Me Preguntó»')).toBeInTheDocument();
});

test('busca artistas y muestra sus álbumes', async () => {
  render(<App />);
  await screen.findByText('Primaveral');

  fireEvent.click(screen.getByRole('button', { name: 'Artistas' }));
  fireEvent.change(screen.getByLabelText('Buscar artista'), {
    target: { value: 'Bad Bunny' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

  const artist = await screen.findByRole('button', {
    name: 'Ver los álbumes de Bad Bunny',
  });
  expect(searchArtists).toHaveBeenCalledWith('Bad Bunny', 10);

  fireEvent.click(artist);

  expect(await screen.findByText('Álbumes de Bad Bunny')).toBeInTheDocument();
  expect(await screen.findByText('DeBÍ TiRAR MáS FOToS')).toBeInTheDocument();
});

test('al pulsar un álbum se ven sus canciones', async () => {
  render(<App />);
  await screen.findByText('Primaveral');

  fireEvent.click(screen.getByRole('button', { name: 'Artistas' }));
  fireEvent.change(screen.getByLabelText('Buscar artista'), {
    target: { value: 'Bad Bunny' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

  fireEvent.click(
    await screen.findByRole('button', { name: 'Ver los álbumes de Bad Bunny' })
  );
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Ver las canciones de DeBÍ TiRAR MáS FOToS',
    })
  );

  await waitFor(() => expect(getAlbumTracks).toHaveBeenCalledWith('a1', 20));
  expect(
    await screen.findByText('Canciones de «DeBÍ TiRAR MáS FOToS»')
  ).toBeInTheDocument();
});

test('muestra un error cuando la API falla', async () => {
  getCatalog.mockRejectedValue({
    response: { data: { error: 'Error de comunicación con Spotify' } },
  });

  render(<App />);

  expect(
    await screen.findByText('Error de comunicación con Spotify')
  ).toBeInTheDocument();
});
