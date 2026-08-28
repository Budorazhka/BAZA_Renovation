import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AdminPublicationService } from './admin-publication.service';
import type { AdminContext } from '../../shared/admin/admin-context';
import type { MarketplacePublicationRepository } from '@baza/publication';
import type { PublicationService } from '../publication/publication.service';
import type { AdminPolicyService } from './admin-policy.service';

function makeAdminContext(overrides: Partial<AdminContext> = {}): AdminContext {
  return {
    identityId: new Types.ObjectId().toString(),
    adminAccountId: new Types.ObjectId().toString(),
    isSuperAdmin: false,
    ...overrides,
  };
}

function makeMockConnection() {
  return {
    startSession: jest.fn().mockResolvedValue({
      withTransaction: async (work: () => Promise<unknown>) => work(),
      endSession: jest.fn().mockResolvedValue(undefined),
    }),
  };
}

function makePublication(overrides: Partial<{ sourceType: string; searchProjection: Record<string, unknown> }> = {}) {
  return {
    _id: new Types.ObjectId(),
    sourceType: overrides.sourceType ?? 'development',
    sourceId: new Types.ObjectId(),
    status: 'published',
    slug: 'zhk-solnechnyy',
    unpublishReason: null,
    searchProjection: overrides.searchProjection ?? { city: 'batumi' },
  };
}

