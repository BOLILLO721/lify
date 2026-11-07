const MusicStore = require('../services/musicStore');
const SpotifyController = require('../controllers/spotifyController');
const Track = require('../models/Track');
const TrackController = require('../controllers/trackController');

const silent = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };
// Un registro ya existente (editado a mano) no debe sobrescribirse:
// por eso el upsert usa $setOnInsert y no $set.

const track = {
  id: 't1',
  name: 'Primaveral',
  uri: 'spotify:track:t1',
  artists: ['Mon Laferte'],
  album: { id: 'a1', name: 'La Trenza', image: null },
  url: 'https://open.spotify.com/track/t1',
  durationMs: 1000,
};

describe('MusicStore', () => {
  let models;
  let ready;
  let store;

  beforeEach(() => {
    ready = true;
    models = {
      Track: {
        modelName: 'Track',
        bulkWrite: jest.fn().mockResolvedValue({}),
        find: jest.fn(),
        findByIdAndDelete: jest.fn(),
      },
      Artist: { modelName: 'Artist', bulkWrite: jest.fn().mockResolvedValue({}) },
      Album: { modelName: 'Album', bulkWrite: jest.fn().mockResolvedValue({}) },
    };
    store = new MusicStore({ models, isReady: () => ready, logger: silent });
  });

  test('guarda canciones con upsert usando el id de Spotify como _id', async () => {
    await store.saveTracks([track]);

    const [ops] = models.Track.bulkWrite.mock.calls[0];
    expect(ops[0].updateOne.filter).toEqual({ _id: 't1' });
    expect(ops[0].updateOne.upsert).toBe(true);
    expect(ops[0].updateOne.update.$setOnInsert.searchText).toBe('primaveral mon laferte la trenza');
  });

  test('sin conexión no escribe ni lanza error', async () => {
    ready = false;
    await expect(store.saveTracks([track])).resolves.toBe(0);
    expect(models.Track.bulkWrite).not.toHaveBeenCalled();
  });

  test('si MongoDB falla al escribir, no lanza error', async () => {
    models.Track.bulkWrite.mockRejectedValue(new Error('boom'));
    await expect(store.saveTracks([track])).resolves.toBe(0);
  });

  test('ignora registros sin id', async () => {
    await store.saveTracks([{ ...track, id: null }]);
    expect(models.Track.bulkWrite).not.toHaveBeenCalled();
  });

  test('busca sin tildes ni mayúsculas y devuelve el formato de la API', async () => {
    const chain = {
      sort: () => chain,
      limit: () => chain,
      lean: () =>
        Promise.resolve([{ _id: 't1', name: 'Primaveral', uri: 'u', artists: ['x'], album: null, url: null, durationMs: 1 }]),
    };
    models.Track.find.mockReturnValue(chain);

    const result = await store.findTracks('PRIMAVÉRAL');

    expect(models.Track.find.mock.calls[0][0].$or[0].searchText.test('primaveral')).toBe(true);
    expect(result[0]).toEqual({ id: 't1', name: 'Primaveral', uri: 'u', artists: ['x'], album: null, url: null, durationMs: 1 });
  });

  test('el texto de búsqueda se escapa (no se interpreta como regex)', async () => {
    const chain = { sort: () => chain, limit: () => chain, lean: () => Promise.resolve([]) };
    models.Track.find.mockReturnValue(chain);
    await expect(store.findTracks('(((')).resolves.toEqual([]);
  });

  test('borra una canción de Track y devuelve lo borrado (para auditar)', async () => {
    models.Track.findByIdAndDelete.mockReturnValue({
      lean: () => Promise.resolve({ _id: 't1', name: 'Primaveral', artists: ['Mon'] }),
    });

    await expect(store.deleteTrack('t1')).resolves.toMatchObject({ id: 't1', name: 'Primaveral' });
    expect(models.Track.findByIdAndDelete).toHaveBeenCalledWith('t1');
  });

  test('si la canción no existe devuelve null', async () => {
    models.Track.findByIdAndDelete.mockReturnValue({ lean: () => Promise.resolve(null) });

    await expect(store.deleteTrack('nope')).resolves.toBeNull();
  });

  test('sin conexión no borra ni lanza error', async () => {
    ready = false;

    await expect(store.deleteTrack('t1')).resolves.toBeNull();
    expect(models.Track.findByIdAndDelete).not.toHaveBeenCalled();
  });
});

