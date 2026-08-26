import { NotFoundException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DevelopmentsService } from './developments.service';
import type { DevelopmentRepository } from '@baza/development';
import type { BuildingRepository } from './repository/building.repository';
import type { SectionRepository } from './repository/section.repository';
import type { FloorRepository } from './repository/floor.repository';
import type { FloorPlanRepository } from './repository/floor-plan.repository';
import type { UnitRepository } from './repository/unit.repository';
import type { AuditService } from '../audit/audit.service';
import type { OutboxService } from '../outbox/outbox.service';
import type { PublicationService } from '../publication/publication.service';
import type { IdempotencyService } from '../../shared/idempotency/idempotency.service';

function makeMockConnection() {
  return {
    startSession: jest.fn().mockResolvedValue({
      withTransaction: async (work: () => Promise<unknown>) => work(),
      endSession: jest.fn().mockResolvedValue(undefined),
    }),
  };
}

function makeService(overrides: {
  developmentRepository?: Partial<DevelopmentRepository>;
  buildingRepository?: Partial<BuildingRepository>;
  sectionRepository?: Partial<SectionRepository>;
  floorRepository?: Partial<FloorRepository>;
  floorPlanRepository?: Partial<FloorPlanRepository>;
  unitRepository?: Partial<UnitRepository>;
  auditService?: Partial<AuditService>;
  outboxService?: Partial<OutboxService>;
  publicationService?: Partial<PublicationService>;
  idempotencyService?: Partial<IdempotencyService>;
} = {}) {
  return new DevelopmentsService(
    makeMockConnection() as never,
    (overrides.developmentRepository ?? {}) as DevelopmentRepository,
    (overrides.buildingRepository ?? {}) as BuildingRepository,
    (overrides.sectionRepository ?? {}) as SectionRepository,
    (overrides.floorRepository ?? {}) as FloorRepository,
    (overrides.floorPlanRepository ?? {}) as FloorPlanRepository,
    (overrides.unitRepository ?? {}) as UnitRepository,
    (overrides.auditService ?? { append: jest.fn().mockResolvedValue(undefined) }) as AuditService,
    (overrides.outboxService ?? { publish: jest.fn().mockResolvedValue(undefined) }) as OutboxService,
    (overrides.publicationService ?? {}) as PublicationService,
    (overrides.idempotencyService ?? { record: jest.fn().mockResolvedValue(undefined) }) as IdempotencyService,
  );
}