describe('AdminPublicationService.unpublish', () => {
  it('резолвит resource=sourceType/action=unpublish/scopeValue=city из searchProjection и требует grant', async () => {
    const publication = makePublication({ sourceType: 'development', searchProjection: { city: 'batumi' } });
    const adminContext = makeAdminContext();
    const requireGrantSpy = jest.fn().mockResolvedValue(undefined);
    const requireReasonSpy = jest.fn();
    const unpublishSpy = jest.fn().mockResolvedValue(undefined);
    const findByIdSpy = jest.fn().mockResolvedValue(publication);

    const service = new AdminPublicationService(
      makeMockConnection() as never,
      { findById: findByIdSpy } as unknown as MarketplacePublicationRepository,
      { unpublish: unpublishSpy } as unknown as PublicationService,
      { requireGrant: requireGrantSpy, requireReason: requireReasonSpy } as unknown as AdminPolicyService,
    );

    await service.unpublish(adminContext, {
      publicationId: publication._id,
      reason: 'Duplicate listing detected',
      correlationId: 'test-correlation-id',
    });

    expect(requireReasonSpy).toHaveBeenCalledWith('Duplicate listing detected');
    expect(requireGrantSpy).toHaveBeenCalledWith({
      adminContext,
      resource: 'development',
      action: 'unpublish',
      scopeValue: 'batumi',
    });
  });

  it('вызывает PublicationService.unpublish с actorType:admin_account и adminAccountId как actorId', async () => {
    const publication = makePublication();
    const adminContext = makeAdminContext();
    const unpublishSpy = jest.fn().mockResolvedValue(undefined);

    const service = new AdminPublicationService(
      makeMockConnection() as never,
      { findById: jest.fn().mockResolvedValue(publication) } as unknown as MarketplacePublicationRepository,
      { unpublish: unpublishSpy } as unknown as PublicationService,
      { requireGrant: jest.fn().mockResolvedValue(undefined), requireReason: jest.fn() } as unknown as AdminPolicyService,
    );

    await service.unpublish(adminContext, {
      publicationId: publication._id,
      reason: 'Duplicate listing detected',
      correlationId: 'test-correlation-id',
    });

    expect(unpublishSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: publication.sourceType,
        sourceId: publication.sourceId,
        reason: 'Duplicate listing detected',
        actorType: 'admin_account',
        actorId: new Types.ObjectId(adminContext.adminAccountId),
      }),
      expect.anything(),
    );
  });

  it('бросает NotFoundException, если publication не найдена по id', async () => {
    const service = new AdminPublicationService(
      makeMockConnection() as never,
      { findById: jest.fn().mockResolvedValue(null) } as unknown as MarketplacePublicationRepository,
      { unpublish: jest.fn() } as unknown as PublicationService,
      { requireGrant: jest.fn(), requireReason: jest.fn() } as unknown as AdminPolicyService,
    );

    await expect(
      service.unpublish(makeAdminContext(), {
        publicationId: new Types.ObjectId(),
        reason: 'Duplicate listing detected',
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('требует reason ДО чтения publication из БД (fail fast)', async () => {
    const findByIdSpy = jest.fn();
    const requireReasonSpy = jest.fn().mockImplementation(() => {
      throw new Error('reason invalid');
    });

    const service = new AdminPublicationService(
      makeMockConnection() as never,
      { findById: findByIdSpy } as unknown as MarketplacePublicationRepository,
      { unpublish: jest.fn() } as unknown as PublicationService,
      { requireGrant: jest.fn(), requireReason: requireReasonSpy } as unknown as AdminPolicyService,
    );

    await expect(
      service.unpublish(makeAdminContext(), {
        publicationId: new Types.ObjectId(),
        reason: 'too short',
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toThrow('reason invalid');

    expect(findByIdSpy).not.toHaveBeenCalled();
  });

  it('scopeValue отсутствует (undefined), если searchProjection.city не задан (publication ещё не собрана worker-ом)', async () => {
    const publication = makePublication({ searchProjection: {} });
    const requireGrantSpy = jest.fn().mockResolvedValue(undefined);

    const service = new AdminPublicationService(
      makeMockConnection() as never,
      { findById: jest.fn().mockResolvedValue(publication) } as unknown as MarketplacePublicationRepository,
      { unpublish: jest.fn().mockResolvedValue(undefined) } as unknown as PublicationService,
      { requireGrant: requireGrantSpy, requireReason: jest.fn() } as unknown as AdminPolicyService,
    );

    await service.unpublish(makeAdminContext(), {
      publicationId: publication._id,
      reason: 'Duplicate listing detected',
      correlationId: 'test-correlation-id',
    });

    expect(requireGrantSpy).toHaveBeenCalledWith(expect.objectContaining({ scopeValue: undefined }));
  });
});

describe('AdminPublicationService.list', () => {
  function makeListedPublication(overrides: Partial<{ sourceType: string; city: string; organizationId: Types.ObjectId }> = {}) {
    return {
      _id: new Types.ObjectId(),
      sourceType: overrides.sourceType ?? 'development',
      sourceId: new Types.ObjectId(),
      publisherScope: { type: 'organization', organizationId: overrides.organizationId ?? new Types.ObjectId() },
      status: 'published',
      slug: 'zhk-test',
      publishedAt: new Date('2026-08-27T00:00:00.000Z'),
      unpublishedAt: undefined,
      unpublishReason: undefined,
      searchProjection: { city: overrides.city ?? 'batumi' },
    };
  }

  function makeService(overrides: {
    resolvePublicationReadScope?: jest.Mock;
    listForAdmin?: jest.Mock;
  } = {}) {
    return new AdminPublicationService(
      makeMockConnection() as never,
      { listForAdmin: overrides.listForAdmin ?? jest.fn().mockResolvedValue([]) } as unknown as MarketplacePublicationRepository,
      {} as unknown as PublicationService,
      {
        resolvePublicationReadScope: overrides.resolvePublicationReadScope ?? jest.fn().mockResolvedValue('all'),
      } as unknown as AdminPolicyService,
    );
  }

  it("super_admin ('all' scope) видит publication без фильтра по sourceType/city", async () => {
    const row = makeListedPublication();
    const listForAdminSpy = jest.fn().mockResolvedValue([row]);
    const service = makeService({
      resolvePublicationReadScope: jest.fn().mockResolvedValue('all'),
      listForAdmin: listForAdminSpy,
    });

    const result = await service.list(makeAdminContext({ isSuperAdmin: true }), { limit: 20 });

    expect(listForAdminSpy).toHaveBeenCalledWith(expect.objectContaining({ scopeFilter: {} }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: row._id.toString(), sourceType: 'development', city: 'batumi' });
  });

  it('scoped admin с одним city-grant видит только свой город — фильтр передаётся repository', async () => {
    const listForAdminSpy = jest.fn().mockResolvedValue([]);
    const scope = new Map([['development', { global: false, cities: ['batumi'] }]]);
    const service = makeService({
      resolvePublicationReadScope: jest.fn().mockResolvedValue(scope),
      listForAdmin: listForAdminSpy,
    });

    await service.list(makeAdminContext(), { limit: 20 });

    expect(listForAdminSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeFilter: { sourceType: 'development', 'searchProjection.city': { $in: ['batumi'] } },
      }),
    );
  });

  it('admin без единого read-гранта — пустой список без похода в repository (deny-by-default)', async () => {
    const listForAdminSpy = jest.fn();
    const service = makeService({
      resolvePublicationReadScope: jest.fn().mockResolvedValue(new Map()),
      listForAdmin: listForAdminSpy,
    });

    const result = await service.list(makeAdminContext(), { limit: 20 });

    expect(result).toEqual({ items: [], nextCursor: null });
    expect(listForAdminSpy).not.toHaveBeenCalled();
  });

  it('query-параметры sourceType/city ДОПОЛНИТЕЛЬНО сужают уже разрешённый scope (AND, не OR)', async () => {
    const listForAdminSpy = jest.fn().mockResolvedValue([]);
    const scope = new Map([['development', { global: true, cities: [] }]]);
    const service = makeService({
      resolvePublicationReadScope: jest.fn().mockResolvedValue(scope),
      listForAdmin: listForAdminSpy,
    });

    await service.list(makeAdminContext(), { sourceType: 'development', city: 'tbilisi', limit: 20 });

    // $and-обёртка, не прямая перезапись ключей scope-фильтра — иначе
    // клиентский sourceType мог бы тихо заменить уже разрешённое значение
    // (реальный баг, найденный integration-тестом на этом самом сценарии).
    expect(listForAdminSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeFilter: {
          $and: [
            { sourceType: 'development' },
            { sourceType: 'development', 'searchProjection.city': 'tbilisi' },
          ],
        },
      }),
    );
  });

  it('limit+1: если пришло limit+1 записей — обрезает последнюю, nextCursor равен её _id', async () => {
    const rows = [makeListedPublication(), makeListedPublication(), makeListedPublication()];
    const service = makeService({ listForAdmin: jest.fn().mockResolvedValue(rows) });

    const result = await service.list(makeAdminContext({ isSuperAdmin: true }), { limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBe(rows[1]!._id.toString());
  });

  it('ровно limit записей — nextCursor:null, без лишнего round-trip', async () => {
    const rows = [makeListedPublication(), makeListedPublication()];
    const service = makeService({ listForAdmin: jest.fn().mockResolvedValue(rows) });

    const result = await service.list(makeAdminContext({ isSuperAdmin: true }), { limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });

  it('organizationId в ответе резолвится из publisherScope.organizationId', async () => {
    const organizationId = new Types.ObjectId();
    const row = makeListedPublication({ organizationId });
    const service = makeService({ listForAdmin: jest.fn().mockResolvedValue([row]) });

    const result = await service.list(makeAdminContext({ isSuperAdmin: true }), { limit: 20 });

    expect(result.items[0]!.organizationId).toBe(organizationId.toString());
  });
});
