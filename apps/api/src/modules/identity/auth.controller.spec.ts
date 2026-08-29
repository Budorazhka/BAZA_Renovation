import type { FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import type { SessionService } from './session.service';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';

const MARKETPLACE_ORIGIN = 'https://marketplace.test.local';

function makeRequest(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
  return {
    headers: { origin: MARKETPLACE_ORIGIN, cookie: 'baza_session=raw-token' },
    ...overrides,
  } as FastifyRequest;
}

describe('AuthController.checkSession', () => {
  const authService = {} as AuthService;

  afterEach(() => {
    delete process.env.CORS_ALLOWED_ORIGIN_MARKETPLACE;
    delete process.env.CORS_ALLOWED_ORIGIN_ERP;
    delete process.env.CORS_ALLOWED_ORIGIN_ADMIN;
  });

  it('returns a minimal authenticated response for an active marketplace session', async () => {
    process.env.CORS_ALLOWED_ORIGIN_MARKETPLACE = MARKETPLACE_ORIGIN;
    const getActiveSessionFromRequest = jest.fn().mockResolvedValue({ identityId: new Types.ObjectId().toString() });
    const controller = new AuthController(authService, { getActiveSessionFromRequest } as unknown as SessionService);

    await expect(controller.checkSession(makeRequest())).resolves.toEqual({ authenticated: true });
    expect(getActiveSessionFromRequest).toHaveBeenCalledWith(expect.anything(), 'marketplace');
  });

  it('returns the same unauthenticated response for a missing or invalid cookie', async () => {
    process.env.CORS_ALLOWED_ORIGIN_MARKETPLACE = MARKETPLACE_ORIGIN;
    const getActiveSessionFromRequest = jest.fn().mockResolvedValue(null);
    const controller = new AuthController(authService, { getActiveSessionFromRequest } as unknown as SessionService);

    await expect(controller.checkSession(makeRequest({ headers: { origin: MARKETPLACE_ORIGIN } }))).resolves.toEqual({
      authenticated: false,
    });
  });

  it('uses the existing origin-audience mismatch contract', async () => {
    const controller = new AuthController(authService, { getActiveSessionFromRequest: jest.fn() } as unknown as SessionService);

    await expect(controller.checkSession(makeRequest({ headers: { origin: 'https://unknown.test' } }))).rejects.toMatchObject(
      expect.objectContaining({ code: ErrorCode.AUTH_AUDIENCE_MISMATCH }),
    );
    await expect(controller.checkSession(makeRequest({ headers: {} }))).rejects.toBeInstanceOf(AppException);
  });
});