describe('DevelopmentsService — tenant isolation on child entity creation', () => {
  it('createBuilding отклоняет, если development не найден в организации', async () => {
    const findByIdForOrganization = jest.fn().mockResolvedValue(null);
    const createBuildingSpy = jest.fn();

    const service = makeService({
      developmentRepository: { findByIdForOrganization },
      buildingRepository: { create: createBuildingSpy },
    });

    await expect(
      service.createBuilding({
        developmentId: new Types.ObjectId(),
        organizationId: new Types.ObjectId(),
        name: 'Building A',
        floorsCount: 10,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(createBuildingSpy).not.toHaveBeenCalled();
  });

  it('createFloor отклоняет, если building не найден в организации', async () => {
    const findBuildingByIdForOrganization = jest.fn().mockResolvedValue(null);
    const createFloorSpy = jest.fn();

    const service = makeService({
      buildingRepository: { findByIdForOrganization: findBuildingByIdForOrganization },
      floorRepository: { create: createFloorSpy },
    });

    await expect(
      service.createFloor({
        buildingId: new Types.ObjectId(),
        organizationId: new Types.ObjectId(),
        floorNumber: 5,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(createFloorSpy).not.toHaveBeenCalled();
  });

  /**
   * Section существует в организации, но принадлежит ДРУГОМУ building —
   * не должна позволить прикрепить floor к чужому building через
   * подставную section. Прямая tenant/hierarchy-escape проверка.
   */
  it('createFloor отклоняет, если sectionId принадлежит ДРУГОМУ building той же организации', async () => {
    const buildingId = new Types.ObjectId();
    const otherBuildingId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();

    const service = makeService({
      buildingRepository: {
        findByIdForOrganization: jest.fn().mockResolvedValue({ _id: buildingId, organizationId }),
      },
      sectionRepository: {
        findByIdForOrganization: jest.fn().mockResolvedValue({ buildingId: otherBuildingId }),
      },
    });

    await expect(
      service.createFloor({
        buildingId,
        sectionId: new Types.ObjectId(),
        organizationId,
        floorNumber: 3,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  /**
   * Прямая проверка находки из паттерна assignOccupant/confirmUpload:
   * floorId существует в организации, но принадлежит ДРУГОМУ building,
   * чем переданный явно buildingId — createUnit не должен позволить
   * создать unit, "приписав" его к чужому building через floorId.
   */
  it('createUnit отклоняет, если floorId принадлежит ДРУГОМУ building, чем указанный buildingId', async () => {
    const buildingId = new Types.ObjectId();
    const otherBuildingId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const createUnitSpy = jest.fn();

    const service = makeService({
      floorRepository: {
        findByIdForOrganization: jest.fn().mockResolvedValue({ buildingId: otherBuildingId }),
      },
      unitRepository: { create: createUnitSpy },
    });

    await expect(
      service.createUnit({
        buildingId,
        floorId: new Types.ObjectId(),
        organizationId,
        number: '101',
        kind: 'apartment',
        area: 45,
        price: { amountMinorUnits: 10_000_000, currency: 'USD' },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(createUnitSpy).not.toHaveBeenCalled();
  });

  it('createUnit отклоняет, если floorPlanId принадлежит ДРУГОМУ building', async () => {
    const buildingId = new Types.ObjectId();
    const otherBuildingId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const floorId = new Types.ObjectId();

    const service = makeService({
      floorRepository: {
        findByIdForOrganization: jest.fn().mockResolvedValue({ buildingId }),
      },
      floorPlanRepository: {
        findByIdForOrganization: jest.fn().mockResolvedValue({ buildingId: otherBuildingId }),
      },
    });

    await expect(
      service.createUnit({
        buildingId,
        floorId,
        organizationId,
        number: '101',
        kind: 'apartment',
        area: 45,
        price: { amountMinorUnits: 10_000_000, currency: 'USD' },
        floorPlanId: new Types.ObjectId(),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('createUnit создаёт unit, если floor/floorPlan реально принадлежат указанному building', async () => {
    const buildingId = new Types.ObjectId();
    const floorId = new Types.ObjectId();
    const floorPlanId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const createUnitSpy = jest.fn().mockResolvedValue({ _id: new Types.ObjectId() });

    const service = makeService({
      floorRepository: { findByIdForOrganization: jest.fn().mockResolvedValue({ buildingId }) },
      floorPlanRepository: { findByIdForOrganization: jest.fn().mockResolvedValue({ buildingId }) },
      unitRepository: { create: createUnitSpy },
    });

    await service.createUnit({
      buildingId,
      floorId,
      organizationId,
      number: '101',
      kind: 'apartment',
      area: 45,
      price: { amountMinorUnits: 10_000_000, currency: 'USD' },
      floorPlanId,
    });

    expect(createUnitSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * Раньше controller не передавал sectionId вообще (CreateUnitDto его не
   * содержал), сервис создавал Unit без sectionId, даже если Floor реально
   * принадлежит секции — ломает фильтрацию по секции в шахматке/остатках.
   * sectionId теперь серверный: берётся из уже проверенного floor.sectionId,
   * клиент его не передаёт и не может подделать.
   */
  it('createUnit проставляет sectionId из floor.sectionId, если этаж принадлежит секции', async () => {
    const buildingId = new Types.ObjectId();
    const floorId = new Types.ObjectId();
    const sectionId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const createUnitSpy = jest.fn().mockResolvedValue({ _id: new Types.ObjectId() });

    const service = makeService({
      floorRepository: { findByIdForOrganization: jest.fn().mockResolvedValue({ buildingId, sectionId }) },
      unitRepository: { create: createUnitSpy },
    });

    await service.createUnit({
      buildingId,
      floorId,
      organizationId,
      number: '101',
      kind: 'apartment',
      area: 45,
      price: { amountMinorUnits: 10_000_000, currency: 'USD' },
    });

    expect(createUnitSpy).toHaveBeenCalledWith(expect.objectContaining({ sectionId }));
  });

  it('createUnit оставляет sectionId undefined, если этаж не принадлежит секции', async () => {
    const buildingId = new Types.ObjectId();
    const floorId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const createUnitSpy = jest.fn().mockResolvedValue({ _id: new Types.ObjectId() });

    const service = makeService({
      floorRepository: { findByIdForOrganization: jest.fn().mockResolvedValue({ buildingId, sectionId: undefined }) },
      unitRepository: { create: createUnitSpy },
    });

    await service.createUnit({
      buildingId,
      floorId,
      organizationId,
      number: '101',
      kind: 'apartment',
      area: 45,
      price: { amountMinorUnits: 10_000_000, currency: 'USD' },
    });

    expect(createUnitSpy).toHaveBeenCalledWith(expect.objectContaining({ sectionId: undefined }));
  });
});

describe('DevelopmentsService.createSection', () => {
  it('создаёт section, если building найден в организации', async () => {
    const buildingId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const createSectionSpy = jest.fn().mockResolvedValue({ _id: new Types.ObjectId() });

    const service = makeService({
      buildingRepository: { findByIdForOrganization: jest.fn().mockResolvedValue({ _id: buildingId }) },
      sectionRepository: { create: createSectionSpy },
    });

    await service.createSection({ buildingId, organizationId, name: 'Секция А' });

    expect(createSectionSpy).toHaveBeenCalledWith({ buildingId, organizationId, name: 'Секция А' });
  });

  it('отклоняет, если building не найден в организации', async () => {
    const createSectionSpy = jest.fn();
    const service = makeService({
      buildingRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(null) },
      sectionRepository: { create: createSectionSpy },
    });

    await expect(
      service.createSection({ buildingId: new Types.ObjectId(), organizationId: new Types.ObjectId(), name: 'Секция А' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(createSectionSpy).not.toHaveBeenCalled();
  });
});

describe('DevelopmentsService.createFloorPlan', () => {
  it('создаёт floor plan, если building найден в организации', async () => {
    const buildingId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const createFloorPlanSpy = jest.fn().mockResolvedValue({ _id: new Types.ObjectId() });

    const service = makeService({
      buildingRepository: { findByIdForOrganization: jest.fn().mockResolvedValue({ _id: buildingId }) },
      floorPlanRepository: { create: createFloorPlanSpy },
    });

    await service.createFloorPlan({ buildingId, organizationId, name: 'Планировка 1', rooms: 2, area: 55 });

    expect(createFloorPlanSpy).toHaveBeenCalledWith(
      expect.objectContaining({ buildingId, organizationId, name: 'Планировка 1', rooms: 2, area: 55 }),
    );
  });

  it('отклоняет, если building не найден в организации', async () => {
    const createFloorPlanSpy = jest.fn();
    const service = makeService({
      buildingRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(null) },
      floorPlanRepository: { create: createFloorPlanSpy },
    });

    await expect(
      service.createFloorPlan({ buildingId: new Types.ObjectId(), organizationId: new Types.ObjectId(), name: 'X', rooms: 1, area: 30 }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(createFloorPlanSpy).not.toHaveBeenCalled();
  });
});

describe('DevelopmentsService — optimistic concurrency', () => {
  it('updateDevelopment бросает ConflictException при VERSION_CONFLICT (запись существует, версия устарела)', async () => {
    const developmentId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();

    const service = makeService({
      developmentRepository: {
        updateWithVersionCheck: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
        findByIdForOrganization: jest.fn().mockResolvedValue({ _id: developmentId }),
      },
    });

    await expect(
      service.updateDevelopment({
        id: developmentId,
        organizationId,
        expectedVersion: 1,
        correlationId: 'corr-1',
        changes: { name: 'New name' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updateDevelopment бросает NotFoundException, если запись реально не существует (не version conflict)', async () => {
    const service = makeService({
      developmentRepository: {
        updateWithVersionCheck: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
        findByIdForOrganization: jest.fn().mockResolvedValue(null),
      },
    });

    await expect(
      service.updateDevelopment({
        id: new Types.ObjectId(),
        organizationId: new Types.ObjectId(),
        expectedVersion: 1,
        correlationId: 'corr-1',
        changes: { name: 'New name' },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateDevelopment перевыпускает PublicationRequested, если публикация сейчас published (D-03 rebuild)', async () => {
    const developmentId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const rebuildIfCurrentlyPublished = jest
      .fn()
      .mockResolvedValue({ _id: new Types.ObjectId(), status: 'publication_pending' });

    const service = makeService({
      developmentRepository: {
        updateWithVersionCheck: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      },
      publicationService: { rebuildIfCurrentlyPublished },
    });

    await service.updateDevelopment({
      id: developmentId,
      organizationId,
      expectedVersion: 1,
      correlationId: 'corr-1',
      changes: { name: 'New name' },
    });

    expect(rebuildIfCurrentlyPublished).toHaveBeenCalledTimes(1);
    expect(rebuildIfCurrentlyPublished).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'development', sourceId: developmentId, correlationId: 'corr-1' }),
      expect.anything(),
    );
  });

  it('updateDevelopment вызывает rebuildIfCurrentlyPublished безусловно, но НЕ переиздаёт событие, если публикация не published (атомарный condition-update внутри, возвращает null)', async () => {
    const rebuildIfCurrentlyPublished = jest.fn().mockResolvedValue(null);

    const service = makeService({
      developmentRepository: {
        updateWithVersionCheck: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      },
      publicationService: { rebuildIfCurrentlyPublished },
    });

    await service.updateDevelopment({
      id: new Types.ObjectId(),
      organizationId: new Types.ObjectId(),
      expectedVersion: 1,
      correlationId: 'corr-1',
      changes: { name: 'New name' },
    });

    expect(rebuildIfCurrentlyPublished).toHaveBeenCalledTimes(1);
  });

  it('updateUnitPrice публикует audit+outbox только при успешном version-check', async () => {
    const unitId = new Types.ObjectId();
    const auditAppendSpy = jest.fn().mockResolvedValue(undefined);
    const outboxPublishSpy = jest.fn().mockResolvedValue(undefined);

    const service = makeService({
      unitRepository: {
        updatePriceWithVersionCheck: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      },
      auditService: { append: auditAppendSpy },
      outboxService: { publish: outboxPublishSpy },
    });

    await service.updateUnitPrice({
      unitId,
      organizationId: new Types.ObjectId(),
      expectedVersion: 0,
      price: { amountMinorUnits: 10_000_000, currency: 'USD' },
      actorIdentityId: new Types.ObjectId(),
      actorPositionId: new Types.ObjectId(),
      correlationId: 'test-correlation-id',
    });

    expect(auditAppendSpy).toHaveBeenCalledTimes(1);
    expect(outboxPublishSpy).toHaveBeenCalledTimes(1);
    expect(outboxPublishSpy).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'UnitPriceChanged' }),
      expect.anything(),
    );
  });

  it('updateUnitPrice НЕ публикует audit+outbox при version conflict', async () => {
    const auditAppendSpy = jest.fn();
    const outboxPublishSpy = jest.fn();

    const service = makeService({
      unitRepository: {
        updatePriceWithVersionCheck: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
        findByIdForOrganization: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
      },
      auditService: { append: auditAppendSpy },
      outboxService: { publish: outboxPublishSpy },
    });

    await expect(
      service.updateUnitPrice({
        unitId: new Types.ObjectId(),
        organizationId: new Types.ObjectId(),
        expectedVersion: 0,
        price: { amountMinorUnits: 10_000_000, currency: 'USD' },
        actorIdentityId: new Types.ObjectId(),
        actorPositionId: new Types.ObjectId(),
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(auditAppendSpy).not.toHaveBeenCalled();
    expect(outboxPublishSpy).not.toHaveBeenCalled();
  });

  it('reserveUnit вызывает updateUnitStatus со status:reserved', async () => {
    const updateStatusSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });

    const service = makeService({
      unitRepository: { updateStatusWithVersionCheck: updateStatusSpy },
    });

    await service.reserveUnit({
      unitId: new Types.ObjectId(),
      organizationId: new Types.ObjectId(),
      expectedVersion: 0,
      actorIdentityId: new Types.ObjectId(),
      correlationId: 'test-correlation-id',
    });

    expect(updateStatusSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      0,
      'reserved',
      expect.anything(),
      expect.anything(),
    );
  });

  it('releaseUnit вызывает updateUnitStatus со status:available', async () => {
    const updateStatusSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });

    const service = makeService({
      unitRepository: { updateStatusWithVersionCheck: updateStatusSpy },
    });

    await service.releaseUnit({
      unitId: new Types.ObjectId(),
      organizationId: new Types.ObjectId(),
      expectedVersion: 2,
      actorIdentityId: new Types.ObjectId(),
      correlationId: 'test-correlation-id',
    });

    expect(updateStatusSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2,
      'available',
      expect.anything(),
      expect.anything(),
    );
  });
});

describe('DevelopmentsService.updateUnitStatus — матрица допустимых переходов', () => {
  /**
   * Раньше PATCH /units/:id/status позволял поставить ЛЮБОЙ статус при
   * подходящей version (напр. sold→available вручную) — портит остатки и
   * шахматку. fromStatuses теперь встроен прямо в атомарный Mongo-фильтр
   * (unit.repository.ts), так что updateStatusWithVersionCheck возвращает
   * modifiedCount:0 и для version conflict, и для запрещённого перехода —
   * сервис различает эти два случая явным чтением текущего статуса.
   */
  it('sold→available отклоняется как запрещённый переход (не version conflict)', async () => {
    const unitId = new Types.ObjectId();
    const auditAppendSpy = jest.fn();
    const outboxPublishSpy = jest.fn();

    const service = makeService({
      unitRepository: {
        updateStatusWithVersionCheck: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
        findByIdForOrganization: jest.fn().mockResolvedValue({ _id: unitId, status: 'sold', version: 3 }),
      },
      auditService: { append: auditAppendSpy },
      outboxService: { publish: outboxPublishSpy },
    });

    await expect(
      service.updateUnitStatus({
        unitId,
        organizationId: new Types.ObjectId(),
        expectedVersion: 3,
        status: 'available',
        actorIdentityId: new Types.ObjectId(),
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toMatchObject({ code: 'UNIT_INVALID_STATUS_TRANSITION' });

    expect(auditAppendSpy).not.toHaveBeenCalled();
    expect(outboxPublishSpy).not.toHaveBeenCalled();
  });

  it('sold→hidden разрешён явно матрицей', async () => {
    const unitId = new Types.ObjectId();
    const updateStatusSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });

    const service = makeService({
      unitRepository: { updateStatusWithVersionCheck: updateStatusSpy },
    });

    await service.updateUnitStatus({
      unitId,
      organizationId: new Types.ObjectId(),
      expectedVersion: 3,
      status: 'hidden',
      actorIdentityId: new Types.ObjectId(),
      correlationId: 'test-correlation-id',
    });

    expect(updateStatusSpy).toHaveBeenCalledWith(
      unitId,
      expect.anything(),
      3,
      'hidden',
      expect.arrayContaining(['sold']),
      expect.anything(),
    );
  });

  it('устаревшая version на легальном переходе даёт ConflictException, а не invalid-transition', async () => {
    const unitId = new Types.ObjectId();

    const service = makeService({
      unitRepository: {
        updateStatusWithVersionCheck: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
        findByIdForOrganization: jest.fn().mockResolvedValue({ _id: unitId, status: 'available', version: 5 }),
      },
    });

    await expect(
      service.updateUnitStatus({
        unitId,
        organizationId: new Types.ObjectId(),
        expectedVersion: 3,
        status: 'reserved',
        actorIdentityId: new Types.ObjectId(),
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reserve/release (available⇄reserved) остаются разрешены', async () => {
    const updateStatusSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const service = makeService({
      unitRepository: { updateStatusWithVersionCheck: updateStatusSpy },
    });

    await service.updateUnitStatus({
      unitId: new Types.ObjectId(),
      organizationId: new Types.ObjectId(),
      expectedVersion: 0,
      status: 'reserved',
      actorIdentityId: new Types.ObjectId(),
      correlationId: 'test-correlation-id',
    });
    await service.updateUnitStatus({
      unitId: new Types.ObjectId(),
      organizationId: new Types.ObjectId(),
      expectedVersion: 1,
      status: 'available',
      actorIdentityId: new Types.ObjectId(),
      correlationId: 'test-correlation-id',
    });

    expect(updateStatusSpy).toHaveBeenCalledTimes(2);
  });
});

describe('DevelopmentsService.publishDevelopment', () => {
  it('бросает NotFoundException, если development не найден в организации', async () => {
    const service = makeService({
      developmentRepository: { findByIdForOrganization: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      service.publishDevelopment({
        id: new Types.ObjectId(),
        organizationId: new Types.ObjectId(),
        actorIdentityId: new Types.ObjectId(),
        idempotencyKey: 'test-idempotency-key',
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('бросает ConflictException, если development уже не в статусе draft', async () => {
    const service = makeService({
      developmentRepository: {
        findByIdForOrganization: jest.fn().mockResolvedValue({ status: 'active' }),
      },
    });

    await expect(
      service.publishDevelopment({
        id: new Types.ObjectId(),
        organizationId: new Types.ObjectId(),
        actorIdentityId: new Types.ObjectId(),
        idempotencyKey: 'test-idempotency-key',
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('переводит status draft→active И вызывает PublicationService.requestPublication И записывает idempotency-record', async () => {
    const developmentId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const actorIdentityId = new Types.ObjectId();
    const updateStatusSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const requestPublicationSpy = jest.fn().mockResolvedValue({
      _id: new Types.ObjectId(),
      status: 'publication_pending',
    });
    const recordSpy = jest.fn().mockResolvedValue(undefined);

    const service = makeService({
      developmentRepository: {
        findByIdForOrganization: jest.fn().mockResolvedValue({ status: 'draft' }),
        updateStatus: updateStatusSpy,
      },
      publicationService: { requestPublication: requestPublicationSpy },
      idempotencyService: { record: recordSpy },
    });

    const result = await service.publishDevelopment({
      id: developmentId,
      organizationId,
      actorIdentityId,
      idempotencyKey: 'test-idempotency-key',
      correlationId: 'test-correlation-id',
    });

    expect(updateStatusSpy).toHaveBeenCalledWith(developmentId, organizationId, 'active', expect.anything());
    expect(requestPublicationSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'development',
        sourceId: developmentId,
        publisherScope: { type: 'organization', organizationId },
      }),
      expect.anything(),
    );
    expect(result).toEqual({ publicationId: expect.any(Types.ObjectId), status: 'publication_pending' });

    // ADR-006: запись idempotency-record ВНУТРИ той же транзакции, что
    // сама бизнес-операция — этот тест проверяет, что она реально
    // вызвана с правильными identity/operation/key, не только что метод
    // в принципе существует.
    expect(recordSpy).toHaveBeenCalledTimes(1);
    const [recordParams] = recordSpy.mock.calls[0] as [
      { identityId: typeof actorIdentityId; operation: string; key: string; responseStatus: number },
    ];
    expect(recordParams.identityId).toBe(actorIdentityId);
    expect(recordParams.operation).toBe('publishDevelopment');
    expect(recordParams.key).toBe('test-idempotency-key');
    expect(recordParams.responseStatus).toBe(202);
  });

  it('бросает ConflictException при конкурентном изменении статуса между findByIdForOrganization и updateStatus', async () => {
    const service = makeService({
      developmentRepository: {
        findByIdForOrganization: jest.fn().mockResolvedValue({ status: 'draft' }),
        updateStatus: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
      },
    });

    await expect(
      service.publishDevelopment({
        id: new Types.ObjectId(),
        organizationId: new Types.ObjectId(),
        actorIdentityId: new Types.ObjectId(),
        idempotencyKey: 'test-idempotency-key',
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
