import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AdminAuditService } from './admin-audit.service';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import type { AdminContext } from '../../shared/admin/admin-context';
import type { AuditService } from '../audit/audit.service';
import type { AdminPolicyService } from './admin-policy.service';
import type { MarketplacePublicationRepository } from '@baza/publication';
import type { AuditEventDocument } from '../audit/schemas/audit-event.schema';

function makeAdminContext(overrides: Partial<AdminContext> = {}): AdminContext {
  return {
    identityId: new Types.ObjectId().toString(),
    adminAccountId: new Types.ObjectId().toString(),
    isSuperAdmin: false,
    ...overrides,
  };
}

function makeAuditEvent(overrides: Partial<AuditEventDocument> = {}): AuditEventDocument {
  return {
    _id: new Types.ObjectId(),
    actor: { type: 'admin_account', id: new Types.ObjectId() },
    action: 'publication.unpublish',
    resource: 'development',
    resourceId: new Types.ObjectId(),
    correlationId: 'corr-1',
    createdAt: new Date('2026-08-20T10:00:00.000Z'),
    ...overrides,
  } as AuditEventDocument;
}

function makeService(options: {
  isSuperAdmin?: boolean;
  readScope?: 'all' | Map<'unit' | 'development' | 'listing', { global: boolean; cities: string[] }>;
  events?: AuditEventDocument[];
  publication?: { sourceType: string; sourceId: Types.ObjectId } | null;
  scopedSourceIds?: { sourceType: string; sourceId: Types.ObjectId }[];
}) {
  const listForAdminSpy = jest.fn().mockResolvedValue(options.events ?? []);
  const resolvePublicationReadScopeSpy = jest.fn().mockResolvedValue(options.readScope ?? 'all');
  const findByIdSpy = jest.fn().mockResolvedValue(options.publication ?? null);
  const listSourceIdsByScopeFilterSpy = jest.fn().mockResolvedValue(options.scopedSourceIds ?? []);

  const service = new AdminAuditService(
    { listForAdmin: listForAdminSpy } as unknown as AuditService,
    { resolvePublicationReadScope: resolvePublicationReadScopeSpy } as unknown as AdminPolicyService,
    {
      findById: findByIdSpy,
      listSourceIdsByScopeFilter: listSourceIdsByScopeFilterSpy,
    } as unknown as MarketplacePublicationRepository,
  );

  return { service, listForAdminSpy, resolvePublicationReadScopeSpy, findByIdSpy, listSourceIdsByScopeFilterSpy };
}

