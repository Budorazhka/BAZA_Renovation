import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
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

  async findByIdForOrganization(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
  ): Promise<UnitDocument | null> {
    return this.model.findOne({ _id: id, organizationId }).exec();
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
    const { limit, ...rest } = filter;
    return this.model.find({ buildingId, organizationId, ...rest }).sort({ _id: 1 }).limit(limit).exec();
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
