const PlayerController = require('../controllers/playerController');

describe('PlayerController (reproducción en el navegador)', () => {
  let authService;
  let playerService;
  let controller;
  let res;

  beforeEach(() => {
    authService = {
      getValidAccessToken: jest.fn(),
      destroySession: jest.fn(),
    };
    playerService = { play: jest.fn() };
    controller = new PlayerController(authService, playerService);

    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      end: jest.fn(),
    };
  });

  test('exige una uri de Spotify válida', async () => {
    await controller.play({ body: { deviceId: 'dev-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(playerService.play).not.toHaveBeenCalled();
  });

  test('exige el dispositivo del navegador', async () => {
    await controller.play({ body: { uri: 'spotify:track:abc' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('pide conectar la cuenta si no hay sesión', async () => {
    authService.getValidAccessToken.mockResolvedValue(null);

    await controller.play(
      { body: { uri: 'spotify:track:abc', deviceId: 'dev-1' }, headers: {} },
      res
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(playerService.play).not.toHaveBeenCalled();
  });

  test('reproduce en el dispositivo indicado', async () => {
    authService.getValidAccessToken.mockResolvedValue('access-1');
    playerService.play.mockResolvedValue(undefined);

    await controller.play(
      {
        body: { uri: 'spotify:track:abc', deviceId: 'dev-1' },
        headers: { cookie: 'lify_sid=sid-1' },
      },
      res
    );

    expect(authService.getValidAccessToken).toHaveBeenCalledWith('sid-1');
    expect(playerService.play).toHaveBeenCalledWith('access-1', {
      uri: 'spotify:track:abc',
      deviceId: 'dev-1',
    });
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
