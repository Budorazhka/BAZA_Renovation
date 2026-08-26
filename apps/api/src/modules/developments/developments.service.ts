import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import type { MoneyAmount } from '@baza/contracts';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { runInTransaction } from '../../shared/transactions/run-in-transaction';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { PublicationService } from '../publication/publication.service';
import { IdempotencyService } from '../../shared/idempotency/idempotency.service';
import { DevelopmentRepository } from '@baza/development';
import type { DevelopmentDocument, DevelopmentLocation, DevelopmentContact } from '@baza/development';
import { BuildingRepository } from './repository/building.repository';
import { SectionRepository } from './repository/section.repository';
import { FloorRepository } from './repository/floor.repository';
import { FloorPlanRepository } from './repository/floor-plan.repository';
import { UnitRepository } from './repository/unit.repository';
import type { BuildingDocument, GeoPolygon } from './schemas/building.schema';
import type { FloorDocument } from './schemas/floor.schema';
import type { FloorPlanDocument, GeoPolygon2D } from './schemas/floor-plan.schema';
import type { UnitDocument, UnitKind, UnitStatus } from './schemas/unit.schema';

/**
 * Явная матрица допустимых переходов статуса Unit (source → allowed targets)
 * — PATCH /units/:id/status без неё позволял бы поставить любой статус при
 * подходящей version (напр. sold→available вручную), что портит остатки/
 * шахматку. hidden — модерационный статус вне продажного цикла, переход в/
 * из него не ограничивается здесь намеренно.
 */
const UNIT_STATUS_TRANSITIONS: Record<UnitStatus, readonly UnitStatus[]> = {
  available: ['reserved', 'sold', 'hidden'],
  reserved: ['available', 'sold', 'hidden'],
  sold: ['hidden'],
  hidden: ['available', 'reserved', 'sold'],
};

/**
 * Обратный индекс (target → allowed sources) — нужен для атомарного Mongo-
 * фильтра в updateStatusWithVersionCheck: сравнение по source один раз при
 * старте процесса дешевле, чем инвертировать матрицу на каждый запрос.
 */
const UNIT_STATUS_ALLOWED_SOURCES: Record<UnitStatus, readonly UnitStatus[]> = (() => {
  const result = {} as Record<UnitStatus, UnitStatus[]>;
  for (const status of Object.keys(UNIT_STATUS_TRANSITIONS) as UnitStatus[]) result[status] = [];
  for (const [source, targets] of Object.entries(UNIT_STATUS_TRANSITIONS) as [UnitStatus, readonly UnitStatus[]][]) {
    for (const target of targets) result[target].push(source);
  }
  return result;
})();

/**
 * Транзакционный command-слой Developments/Buildings/Sections/Floors/Units/
 * FloorPlans (D-01, domain-model.md Модуль 4). Каждая команда, меняющая
 * более одного документа ИЛИ требующая audit+outbox (critical actions),
 * выполняется в единой MongoDB-транзакции (ADR-006) — тот же паттерн, что
 * уже применён в OrganizationsService/MediaService.
 *
 * Tenant isolation (ADR-002 требование 1): каждая операция над дочерней
 * сущностью (Building→Development, Floor→Building, Unit→Floor/Building)
 * проверяет ФАКТИЧЕСКУЮ organizationId родителя из БД, не доверяет id из
 * URL/body напрямую — тот же принцип, что assignOccupant/confirmUpload
 * (единый NOT_FOUND для "не существует" и "чужая организация").
 */