describe('AdminAuditService.list', () => {
  describe('super_admin', () => {
    it('без resource-фильтра запрашивает {} (видит всё, включая admin_account)', async () => {
      const { service, listForAdminSpy } = makeService({});
      await service.list(makeAdminContext({ isSuperAdmin: true }), { limit: 20 });

      expect(listForAdminSpy).toHaveBeenCalledWith(expect.objectContaining({ scopeFilter: {} }));
    });

    it('с resource=admin_account запрашивает {resource:"admin_account"} без ошибки', async () => {
      const { service, listForAdminSpy } = makeService({});
      await service.list(makeAdminContext({ isSuperAdmin: true }), { resource: 'admin_account', limit: 20 });

      expect(listForAdminSpy).toHaveBeenCalledWith(
        expect.objectContaining({ scopeFilter: { resource: 'admin_account' } }),
      );
    });
  });

  describe('scoped admin (не super_admin)', () => {
    it('явный resource=admin_account бросает ADMIN_SCOPE_INSUFFICIENT (403), не пустой список', async () => {
      const { service } = makeService({});
      const adminContext = makeAdminContext({ isSuperAdmin: false });

      await expect(service.list(adminContext, { resource: 'admin_account', limit: 20 })).rejects.toMatchObject({
        code: ErrorCode.ADMIN_SCOPE_INSUFFICIENT,
      });
    });

    it('без resource-фильтра scope-фильтр сужен на publication resource (admin_account никогда не в unfiltered feed) — readScope:"all" (например, global-грант на все три sourceType)', async () => {
      const { service, listForAdminSpy } = makeService({ readScope: 'all' });
      await service.list(makeAdminContext({ isSuperAdmin: false }), { limit: 20 });

      const [call] = listForAdminSpy.mock.calls[0] as [{ scopeFilter: Record<string, unknown> }];
      expect(call.scopeFilter).toEqual({ resource: { $in: ['development', 'unit', 'listing'] } });
    });

    it('deny-by-default: пустой read-scope (Map без записей) возвращает пустой список БЕЗ похода в audit-репозиторий', async () => {
      const { service, listForAdminSpy } = makeService({ readScope: new Map() });
      const result = await service.list(makeAdminContext({ isSuperAdmin: false }), { limit: 20 });

      expect(result).toEqual({ items: [], nextCursor: null });
      expect(listForAdminSpy).not.toHaveBeenCalled();
    });

    it('global-грант на конкретный sourceType матчит по resource напрямую, без похода в MarketplacePublicationRepository', async () => {
      const readScope = new Map([['development' as const, { global: true, cities: [] }]]);
      const { service, listForAdminSpy, listSourceIdsByScopeFilterSpy } = makeService({ readScope });
      await service.list(makeAdminContext({ isSuperAdmin: false }), { resource: 'development', limit: 20 });

      const [call] = listForAdminSpy.mock.calls[0] as [{ scopeFilter: Record<string, unknown> }];
      expect(call.scopeFilter).toEqual({ resource: 'development' });
      expect(listSourceIdsByScopeFilterSpy).not.toHaveBeenCalled();
    });

    /**
     * Найдено этим проходом (integration-тест): audit_events не имеет поля
     * searchProjection.city (это поле marketplace_publications) — city-scoped
     * грант должен резолвить sourceId-набор ЧЕРЕЗ MarketplacePublicationRepository,
     * не пытаться матчить city напрямую на audit-событии (что молча вернуло бы 0
     * строк для любого city-scoped admin).
     */
    it('city-scoped грант резолвит resourceId через MarketplacePublicationRepository.listSourceIdsByScopeFilter, строит resourceId:{$in:[...]}', async () => {
      const readScope = new Map([['development' as const, { global: false, cities: ['batumi'] }]]);
      const sourceId1 = new Types.ObjectId();
      const sourceId2 = new Types.ObjectId();
      const { service, listForAdminSpy, listSourceIdsByScopeFilterSpy } = makeService({
        readScope,
        scopedSourceIds: [
          { sourceType: 'development', sourceId: sourceId1 },
          { sourceType: 'development', sourceId: sourceId2 },
        ],
      });

      await service.list(makeAdminContext({ isSuperAdmin: false }), { resource: 'development', limit: 20 });

      expect(listSourceIdsByScopeFilterSpy).toHaveBeenCalledWith({
        sourceType: 'development',
        'searchProjection.city': { $in: ['batumi'] },
      });
      const [call] = listForAdminSpy.mock.calls[0] as [{ scopeFilter: Record<string, unknown> }];
      expect(call.scopeFilter).toEqual({ resource: 'development', resourceId: { $in: [sourceId1, sourceId2] } });
    });

    it('city-scoped грант без единой публикации в scope (resolver вернул []) — пустой список, БЕЗ похода в audit-репозиторий', async () => {
      const readScope = new Map([['development' as const, { global: false, cities: ['batumi'] }]]);
      const { service, listForAdminSpy } = makeService({ readScope, scopedSourceIds: [] });

      const result = await service.list(makeAdminContext({ isSuperAdmin: false }), { resource: 'development', limit: 20 });

      expect(result).toEqual({ items: [], nextCursor: null });
      expect(listForAdminSpy).not.toHaveBeenCalled();
    });
  });

  describe('фильтры (AND-сужение)', () => {
    it('action-фильтр передаётся как есть в client filter', async () => {
      const { service, listForAdminSpy } = makeService({});
      await service.list(makeAdminContext({ isSuperAdmin: true }), { action: 'publication.unpublish', limit: 20 });

      const [call] = listForAdminSpy.mock.calls[0] as [{ scopeFilter: Record<string, unknown> }];
      expect(call.scopeFilter).toEqual({ $and: [{}, { action: 'publication.unpublish' }] });
    });

    it('actorId маппится в "actor.id"', async () => {
      const { service, listForAdminSpy } = makeService({});
      const actorId = new Types.ObjectId();
      await service.list(makeAdminContext({ isSuperAdmin: true }), { actorId, limit: 20 });

      const [call] = listForAdminSpy.mock.calls[0] as [{ scopeFilter: Record<string, unknown> }];
      expect(call.scopeFilter).toEqual({ $and: [{}, { 'actor.id': actorId }] });
    });

    it('from/to собираются в createdAt:{$gte,$lte}', async () => {
      const { service, listForAdminSpy } = makeService({});
      await service.list(makeAdminContext({ isSuperAdmin: true }), {
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-31T23:59:59.000Z',
        limit: 20,
      });

      const [call] = listForAdminSpy.mock.calls[0] as [{ scopeFilter: Record<string, unknown> }];
      expect(call.scopeFilter).toEqual({
        $and: [
          {},
          { createdAt: { $gte: new Date('2026-08-01T00:00:00.000Z'), $lte: new Date('2026-08-31T23:59:59.000Z') } },
        ],
      });
    });

    it('publicationId резолвится в resource=sourceType/resourceId=sourceId публикации', async () => {
      const sourceId = new Types.ObjectId();
      const publicationId = new Types.ObjectId();
      const { service, listForAdminSpy, findByIdSpy } = makeService({
        publication: { sourceType: 'listing', sourceId },
      });

      await service.list(makeAdminContext({ isSuperAdmin: true }), { publicationId, limit: 20 });

      expect(findByIdSpy).toHaveBeenCalledWith(publicationId);
      const [call] = listForAdminSpy.mock.calls[0] as [{ scopeFilter: Record<string, unknown> }];
      expect(call.scopeFilter).toEqual({ $and: [{}, { resource: 'listing', resourceId: sourceId }] });
    });

    it('publicationId, не найденный в MarketplacePublicationRepository, бросает NotFoundException', async () => {
      const { service } = makeService({ publication: null });

      await expect(
        service.list(makeAdminContext({ isSuperAdmin: true }), { publicationId: new Types.ObjectId(), limit: 20 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('resourceId, противоречащий publicationId-резолву, возвращает пустой список (не ошибку — non-disclosure)', async () => {
      const sourceId = new Types.ObjectId();
      const conflictingResourceId = new Types.ObjectId();
      const { service, listForAdminSpy } = makeService({
        publication: { sourceType: 'listing', sourceId },
      });

      const result = await service.list(makeAdminContext({ isSuperAdmin: true }), {
        publicationId: new Types.ObjectId(),
        resourceId: conflictingResourceId,
        limit: 20,
      });

      expect(result).toEqual({ items: [], nextCursor: null });
      expect(listForAdminSpy).not.toHaveBeenCalled();
    });
  });

  describe('cursor pagination (limit+1 паттерн)', () => {
    it('nextCursor=null, когда rows.length <= limit', async () => {
      const events = [makeAuditEvent(), makeAuditEvent()];
      const { service } = makeService({ events });

      const result = await service.list(makeAdminContext({ isSuperAdmin: true }), { limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
    });

    it('nextCursor=последний _id страницы, когда rows.length > limit (лишняя запись обрезается)', async () => {
      const events = [makeAuditEvent(), makeAuditEvent(), makeAuditEvent()];
      const { service, listForAdminSpy } = makeService({ events });

      const result = await service.list(makeAdminContext({ isSuperAdmin: true }), { limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe(events[1]!._id.toString());
      expect(listForAdminSpy).toHaveBeenCalledWith(expect.objectContaining({ limit: 3 }));
    });

    it('cursor из params прокидывается в auditService.listForAdmin как есть', async () => {
      const cursor = new Types.ObjectId();
      const { service, listForAdminSpy } = makeService({});

      await service.list(makeAdminContext({ isSuperAdmin: true }), { cursor, limit: 20 });

      expect(listForAdminSpy).toHaveBeenCalledWith(expect.objectContaining({ cursor }));
    });
  });

  it('пустой результат (rows=[]) возвращает {items:[], nextCursor:null}', async () => {
    const { service } = makeService({ events: [] });
    const result = await service.list(makeAdminContext({ isSuperAdmin: true }), { limit: 20 });

    expect(result).toEqual({ items: [], nextCursor: null });
  });
});

describe('AdminAuditService.listForPublication', () => {
  it('переиспользует list() с предзаполненным publicationId — тот же repository/whitelist, не отдельная логика', async () => {
    const sourceId = new Types.ObjectId();
    const publicationId = new Types.ObjectId();
    const { service, listForAdminSpy } = makeService({ publication: { sourceType: 'unit', sourceId } });

    await service.listForPublication(makeAdminContext({ isSuperAdmin: true }), publicationId, { limit: 20 });

    const [call] = listForAdminSpy.mock.calls[0] as [{ scopeFilter: Record<string, unknown> }];
    expect(call.scopeFilter).toEqual({ $and: [{}, { resource: 'unit', resourceId: sourceId }] });
  });
});

describe('AppException type guard', () => {
  it('ADMIN_SCOPE_INSUFFICIENT из AppException имеет ожидаемый code', () => {
    const err = new AppException(ErrorCode.ADMIN_SCOPE_INSUFFICIENT, 'test');
    expect(err.code).toBe(ErrorCode.ADMIN_SCOPE_INSUFFICIENT);
  });
});