describe('SpotifyController con base de datos', () => {
  let res;
  beforeEach(() => {
    res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  });

  test('cuando Spotify falla, responde con lo guardado', async () => {
    const service = { searchTracks: jest.fn().mockRejectedValue(new Error('down')) };
    const store = { saveTracks: jest.fn(), findTracks: jest.fn().mockResolvedValue([track]) };
    const controller = new SpotifyController(service, { store });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await controller.searchTracks({ query: { q: 'prima' } }, res);

    expect(res.json).toHaveBeenCalledWith({ tracks: [track] });
  });

  test('si Spotify falla y no hay copia, mantiene el error original', async () => {
    const service = { searchTracks: jest.fn().mockRejectedValue(new Error('down')) };
    const store = { saveTracks: jest.fn(), findTracks: jest.fn().mockResolvedValue([]) };
    const controller = new SpotifyController(service, { store });

    await controller.searchTracks({ query: { q: 'prima' } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('catálogo: guarda lo que llega y cae a la base si Spotify no da nada', async () => {
    const service = { searchTracks: jest.fn().mockRejectedValue(new Error('down')) };
    const store = { saveTracks: jest.fn(), getCatalog: jest.fn().mockResolvedValue([track]) };
    const controller = new SpotifyController(service, { store, catalogSeeds: ['a'] });

    await controller.getCatalog({ query: {} }, res);

    expect(res.json).toHaveBeenCalledWith({ tracks: [track] });
  });
});

describe('Modelo Track', () => {
  test('exige _id', async () => {
    await expect(new Track({ name: 'x' }).validate()).rejects.toThrow(/_id/);
    await expect(new Track({ _id: 't1', name: 'x' }).validate()).resolves.toBeUndefined();
  });
});

describe('SpotifyController en modo base de datos (Spotify apagado)', () => {
  let res;
  let store;
  let spotify;
  let controller;

  beforeEach(() => {
    res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    spotify = {
      searchTracks: jest.fn(),
      getAlbumTracks: jest.fn(),
      getArtist: jest.fn(),
      getArtistAlbums: jest.fn(),
      searchArtists: jest.fn(),
    };
    store = {
      isReady: jest.fn().mockReturnValue(true),
      saveTracks: jest.fn(),
      getCatalog: jest.fn().mockResolvedValue([track]),
      findTracks: jest.fn().mockResolvedValue([track]),
      findAlbumTracks: jest.fn().mockResolvedValue([track]),
      getArtist: jest.fn().mockResolvedValue({ id: 'ar1', name: 'Mon' }),
      getArtistAlbums: jest.fn().mockResolvedValue([]),
      findArtists: jest.fn().mockResolvedValue([{ id: 'ar1', name: 'Mon' }]),
      deleteTrack: jest.fn().mockResolvedValue({ id: 't1', name: 'Primaveral' }),
    };
    controller = new SpotifyController(spotify, { store, databaseOnly: true });
  });

  afterEach(() => {
    Object.values(spotify).forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });

  test('catálogo, búsqueda, álbum y artistas salen de la base', async () => {
    await controller.getCatalog({ query: {} }, res);
    await controller.searchTracks({ query: { q: 'prima' } }, res);
    await controller.getAlbumTracks({ query: { albumId: 'a1' } }, res);
    await controller.getArtistInfo({ query: { artistId: 'ar1' } }, res);
    await controller.searchArtists({ query: { q: 'mon' } }, res);

    expect(res.json.mock.calls.map((c) => Object.keys(c[0]))).toEqual([
      ['tracks'], ['tracks'], ['tracks'], ['artist', 'albums'], ['artists'],
    ]);
  });

  test('si la base está desconectada responde 503', async () => {
    store.isReady.mockReturnValue(false);
    await controller.getCatalog({ query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  test('artista inexistente en la base responde 404', async () => {
    store.getArtist.mockResolvedValue(null);
    await controller.getArtistInfo({ query: { artistId: 'x' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('borra una canción de la base por id', async () => {
    await TrackController.deleteTrack({ params: { id: 't1' } }, res, store);

    expect(store.deleteTrack).toHaveBeenCalledWith('t1');
    expect(res.json).toHaveBeenCalledWith({ message: 'Canción eliminada', id: 't1' });
  });

  test('canción inexistente al borrar responde 404', async () => {
    store.deleteTrack.mockResolvedValue(null);

    await TrackController.deleteTrack({ params: { id: 'nope' } }, res, store);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('SpotifyController con la base de datos primero (dbFirst)', () => {
  const stored = (n) => Array.from({ length: n }, (_, i) => ({ ...track, id: `db${i}` }));
  let res;
  let store;
  let spotify;
  let controller;

  beforeEach(() => {
    res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    spotify = {
      searchTracks: jest.fn().mockResolvedValue({
        tracks: { items: [{ id: 'sp1', name: 'Nueva', artists: [], album: null }] },
      }),
      searchArtists: jest.fn().mockResolvedValue({ artists: { items: [] } }),
    };
    store = {
      isReady: () => true,
      saveTracks: jest.fn(),
      saveArtists: jest.fn(),
      getCatalog: jest.fn(),
      findTracks: jest.fn(),
      findArtists: jest.fn(),
    };
    controller = new SpotifyController(spotify, { store, dbFirst: true });
  });

  test('si la base ya tiene suficientes resultados, no llama a Spotify', async () => {
    store.findTracks.mockResolvedValue(stored(10));

    await controller.searchTracks({ query: { q: 'a', limit: 10 } }, res);

    expect(spotify.searchTracks).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].tracks).toHaveLength(10);
  });

  test('si faltan resultados, completa con Spotify (la base va primero) y guarda lo nuevo', async () => {
    store.findTracks.mockResolvedValue(stored(2));

    await controller.searchTracks({ query: { q: 'a', limit: 10 } }, res);

    const ids = res.json.mock.calls[0][0].tracks.map((t) => t.id);
    expect(ids).toEqual(['db0', 'db1', 'sp1']);
    expect(store.saveTracks).toHaveBeenCalled();
  });

  test('catálogo: con suficientes canciones guardadas no llama a Spotify', async () => {
    store.getCatalog.mockResolvedValue(stored(10));

    await controller.getCatalog({ query: { limit: 10 } }, res);

    expect(spotify.searchTracks).not.toHaveBeenCalled();
  });

  test('artistas: la base responde sin llamar a Spotify si hay suficientes', async () => {
    store.findArtists.mockResolvedValue(Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, name: 'x' })));

    await controller.searchArtists({ query: { q: 'a', limit: 10 } }, res);

    expect(spotify.searchArtists).not.toHaveBeenCalled();
  });
});