@Injectable()
export class DevelopmentsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly developmentRepository: DevelopmentRepository,
    private readonly buildingRepository: BuildingRepository,
    private readonly sectionRepository: SectionRepository,
    private readonly floorRepository: FloorRepository,
    private readonly floorPlanRepository: FloorPlanRepository,
    private readonly unitRepository: UnitRepository,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
    private readonly publicationService: PublicationService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  async createDevelopment(params: {
    organizationId: Types.ObjectId;
    name: string;
    location: DevelopmentLocation;
    contact: DevelopmentContact;
    classType?: string;
    startDate?: Date;
    completionDate?: Date;
    description?: string;
  }): Promise<DevelopmentDocument> {
    return this.developmentRepository.create(params);
  }

  async getDevelopmentForOrganization(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
  ): Promise<DevelopmentDocument> {
    const development = await this.developmentRepository.findByIdForOrganization(id, organizationId);
    if (!development) {
      throw new NotFoundException('Development not found');
    }
    return development;
  }

  async listDevelopmentsForOrganization(
    organizationId: Types.ObjectId,
    params: { cursor?: Types.ObjectId; limit: number },
  ): Promise<DevelopmentDocument[]> {
    return this.developmentRepository.listForOrganization(organizationId, params);
  }

  /**
   * conventions.md разд.5 optimistic concurrency: expectedVersion не
   * совпал с текущим → VERSION_CONFLICT (ConflictException, 409) — не
   * NotFoundException, запись реально существует, просто клиент работал
   * со устаревшей версией (D-01 test requirement: "optimistic conflict").
   *
   * D-03 rebuild (ИЗМЕНЕНО 26.08.2026, owner decision + second-opinion
   * fix): если MarketplacePublication для этого Development сейчас в
   * status:published, update транзакционно перевыпускает
   * PublicationRequested — публичная витрина не должна оставаться со
   * старыми данными до следующего явного publish. Триггер — ТЕКУЩИЙ
   * СТАТУС ПУБЛИКАЦИИ, не canonical Development.status: если публикация
   * unpublished/build_failed/никогда не существовала, rebuild НЕ
   * срабатывает — update не должен молча обходить явный admin unpublish
   * своим следующим шагом. rebuildIfCurrentlyPublished — атомарный
   * condition-update (findOneAndUpdate с status:'published' в фильтре),
   * НЕ read-then-write — первая версия (isCurrentlyPublished read +
   * отдельный requestPublication write) несла TOCTOU-гонку с конкурентным
   * admin unpublish, найдено second-opinion (Gemini) ревью, исправлено
   * тем же днём.
   */
  async updateDevelopment(params: {
    id: Types.ObjectId;
    organizationId: Types.ObjectId;
    expectedVersion: number;
    correlationId: string;
    changes: Partial<{
      name: string;
      location: DevelopmentLocation;
      contact: DevelopmentContact;
      classType: string;
      startDate: Date;
      completionDate: Date;
      description: string;
    }>;
  }): Promise<void> {
    await runInTransaction(this.connection, async (session) => {
      const { modifiedCount } = await this.developmentRepository.updateWithVersionCheck(
        params.id,
        params.organizationId,
        params.expectedVersion,
        params.changes,
        session,
      );
      if (modifiedCount === 0) {
        const stillExists = await this.developmentRepository.findByIdForOrganization(
          params.id,
          params.organizationId,
        );
        if (!stillExists) {
          throw new NotFoundException('Development not found');
        }
        throw new ConflictException('Development was modified by another request — refresh and retry');
      }

      await this.publicationService.rebuildIfCurrentlyPublished(
        {
          sourceType: 'development',
          sourceId: params.id,
          publisherScope: { type: 'organization', organizationId: params.organizationId },
          correlationId: params.correlationId,
        },
        session,
      );
    });
  }

  /**
   * ADR-005/ADR-006: транзакционно (1) переводит Development draft→active
   * и (2) вызывает PublicationService.requestPublication (upsert
   * MarketplacePublication:publication_pending + outbox PublicationRequested)
   * — оба шага в ОДНОЙ MongoDB-транзакции. Только draft может быть
   * опубликован (archived/уже active — конфликт, не тихий no-op).
   *
   * Idempotency-Key (ADR-006, ИЗМЕНЕНО 26.08.2026 — механизм реализован,
   * honest gap закрыт): replay-проверка (IdempotencyService.checkReplay)
   * выполняется ВЫЗЫВАЮЩИМ кодом (DevelopmentsController) ДО вызова этого
   * метода — контроллер решает, возвращать ли сохранённый ответ, не
   * начиная транзакцию заново. Запись результата — ВНУТРИ этой же
   * транзакции, последним шагом, после успешного requestPublication (ADR-006:
   * "запись создаётся в той же транзакции, что и сама бизнес-операция").
   */
  async publishDevelopment(params: {
    id: Types.ObjectId;
    organizationId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<{ publicationId: Types.ObjectId; status: string }> {
    return runInTransaction(this.connection, async (session) => {
      const development = await this.developmentRepository.findByIdForOrganization(
        params.id,
        params.organizationId,
      );
      if (!development) {
        throw new NotFoundException('Development not found');
      }
      if (development.status !== 'draft') {
        throw new ConflictException(
          `Development status is '${development.status}', only 'draft' can be published`,
        );
      }

      const { modifiedCount } = await this.developmentRepository.updateStatus(
        params.id,
        params.organizationId,
        'active',
        session,
      );
      if (modifiedCount === 0) {
        // Конкурентный publish/update изменил статус между findByIdForOrganization
        // выше и этим updateOne — реальная гонка, не гипотетическая (та же
        // категория, что уже проверялась для confirmUpload через Promise.all
        // в integration-тесте).
        throw new ConflictException('Development was modified by another request — refresh and retry');
      }

      const publication = await this.publicationService.requestPublication(
        {
          sourceType: 'development',
          sourceId: params.id,
          publisherScope: { type: 'organization', organizationId: params.organizationId },
          correlationId: params.correlationId,
        },
        session,
      );

      const result = { publicationId: publication._id, status: publication.status };

      await this.idempotencyService.record(
        {
          identityId: params.actorIdentityId,
          operation: 'publishDevelopment',
          key: params.idempotencyKey,
          requestBody: { developmentId: params.id.toString() },
          responseStatus: 202,
          responseBody: {
            id: result.publicationId.toString(),
            sourceType: 'development',
            sourceId: params.id.toString(),
            status: result.status,
          },
        },
        session,
      );

      return result;
    });
  }

  async createBuilding(params: {
    developmentId: Types.ObjectId;
    organizationId: Types.ObjectId;
    name: string;
    floorsCount: number;
    startDate?: Date;
    completionDate?: Date;
    polygon?: GeoPolygon;
  }): Promise<BuildingDocument> {
    const development = await this.developmentRepository.findByIdForOrganization(
      params.developmentId,
      params.organizationId,
    );
    if (!development) {
      throw new NotFoundException('Development not found');
    }

    return this.buildingRepository.create({
      developmentId: params.developmentId,
      organizationId: params.organizationId,
      name: params.name,
      floorsCount: params.floorsCount,
      startDate: params.startDate,
      completionDate: params.completionDate,
      polygon: params.polygon,
    });
  }

  /**
   * НЕ в узкой OpenAPI-спеке (v1-first-vertical-slice.yaml не специфицирует
   * Section create endpoint — опциональна по domain-model.md, "vertical
   * slice до publish не требует секций явно"). Repository (`SectionRepository`)
   * уже был готов с D-01, service-метод/HTTP-endpoint не были подключены —
   * честный пробел из d01-development-aggregate.md "Не покрыто", закрывается
   * здесь.
   */
  async createSection(params: {
    buildingId: Types.ObjectId;
    organizationId: Types.ObjectId;
    name: string;
  }) {
    const building = await this.buildingRepository.findByIdForOrganization(
      params.buildingId,
      params.organizationId,
    );
    if (!building) {
      throw new NotFoundException('Building not found');
    }

    return this.sectionRepository.create({
      buildingId: params.buildingId,
      organizationId: params.organizationId,
      name: params.name,
    });
  }

  async createFloor(params: {
    buildingId: Types.ObjectId;
    sectionId?: Types.ObjectId;
    organizationId: Types.ObjectId;
    floorNumber: number;
    floorType?: string;
  }): Promise<FloorDocument> {
    const building = await this.buildingRepository.findByIdForOrganization(
      params.buildingId,
      params.organizationId,
    );
    if (!building) {
      throw new NotFoundException('Building not found');
    }

    if (params.sectionId) {
      const section = await this.sectionRepository.findByIdForOrganization(
        params.sectionId,
        params.organizationId,
      );
      // Section, если передана, обязана принадлежать ТОМУ ЖЕ building —
      // не просто существовать в организации (иначе можно было бы
      // прикрепить этаж к секции чужого корпуса той же организации).
      if (!section || !section.buildingId.equals(params.buildingId)) {
        throw new NotFoundException('Section not found');
      }
    }

    return this.floorRepository.create({
      buildingId: params.buildingId,
      sectionId: params.sectionId,
      organizationId: params.organizationId,
      floorNumber: params.floorNumber,
      floorType: params.floorType,
    });
  }

  /**
   * НЕ в узкой OpenAPI-спеке — repository/service были готовы с D-01
   * (d01-development-aggregate.md "Не покрыто": "HTTP endpoint не
   * специфицирован узкой OpenAPI-спекой"), не подключён к HTTP до этого
   * прохода.
   */
  async createFloorPlan(params: {
    buildingId: Types.ObjectId;
    organizationId: Types.ObjectId;
    name: string;
    rooms: number;
    area: number;
    isEuro?: boolean;
    imageAssetId?: Types.ObjectId;
    tags?: string[];
    polygon?: GeoPolygon2D;
  }): Promise<FloorPlanDocument> {
    const building = await this.buildingRepository.findByIdForOrganization(
      params.buildingId,
      params.organizationId,
    );
    if (!building) {
      throw new NotFoundException('Building not found');
    }

    return this.floorPlanRepository.create(params);
  }

  async getUnitForOrganization(id: Types.ObjectId, organizationId: Types.ObjectId): Promise<UnitDocument> {
    const unit = await this.unitRepository.findByIdForOrganization(id, organizationId);
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }
    return unit;
  }

  async createUnit(params: {
    buildingId: Types.ObjectId;
    floorId: Types.ObjectId;
    organizationId: Types.ObjectId;
    number: string;
    kind: UnitKind;
    rooms?: number;
    area: number;
    areaLiving?: number;
    areaBalcony?: number;
    price: MoneyAmount;
    floorPlanId?: Types.ObjectId;
  }): Promise<UnitDocument> {
    const floor = await this.floorRepository.findByIdForOrganization(params.floorId, params.organizationId);
    // floor.buildingId должен совпадать с переданным buildingId — тот же
    // принцип, что Section↔Floor выше: floorId сам по себе принадлежит
    // организации, но может относиться к ДРУГОМУ building той же организации.
    if (!floor || !floor.buildingId.equals(params.buildingId)) {
      throw new NotFoundException('Floor not found');
    }

    if (params.floorPlanId) {
      const floorPlan = await this.floorPlanRepository.findByIdForOrganization(
        params.floorPlanId,
        params.organizationId,
      );
      if (!floorPlan || !floorPlan.buildingId.equals(params.buildingId)) {
        throw new NotFoundException('FloorPlan not found');
      }
    }

    return this.unitRepository.create({
      buildingId: params.buildingId,
      floorId: params.floorId,
      // sectionId серверный, из уже проверенного floor — клиент его не
      // передаёт и не может подделать (CreateUnitDto не содержит sectionId).
      sectionId: floor.sectionId,
      organizationId: params.organizationId,
      number: params.number,
      kind: params.kind,
      rooms: params.rooms,
      area: params.area,
      areaLiving: params.areaLiving,
      areaBalcony: params.areaBalcony,
      price: params.price,
      floorPlanId: params.floorPlanId,
    });
  }

  /**
   * updateUnitPrice (domain-model.md Модуль 4, permission-matrix.md
   * `unit.price.update.project` — critical action, permission-matrix.md
   * раздел 4 требует audit). Транзакционно: price+priceHistory (уже
   * атомарны в одном updateOne на уровне repository) + audit + outbox
   * UnitPriceChanged — всё в одной MongoDB-транзакции.
   */
  async updateUnitPrice(params: {
    unitId: Types.ObjectId;
    organizationId: Types.ObjectId;
    expectedVersion: number;
    price: MoneyAmount;
    actorIdentityId: Types.ObjectId;
    actorPositionId: Types.ObjectId;
    correlationId: string;
  }): Promise<void> {
    return runInTransaction(this.connection, async (session) => {
      const { modifiedCount } = await this.unitRepository.updatePriceWithVersionCheck(
        params.unitId,
        params.organizationId,
        params.expectedVersion,
        { price: params.price, changedBy: params.actorPositionId },
        session,
      );

      if (modifiedCount === 0) {
        const stillExists = await this.unitRepository.findByIdForOrganization(
          params.unitId,
          params.organizationId,
        );
        if (!stillExists) {
          throw new NotFoundException('Unit not found');
        }
        throw new ConflictException('Unit was modified by another request — refresh and retry');
      }

      await this.auditService.append(
        {
          actor: { type: 'identity', id: params.actorIdentityId },
          action: 'unit.price.update',
          resource: 'unit',
          resourceId: params.unitId,
          after: {
            amountMinorUnits: params.price.amountMinorUnits,
            currency: params.price.currency,
          },
          correlationId: params.correlationId,
        },
        session,
      );

      await this.outboxService.publish(
        {
          eventType: 'UnitPriceChanged',
          aggregateType: 'unit',
          aggregateId: params.unitId,
          payload: {
            amountMinorUnits: params.price.amountMinorUnits,
            currency: params.price.currency,
          },
          // Каждое изменение цены — отдельное событие, не "одно событие на
          // юнит" — явный ключ с версией (после инкремента) гарантирует,
          // что повторные изменения цены того же юнита не схлопываются
          // друг с другом под одним default-ключом.
          deduplicationKey: `unit:${params.unitId.toString()}:UnitPriceChanged:v${params.expectedVersion + 1}`,
        },
        session,
      );
    });
  }

  /**
   * updateUnitStatus (permission-matrix.md `unit.status.update.project`).
   * reserveUnit/releaseUnit (domain-model.md commands) — тонкие обёртки
   * поверх этого метода с фиксированным целевым статусом, не отдельная
   * реализация: reserve = available→reserved, release = reserved→available,
   * оба — частные случаи "сменить статус с audit+outbox".
   */
  async updateUnitStatus(params: {
    unitId: Types.ObjectId;
    organizationId: Types.ObjectId;
    expectedVersion: number;
    status: UnitStatus;
    actorIdentityId: Types.ObjectId;
    correlationId: string;
  }): Promise<void> {
    return runInTransaction(this.connection, async (session) => {
      const allowedFrom = UNIT_STATUS_ALLOWED_SOURCES[params.status];

      const { modifiedCount } = await this.unitRepository.updateStatusWithVersionCheck(
        params.unitId,
        params.organizationId,
        params.expectedVersion,
        params.status,
        allowedFrom,
        session,
      );

      if (modifiedCount === 0) {
        const current = await this.unitRepository.findByIdForOrganization(
          params.unitId,
          params.organizationId,
        );
        if (!current) {
          throw new NotFoundException('Unit not found');
        }
        // matrix.md: различаем "версия устарела" (ретрай после refresh
        // валиден) от "переход запрещён" (ретрай с той же version не
        // поможет — статус в принципе не может уйти current→target).
        if (!UNIT_STATUS_TRANSITIONS[current.status].includes(params.status)) {
          throw new AppException(
            ErrorCode.UNIT_INVALID_STATUS_TRANSITION,
            `Cannot transition unit status from "${current.status}" to "${params.status}"`,
            { from: current.status, to: params.status },
          );
        }
        throw new ConflictException('Unit was modified by another request — refresh and retry');
      }

      await this.auditService.append(
        {
          actor: { type: 'identity', id: params.actorIdentityId },
          action: 'unit.status.update',
          resource: 'unit',
          resourceId: params.unitId,
          after: { status: params.status },
          correlationId: params.correlationId,
        },
        session,
      );

      await this.outboxService.publish(
        {
          eventType: 'UnitStatusChanged',
          aggregateType: 'unit',
          aggregateId: params.unitId,
          payload: { status: params.status },
          deduplicationKey: `unit:${params.unitId.toString()}:UnitStatusChanged:v${params.expectedVersion + 1}`,
        },
        session,
      );
    });
  }

  async reserveUnit(params: {
    unitId: Types.ObjectId;
    organizationId: Types.ObjectId;
    expectedVersion: number;
    actorIdentityId: Types.ObjectId;
    correlationId: string;
  }): Promise<void> {
    return this.updateUnitStatus({ ...params, status: 'reserved' });
  }

  async releaseUnit(params: {
    unitId: Types.ObjectId;
    organizationId: Types.ObjectId;
    expectedVersion: number;
    actorIdentityId: Types.ObjectId;
    correlationId: string;
  }): Promise<void> {
    return this.updateUnitStatus({ ...params, status: 'available' });
  }
}
