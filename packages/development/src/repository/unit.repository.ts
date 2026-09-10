import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, FilterQuery, Model, Types } from 'mongoose';
import type { MoneyAmount } from '@baza/contracts';
import { UnitDocument, UnitKind, UnitStatus } from '../schemas/unit.schema';

/**
 * Единственная точка доступа к коллекции units (ADR-002 требование 2).
 */
@Injectable()
export class UnitRepository {
  constructor(@InjectModel(UnitDocument.name) private readonly model: Model<UnitDocument>) {}

  async create(
    params: {
      buildingId: Types.ObjectId;
      floorId: Types.ObjectId;
      sectionId?: Types.ObjectId;
      organizationId: Types.ObjectId;
      number: string;
      kind: UnitKind;
      rooms?: number;
      area: number;
      areaLiving?: number;
      areaBalcony?: number;
      price: MoneyAmount;
      floorPlanId?: Types.ObjectId;
    },
    session?: ClientSession,
  ): Promise<UnitDocument> {
    const [doc] = await this.model.create(
      [{ ...params, status: 'available', priceHistory: [], version: 0 }],
      { session },
    );
    return doc!;
  }

  /**
   * `session` — чтобы прочитать юнит в снимке уже открытой транзакции, когда
   * по его `version` сразу идёт CAS (освобождение юнита при отмене и
   * истечении брони). Прочитанный вне транзакции юнит мог устареть, и CAS
   * тихо не срабатывал.
   */
  async findByIdForOrganization(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<UnitDocument | null> {
    return this.model.findOne({ _id: id, organizationId }).session(session ?? null).exec();
  }

  /**
   * Worker-side / system actor lookup без tenant-фильтра.
   */
  async findById(id: Types.ObjectId): Promise<UnitDocument | null> {
    return this.model.findById(id).exec();
  }

  /**
   * Worker-side lookup юнитов по корпусам без tenant-фильтра для сборки проекции ЖК.
   */
  async listByBuildingIds(
    buildingIds: Types.ObjectId[],
    filter: { kind?: UnitKind; status?: UnitStatus } = {},
  ): Promise<UnitDocument[]> {
    if (buildingIds.length === 0) {
      return [];
    }
    return this.model.find({ buildingId: { $in: buildingIds }, ...filter }).sort({ _id: 1 }).exec();
  }

  /**
   * Worker-side count юнитов по корпусам без tenant-фильтра.
   */
  async countByBuildingIds(
    buildingIds: Types.ObjectId[],
    filter: { kind?: UnitKind; status?: UnitStatus } = {},
  ): Promise<number> {
    if (buildingIds.length === 0) {
      return 0;
    }
    return this.model.countDocuments({ buildingId: { $in: buildingIds }, ...filter }).exec();
  }

  /**
   * organizationId — часть фильтра, не post-fetch проверка: тот же принцип,
   * что DevelopmentRepository.listForOrganization. limit обязателен (не
   * имеет собственного дефолта на этом уровне) — вычисляется в
   * ListUnitsQueryDto, единственный источник истины про дефолт/максимум.
   */
  async listForBuilding(
    buildingId: Types.ObjectId,
    organizationId: Types.ObjectId,
    filter: { kind?: UnitKind; status?: UnitStatus; limit: number },
  ): Promise<UnitDocument[]> {
    // ИСПРАВЛЕНО 10.09.2026: `{ kind: undefined, status: undefined, ...}` —
    // ключ с явным undefined всё равно попадал в Mongo-фильтр через спред
    // (в отличие от listForBuildings ниже, где kind добавляется условным
    // тернарником) и MongoDB матчил только документы, где поле буквально
    // отсутствует/undefined — у реальных юнитов status всегда строка
    // ('available' и т.д.), поэтому запрос без явного kind/status не находил
    // НИЧЕГО. Баг обнаружен E2E-тестом (07-primary-sales-journey) только
    // сейчас: раньше тест бил в неверный URL и падал 404 раньше, чем мог
    // дойти до этой проверки.
    const query: FilterQuery<UnitDocument> = { buildingId, organizationId };
    if (filter.kind !== undefined) query.kind = filter.kind;
    if (filter.status !== undefined) query.status = filter.status;
    return this.model.find(query).sort({ _id: 1 }).limit(filter.limit).exec();
  }

  /**
   * chessboard.export: выгрузка шахматки читает юниты ВСЕХ корпусов ЖК за
   * один запрос — listForBuilding здесь не подходит принципиально, он
   * требует обязательный limit (сознательно, чтобы read-эндпоинт не мог
   * отдать неограниченную страницу) и один buildingId. Здесь ограничение
   * идёт сверху: DevelopmentsService.buildChessboardExport проверяет
   * общее число юнитов ЖК до чтения и отказывает, если оно превышает
   * потолок выгрузки — иначе весь ЖК не поместился бы в один файл всё
   * равно. organizationId остаётся частью фильтра, не post-fetch
   * проверкой, как и во всех остальных методах репозитория.
   */
  async listForBuildings(
    buildingIds: Types.ObjectId[],
    organizationId: Types.ObjectId,
    filter: { kind?: UnitKind } = {},
  ): Promise<UnitDocument[]> {
    if (buildingIds.length === 0) {
      return [];
    }
    return this.model.find({ buildingId: { $in: buildingIds }, organizationId, ...filter }).exec();
  }

  async countForBuildings(
    buildingIds: Types.ObjectId[],
    organizationId: Types.ObjectId,
    filter: { kind?: UnitKind } = {},
  ): Promise<number> {
    if (buildingIds.length === 0) {
      return 0;
    }
    return this.model.countDocuments({ buildingId: { $in: buildingIds }, organizationId, ...filter }).exec();
  }

  /**
   * updateUnitPrice (domain-model.md Модуль 4): пишет новую цену И
   * append'ит priceHistory-запись атомарно в одном updateOne — не два
   * отдельных запроса (иначе окно между "цена уже новая" и "history ещё
   * не записана" при сбое между ними). Optimistic concurrency — фильтр
   * на expectedVersion, modifiedCount:0 = VERSION_CONFLICT (409).
   */
  async updatePriceWithVersionCheck(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
    expectedVersion: number,
    params: { price: MoneyAmount; changedBy: Types.ObjectId },
    session: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne(
        { _id: id, organizationId, version: expectedVersion },
        {
          $set: { price: params.price },
          $push: { priceHistory: { price: params.price, changedAt: new Date(), changedBy: params.changedBy } },
          $inc: { version: 1 },
        },
        { session },
      )
      .exec();
    return { modifiedCount: result.modifiedCount };
  }

  async createMany(
    units: Array<{
      buildingId: Types.ObjectId;
      floorId: Types.ObjectId;
      sectionId?: Types.ObjectId;
      organizationId: Types.ObjectId;
      number: string;
      kind: UnitKind;
      rooms?: number;
      area: number;
      areaLiving?: number;
      areaBalcony?: number;
      price: MoneyAmount;
      floorPlanId?: Types.ObjectId;
    }>,
    session?: ClientSession,
  ): Promise<UnitDocument[]> {
    if (units.length === 0) {
      return [];
    }
    const docs = units.map((u) => ({
      ...u,
      status: 'available' as UnitStatus,
      priceHistory: [],
      version: 0,
    }));
    const created = await this.model.create(docs, { session, ordered: true });
    return created as UnitDocument[];
  }

  async listByIdsForOrganization(
    ids: Types.ObjectId[],
    organizationId: Types.ObjectId,
  ): Promise<UnitDocument[]> {
    if (ids.length === 0) {
      return [];
    }
    return this.model.find({ _id: { $in: ids }, organizationId }).exec();
  }

  async listByFloorIds(
    floorIds: Types.ObjectId[],
    organizationId: Types.ObjectId,
  ): Promise<UnitDocument[]> {
    if (floorIds.length === 0) {
      return [];
    }
    return this.model.find({ floorId: { $in: floorIds }, organizationId }).exec();
  }

  /**
   * fromStatuses — допустимые исходные статусы для этого перехода (матрица
   * в DevelopmentsService), включены в сам Mongo-фильтр атомарно вместе с
   * version: если статус документа успел смениться между чтением и этим
   * updateOne (гонка с параллельным запросом), запись не пройдёт так же,
   * как и при version conflict — нет отдельного окна read-then-write.
   */
  async updateStatusWithVersionCheck(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
    expectedVersion: number,
    status: UnitStatus,
    fromStatuses: readonly UnitStatus[],
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne(
        { _id: id, organizationId, version: expectedVersion, status: { $in: fromStatuses } },
        { $set: { status }, $inc: { version: 1 } },
        { session },
      )
      .exec();
    return { modifiedCount: result.modifiedCount };
  }
}
