const AuditService = require('../services/auditService');
const AdminController = require('../controllers/adminController');

const silent = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };

describe('AuditService', () => {
  let AuditLog;
  let service;

  beforeEach(() => {
    AuditLog = { create: jest.fn().mockResolvedValue({}), find: jest.fn() };
    service = new AuditService({ models: { AuditLog }, logger: silent });
  });

  test('guarda quién hizo la acción a partir de req.user', async () => {
    await service.log(
      {
        user: { userId: 'u1', username: 'ana', role: 'admin' },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'jest' },
      },
      { action: 'track.delete', resource: 'Track', resourceId: 't1' }
    );

    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        username: 'ana',
        role: 'admin',
        action: 'track.delete',
        resource: 'Track',
        resourceId: 't1',
        ip: '127.0.0.1',
        userAgent: 'jest',
        success: true,
      })
    );
  });

  test('sin usuario queda como anónimo', async () => {
    await service.log({}, { action: 'database.reset' });

    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, role: 'anonymous' })
    );
  });

  test('sin base de datos no escribe ni lanza', async () => {
    const offline = new AuditService({
      models: { AuditLog },
      isReady: () => false,
      logger: silent,
    });

    await expect(offline.log({}, { action: 'database.reset' })).resolves.toBe(false);
    expect(AuditLog.create).not.toHaveBeenCalled();
  });

  test('si MongoDB falla no lanza', async () => {
    AuditLog.create.mockRejectedValue(new Error('boom'));

    await expect(service.log({}, { action: 'database.reset' })).resolves.toBe(false);
  });

  test('list devuelve los últimos movimientos normalizados', async () => {
    AuditLog.find.mockReturnValue({
      sort: () => ({
        limit: () => ({
          lean: () =>
            Promise.resolve([
              {
                _id: 'l1',
                action: 'database.reset',
                username: 'ana',
                resource: 'Database',
                createdAt: new Date('2026-01-01'),
              },
            ]),
        }),
      }),
    });

    const logs = await service.list({ limit: 10 });

    expect(AuditLog.find).toHaveBeenCalledWith({});
    expect(logs).toEqual([
      expect.objectContaining({ id: 'l1', action: 'database.reset', username: 'ana' }),
    ]);
  });
});

describe('AdminController.resetDatabase', () => {
  let audit;
  let controller;
  let res;

  beforeEach(() => {
    audit = { log: jest.fn().mockResolvedValue(true), list: jest.fn().mockResolvedValue([]) };
    controller = new AdminController({ audit, isReady: () => true });
    res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  });

  test('con la base desconectada responde 503 y no registra nada', async () => {
    const offline = new AdminController({ audit, isReady: () => false });

    await offline.resetDatabase({ user: {} }, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(audit.log).not.toHaveBeenCalled();
  });

  test('el historial solo lista, sin efectos', async () => {
    await controller.getAuditLogs({ query: { limit: '5' } }, res);

    expect(audit.list).toHaveBeenCalledWith(expect.objectContaining({ limit: '5' }));
    expect(res.json).toHaveBeenCalledWith({ logs: [] });
  });
});
