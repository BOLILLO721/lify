const SpotifyController = require('../controllers/spotifyController');

describe('Pruebas del Controlador de Spotify', () => {
  let mockService;
  let controller;
  let res;

  beforeEach(() => {
    // Servicio simulado: el controlador nunca usa el Spotify real.
    mockService = {
      searchTracks: jest.fn(),
      getAlbum: jest.fn(),
      getAlbumTracks: jest.fn(),
      getArtist: jest.fn(),
      getArtistAlbums: jest.fn(),
      searchArtists: jest.fn(),
    };
    controller = new SpotifyController(mockService);

    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
  });

  test('1. El JSON que retorna la API tiene la estructura esperada', async () => {
    // Respuesta cruda de Spotify...
    mockService.searchTracks.mockResolvedValue({
      tracks: {
        items: [
          {
            id: 'track-1',
            name: 'Primaveral',
            duration_ms: 210000,
            artists: [{ name: 'Mon Laferte' }],
            album: { id: 'album-1', name: 'La Trenza', images: [] },
            external_urls: { spotify: 'https://open.spotify.com/track/track-1' },
          },
        ],
      },
    });

    await controller.searchTracks({ query: { q: 'Primaveral' } }, res);

    const payload = res.json.mock.calls[0][0];

    // ...y la forma normalizada que ve el frontend.
    expect(payload).toEqual({
      tracks: [
        {
          id: 'track-1',
          name: 'Primaveral',
          // El mapper reconstruye la URI cuando Spotify no la incluye.
          uri: 'spotify:track:track-1',
          artists: ['Mon Laferte'],
          album: { id: 'album-1', name: 'La Trenza', image: null },
          url: 'https://open.spotify.com/track/track-1',
          durationMs: 210000,
        },
      ],
    });
    expect(Array.isArray(payload.tracks)).toBe(true);
    expect(payload.tracks[0]).toHaveProperty('id');
  });

  test('2. Cuando la API falla, retorna un error claro', async () => {
    mockService.searchTracks.mockRejectedValue(new Error('Fallo de red'));

    await controller.searchTracks({ query: { q: 'Primaveral' } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Error de comunicación con Spotify',
    });
  });

  test('3. El controlador funciona con un servicio simulado', async () => {
    mockService.searchTracks.mockResolvedValue({ tracks: { items: [] } });

    await controller.searchTracks({ query: { q: 'Bad Bunny' } }, res);

    expect(mockService.searchTracks).toHaveBeenCalledWith('Bad Bunny', {
      limit: 10,
    });
    expect(res.json).toHaveBeenCalledWith({ tracks: [] });
  });
});
