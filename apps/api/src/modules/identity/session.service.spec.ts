import { Types } from 'mongoose';
import { SessionService } from './session.service';
import type { SessionRepository } from './repository/session.repository';

function makeService(repository: Partial<SessionRepository> = {}): SessionService {
  return new SessionService(repository as SessionRepository);
}

function makeRequest(cookieHeader: string | undefined) {
  return { headers: { cookie: cookieHeader } } as never;
}

describe('SessionService — logout support', () => {
  it('revokeSession хеширует токен и делегирует revokeByTokenHash', async () => {
    const revokeByTokenHashSpy = jest.fn().mockResolvedValue(undefined);
    const service = makeService({ revokeByTokenHash: revokeByTokenHashSpy });

    await service.revokeSession('some-raw-token');

    expect(revokeByTokenHashSpy).toHaveBeenCalledWith(expect.any(String));
    expect(revokeByTokenHashSpy.mock.calls[0][0]).not.toBe('some-raw-token');
  });

  it('revokeSession идемпотентен: повторный вызов с тем же токеном не бросает', async () => {
    const revokeByTokenHashSpy = jest.fn().mockResolvedValue(undefined);
    const service = makeService({ revokeByTokenHash: revokeByTokenHashSpy });

    await service.revokeSession('some-raw-token');
    await service.revokeSession('some-raw-token');

    expect(revokeByTokenHashSpy).toHaveBeenCalledTimes(2);
  });

  it('getRawTokenFromRequest извлекает токен из baza_session cookie', () => {
    const service = makeService();
    const token = service.getRawTokenFromRequest(makeRequest('baza_session=abc123; other=xyz'));
    expect(token).toBe('abc123');
  });

  it('getRawTokenFromRequest возвращает undefined без cookie-заголовка', () => {
    const service = makeService();
    expect(service.getRawTokenFromRequest(makeRequest(undefined))).toBeUndefined();
  });

  it('revokeAllAdminSessions отзывает только admin-audience сессии этой identity', async () => {
    const revokeAllForIdentitySpy = jest.fn().mockResolvedValue(undefined);
    const service = makeService({ revokeAllForIdentity: revokeAllForIdentitySpy });
    const identityId = new Types.ObjectId();

    await service.revokeAllAdminSessions(identityId);

    expect(revokeAllForIdentitySpy).toHaveBeenCalledWith(identityId, 'admin');
  });
});
