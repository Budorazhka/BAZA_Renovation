import { Types } from 'mongoose';
import { AuditService } from './audit.service';
import type { AuditEventRepository } from './repository/audit-event.repository';

/**
 * master plan разд.6.3: audit payload не содержит password/token/provider secret.
 */
describe('AuditService', () => {
  function makeService(): { service: AuditService; appendSpy: jest.Mock } {
    const appendSpy = jest.fn().mockResolvedValue(undefined);
    const mockRepository = { append: appendSpy } as unknown as AuditEventRepository;
    return { service: new AuditService(mockRepository), appendSpy };
  }

  it('отклоняет запись, если before содержит запрещённый ключ (passwordHash)', async () => {
    const { service } = makeService();

    await expect(
      service.append({
        actor: { type: 'identity', id: new Types.ObjectId() },
        action: 'update',
        resource: 'identity',
        resourceId: new Types.ObjectId(),
        before: { normalizedLogin: 'x@y.com', passwordHash: '$argon2id$...' },
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toThrow(/запрещённые ключи/);
  });

  it('отклоняет запись, если after содержит запрещённый ключ (tokenHash)', async () => {
    const { service } = makeService();

    await expect(
      service.append({
        actor: { type: 'system' },
        action: 'session.create',
        resource: 'session',
        resourceId: new Types.ObjectId(),
        after: { productAudience: 'erp', tokenHash: 'abc123' },
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toThrow(/запрещённые ключи/);
  });

  it('пропускает запись без запрещённых ключей', async () => {
    const { service, appendSpy } = makeService();

    await service.append({
      actor: { type: 'identity', id: new Types.ObjectId() },
      action: 'update',
      resource: 'unit',
      resourceId: new Types.ObjectId(),
      before: { status: 'available' },
      after: { status: 'reserved' },
      correlationId: 'test-correlation-id',
    });

    expect(appendSpy).toHaveBeenCalledTimes(1);
  });

  it('пропускает запись вообще без before/after', async () => {
    const { service, appendSpy } = makeService();

    await service.append({
      actor: { type: 'system' },
      action: 'booking.expired',
      resource: 'booking',
      resourceId: new Types.ObjectId(),
      correlationId: 'test-correlation-id',
    });

    expect(appendSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * Найдено ревью: top-level-only проверка пропускала бы секрет на втором
   * и глубже уровне вложенности — `{assignment: {session: {tokenHash}}}}`.
   */
  it('отклоняет запись, если запрещённый ключ находится на ВТОРОМ уровне вложенности', async () => {
    const { service } = makeService();

    await expect(
      service.append({
        actor: { type: 'identity', id: new Types.ObjectId() },
        action: 'update',
        resource: 'session',
        resourceId: new Types.ObjectId(),
        after: { assignment: { session: { tokenHash: 'deadbeef' } } },
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toThrow(/запрещённые ключи/);
  });

  /**
   * Найдено ревью: точное строковое совпадение (`Set.has`) пропускало бы
   * `Password`/`PASSWORD` — тот же ключ, другой регистр.
   */
  it('отклоняет запись независимо от регистра запрещённого ключа', async () => {
    const { service } = makeService();

    await expect(
      service.append({
        actor: { type: 'identity', id: new Types.ObjectId() },
        action: 'update',
        resource: 'identity',
        resourceId: new Types.ObjectId(),
        before: { PasswordHash: '$argon2id$...' },
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toThrow(/запрещённые ключи/);
  });

  it('пропускает запись с ObjectId/Date значениями во вложенных полях (не ложное срабатывание рекурсии)', async () => {
    const { service, appendSpy } = makeService();

    await service.append({
      actor: { type: 'identity', id: new Types.ObjectId() },
      action: 'update',
      resource: 'booking',
      resourceId: new Types.ObjectId(),
      after: { dateRange: { startsAt: new Date(), expiresAt: new Date() }, unitId: new Types.ObjectId() },
      correlationId: 'test-correlation-id',
    });

    expect(appendSpy).toHaveBeenCalledTimes(1);
  });
});
