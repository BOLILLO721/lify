const AuthController = require('../controllers/authController');

describe('AuthController (login con Spotify)', () => {
  let authService;
  let controller;
  let res;

  const buildRes = () => ({
    setHeader: jest.fn(),
    redirect: jest.fn(),
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
    end: jest.fn(),
  });

  beforeEach(() => {
    authService = {
      createState: jest.fn(() => 'state-123'),
      buildAuthorizeUrl: jest.fn(
        (state) => `https://accounts.spotify.com/authorize?state=${state}`
      ),
      exchangeCode: jest.fn(),
      getSession: jest.fn(),
      getProfile: jest.fn(),
      getValidAccessToken: jest.fn(),
      destroySession: jest.fn(),
    };

    controller = new AuthController(authService, {
      frontendUrl: 'http://127.0.0.1:3000',
    });
    res = buildRes();
  });

  test('login guarda el state en una cookie y redirige a Spotify', () => {
    controller.login({}, res);

    expect(authService.createState).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('lify_oauth_state=state-123')
    );
    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining('accounts.spotify.com/authorize')
    );
  });

  test('callback rechaza un state que no coincide con la cookie', async () => {
    await controller.callback(
      {
        query: { code: 'abc', state: 'otro' },
        headers: { cookie: 'lify_oauth_state=state-123' },
      },
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(authService.exchangeCode).not.toHaveBeenCalled();
  });

  test('callback canjea el code y crea la sesión', async () => {
    authService.exchangeCode.mockResolvedValue('sid-1');
    authService.getSession.mockReturnValue({ accessToken: 'token-1', profile: null });
    authService.getProfile.mockResolvedValue({ id: 'u1', name: 'Lify', image: null });

    await controller.callback(
      {
        query: { code: 'abc', state: 'state-123' },
        headers: { cookie: 'lify_oauth_state=state-123' },
      },
      res
    );

    expect(authService.exchangeCode).toHaveBeenCalledWith('abc');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.arrayContaining([expect.stringContaining('lify_sid=sid-1')])
    );
    expect(res.redirect).toHaveBeenCalledWith('http://127.0.0.1:3000/');
  });

  test('token responde 401 cuando no hay sesión', async () => {
    authService.getValidAccessToken.mockResolvedValue(null);

    await controller.token({ headers: {} }, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('token devuelve el access token y no se cachea', async () => {
    authService.getValidAccessToken.mockResolvedValue('access-1');

    await controller.token({ headers: { cookie: 'lify_sid=sid-1' } }, res);

    expect(authService.getValidAccessToken).toHaveBeenCalledWith('sid-1');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.json).toHaveBeenCalledWith({ access_token: 'access-1' });
  });

  test('me informa si hay sesión y el perfil', () => {
    authService.getSession.mockReturnValue({
      profile: { id: 'u1', name: 'Lify', image: null },
    });

    controller.me({ headers: { cookie: 'lify_sid=sid-1' } }, res);

    expect(res.json).toHaveBeenCalledWith({
      connected: true,
      user: { id: 'u1', name: 'Lify', image: null },
    });
  });
});
