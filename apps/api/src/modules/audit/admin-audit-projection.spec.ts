import { Types } from 'mongoose';
import { toAdminAuditEventView } from './admin-audit-projection';
import type { AuditEventDocument } from './schemas/audit-event.schema';

function makeEvent(overrides: Partial<AuditEventDocument> = {}): AuditEventDocument {
  return {
    _id: new Types.ObjectId(),
    actor: { type: 'admin_account', id: new Types.ObjectId() },
    action: 'publication.unpublish',
    resource: 'development',
    resourceId: new Types.ObjectId(),
    reason: 'Duplicate listing',
    correlationId: 'corr-1',
    createdAt: new Date('2026-08-20T10:00:00.000Z'),
    ...overrides,
  } as AuditEventDocument;
}

describe('toAdminAuditEventView', () => {
  it('никогда не возвращает поля вне явного whitelist для известного action', () => {
    const event = makeEvent({
      action: 'admin_account.create',
      before: undefined,
      after: {
        identityId: 'id-1',
        isSuperAdmin: true,
        // не в whitelist для admin_account.create — не должно попасть в ответ
        internalNote: 'секретная заметка',
        sessionTokenHash: 'should-never-appear',
      },
    });

    const view = toAdminAuditEventView(event);

    expect(view.after).toEqual({ identityId: 'id-1', isSuperAdmin: true });
    expect(view.after).not.toHaveProperty('internalNote');
    expect(view.after).not.toHaveProperty('sessionTokenHash');
  });

  it('возвращает before/after=null для action без записи в FIELD_WHITELIST (safe default)', () => {
    const event = makeEvent({
      action: 'unknown.future.action',
      before: { anything: 'here' },
      after: { anything: 'else' },
    });

    const view = toAdminAuditEventView(event);

    expect(view.before).toBeNull();
    expect(view.after).toBeNull();
  });

  it('publication.unpublish никогда не показывает before/after (только reason/summary)', () => {
    const event = makeEvent({
      action: 'publication.unpublish',
      before: { status: 'published', internalField: 'x' },
      after: { status: 'unpublished' },
      reason: 'Duplicate listing detected',
    });

    const view = toAdminAuditEventView(event);

    expect(view.before).toBeNull();
    expect(view.after).toBeNull();
    expect(view.reason).toBe('Duplicate listing detected');
    expect(view.summary).toContain(event.resourceId.toString());
  });

  it('сериализует actor/resourceId/createdAt как строки, не оставляет ObjectId/Date в ответе', () => {
    const event = makeEvent();
    const view = toAdminAuditEventView(event);

    expect(typeof view.id).toBe('string');
    expect(typeof view.resourceId).toBe('string');
    expect(typeof view.actor.id).toBe('string');
    expect(typeof view.createdAt).toBe('string');
    expect(view.createdAt).toBe(event.createdAt.toISOString());
  });

  it('actor.id=null для system-актора (нет id)', () => {
    const event = makeEvent({ actor: { type: 'system' } });
    const view = toAdminAuditEventView(event);

    expect(view.actor).toEqual({ type: 'system', id: null });
  });

  it('reason=null, если в записи нет reason', () => {
    const event = makeEvent({ reason: undefined });
    const view = toAdminAuditEventView(event);

    expect(view.reason).toBeNull();
  });

  it('пустой whitelisted payload (все ключи отфильтрованы) возвращает null, не {}', () => {
    const event = makeEvent({
      action: 'admin_account.deactivate',
      after: { unrelatedField: 'x' },
    });

    const view = toAdminAuditEventView(event);

    expect(view.after).toBeNull();
  });
});
