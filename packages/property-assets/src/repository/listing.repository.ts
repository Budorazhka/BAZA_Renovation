import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { ListingDealType, ListingDocument } from '../schemas/listing.schema';
import type { ListingStatus } from '../schemas/listing.schema';
import type { OwnerScope } from '@baza/tenant-scope';
import type { Currency } from '@baza/contracts';

export interface CreateListingInput {
  propertyAssetId: Types.ObjectId;
  publisherScope: OwnerScope;
  dealType: ListingDealType;
  price: { amountMinorUnits: number; currency: Currency };
  status: ListingStatus;
  version: number;
}

/**
 * Единственная точка доступа к коллекции listings (ADR-002 требование 2).
 * Используется API-процессом (tenant-scoped методы, publish/unpublish CAS)
 * и worker-процессом (findById — тот же принцип, что
 * @baza/development::DevelopmentRepository.findById).
 */
@Injectable()
export class ListingRepository {
  constructor(@InjectModel(ListingDocument.name) private readonly model: Model<ListingDocument>) {}

  async create(params: CreateListingInput, session?: ClientSession) {
    const [doc] = await this.model.create([params], { session });
    return doc!;
  }

  async findByIdForOrganization(id: Types.ObjectId, organizationId: Types.ObjectId) {
    return this.model
      .findOne({ _id: id, 'publisherScope.type': 'organization', 'publisherScope.organizationId': organizationId })
      .exec();
  }

  async listForAsset(assetId: Types.ObjectId, organizationId: Types.ObjectId) {
    return this.model
      .find({ propertyAssetId: assetId, 'publisherScope.type': 'organization', 'publisherScope.organizationId': organizationId })
      .sort({ _id: 1 })
      .exec();
  }

  /**
   * Owner/realtor marketplace publishing wizard: зеркало
   * findByIdForOrganization/listForAsset/activate/confirmActuality/
   * findActiveForDealType/markPublishing для второй ветки publisherScope-
   * union (`{type:'marketplace_account', identityId}`). Не рефакторено в
   * один generic-метод, принимающий OwnerScope — существующие organization-
   * методы уже покрыты большим количеством unit/integration-тестов
   * (PROP-001/MKT-002/DEDUPE-001/ACT-001), рефакторинг сигнатур создал бы
   * риск регрессии непропорционально пользе; explicit-дублирование по паре
   * методов — тот же выбор, что уже сделан для PropertyAssetRepository.
   */
  async findByIdForIdentity(id: Types.ObjectId, identityId: Types.ObjectId) {
    return this.model
      .findOne({ _id: id, 'publisherScope.type': 'marketplace_account', 'publisherScope.identityId': identityId })
      .exec();
  }

  async listForAssetIdentity(assetId: Types.ObjectId, identityId: Types.ObjectId) {
    return this.model
      .find({ propertyAssetId: assetId, 'publisherScope.type': 'marketplace_account', 'publisherScope.identityId': identityId })
      .sort({ _id: 1 })
      .exec();
  }

  /**
   * ACT-001: activate теперь также проставляет `lastConfirmedAt: now` —
   * первая активация ЯВЛЯЕТСЯ первым подтверждением актуальности
   * (PROP-001 объявил поле на схеме, но не заполнял его ни одним
   * сервисным методом — actuality-часы для нового listing тикали от
   * несуществующей точки отсчёта до этой задачи).
   */
  async activate(id: Types.ObjectId, organizationId: Types.ObjectId, now: Date, session?: ClientSession) {
    return this.model
      .findOneAndUpdate(
        { _id: id, 'publisherScope.type': 'organization', 'publisherScope.organizationId': organizationId, status: 'draft' },
        { $set: { status: 'active', lastConfirmedAt: now }, $inc: { version: 1 } },
        { new: true, session },
      )
      .exec();
  }

  async activateForIdentity(id: Types.ObjectId, identityId: Types.ObjectId, now: Date, session?: ClientSession) {
    return this.model
      .findOneAndUpdate(
        { _id: id, 'publisherScope.type': 'marketplace_account', 'publisherScope.identityId': identityId, status: 'draft' },
        { $set: { status: 'active', lastConfirmedAt: now }, $inc: { version: 1 } },
        { new: true, session },
      )
      .exec();
  }

  /**
   * ACT-001: владелец подтверждает актуальность — сбрасывает
   * actuality-часы (`lastConfirmedAt: now`). CAS допускает ОБА исходных
   * статуса: 'active' (обычный рефреш часов, status не меняется) И
   * 'expired' (owner decision xlsx #57: "снимается с публикации и
   * ТРЕБУЕТСЯ ПОДТВЕРДИТЬ" — без этого перехода просроченный listing
   * физически не имел пути обратно в active: activate() работает только
   * из draft, единственной "командой подтверждения" была именно эта, но
   * она изначально требовала status уже 'active' — expired listing был
   * бы заперт навсегда, вопреки прямому смыслу owner decision). Publish
   * после реактивации — отдельный явный шаг (confirmActuality сама не
   * публикует, тот же принцип, что unpublish/publish разделены).
   * expectedVersion — тот же optimistic-concurrency паттерн, что
   * markPublishing (D-07 post-fix прецедент: без version в фильтре
   * конкурентный confirm/publish мог бы гоняться незамеченно).
   */
  async confirmActuality(id: Types.ObjectId, organizationId: Types.ObjectId, expectedVersion: number, now: Date, session?: ClientSession) {
    const result = await this.model
      .updateOne(
        {
          _id: id,
          'publisherScope.type': 'organization',
          'publisherScope.organizationId': organizationId,
          status: { $in: ['active', 'expired'] },
          version: expectedVersion,
        },
        { $set: { status: 'active', lastConfirmedAt: now }, $inc: { version: 1 } },
        { session },
      )
      .exec();
    return { modifiedCount: result.modifiedCount };
  }

  async confirmActualityForIdentity(id: Types.ObjectId, identityId: Types.ObjectId, expectedVersion: number, now: Date, session?: ClientSession) {
    const result = await this.model
      .updateOne(
        {
          _id: id,
          'publisherScope.type': 'marketplace_account',
          'publisherScope.identityId': identityId,
          status: { $in: ['active', 'expired'] },
          version: expectedVersion,
        },
        { $set: { status: 'active', lastConfirmedAt: now }, $inc: { version: 1 } },
        { session },
      )
      .exec();
    return { modifiedCount: result.modifiedCount };
  }

  /**
   * ACT-001 (owner decision xlsx #57: "снимается с публикации и требуется
   * подтвердить") — CAS status:'active'→'expired'. Не тенант-scoped
   * фильтр — вызывается фоновой batch-командой (не HTTP-запросом от
   * конкретной организации), тот же принцип, что worker-side findById
   * (system actor, ADR-002).
   */
  async markExpired(id: Types.ObjectId, expectedVersion: number, session?: ClientSession) {
    const result = await this.model
      .updateOne({ _id: id, status: 'active', version: expectedVersion }, { $set: { status: 'expired' }, $inc: { version: 1 } }, { session })
      .exec();
    return { modifiedCount: result.modifiedCount };
  }

  /**
   * ACT-001 batch-скан: все active listings с `lastConfirmedAt` старше
   * cutoff (overdue-порог для их категории) — вызывающий код
   * (ActualityService) вычисляет cutoff по каждой категории отдельно
   * (rent/secondary/other имеют разные пороги, mongodb query не может
   * дешёво выразить "разный порог в зависимости от вычисляемой на лету
   * категории" одним запросом без join к PropertyAsset). Метод принимает
   * уже вычисленный cutoff — repository не знает про actuality.util.ts
   * категории/пороги (модульная граница: чистая бизнес-логика в utils,
   * repository только исполняет уже готовый Mongo-фильтр).
   */
  async findActiveListingsConfirmedBefore(cutoff: Date, params: { cursor?: Types.ObjectId; limit: number }) {
    const filter: Record<string, unknown> = { status: 'active', lastConfirmedAt: { $lt: cutoff } };
    if (params.cursor) {
      filter._id = { $gt: params.cursor };
    }
    return this.model.find(filter).sort({ _id: 1 }).limit(params.limit).exec();
  }

  async findActiveForDealType(assetId: Types.ObjectId, organizationId: Types.ObjectId, dealType: ListingDealType) {
    return this.model
      .findOne({ propertyAssetId: assetId, dealType, status: 'active', 'publisherScope.type': 'organization', 'publisherScope.organizationId': organizationId })
      .exec();
  }

  async findActiveForDealTypeIdentity(assetId: Types.ObjectId, identityId: Types.ObjectId, dealType: ListingDealType) {
    return this.model
      .findOne({ propertyAssetId: assetId, dealType, status: 'active', 'publisherScope.type': 'marketplace_account', 'publisherScope.identityId': identityId })
      .exec();
  }

  /**
   * Publish-предусловие (MKT-002): CAS фильтр включает `status: 'active'`
   * И `version: expectedVersion` — не только status, потому что Listing.status
   * НЕ меняется этой операцией (в отличие от DevelopmentRepository.updateStatus,
   * которое транзитит draft→active). Без version в фильтре два конкурентных
   * publish, оба читающих status:'active' ДО транзакции, оба проходили бы
   * этот CAS даже после WriteConflict-retry на том же документе — retry
   * увидел бы тот же неизменный 'active' статус повторно, и оба вызывающих
   * кода дошли бы до записи idempotency-record с одним ключом (unhandled
   * duplicate key error, найдено реальным integration-тестом на
   * Promise.all-гонке). version — часть фильтра, а не post-hoc сравнение:
   * ретрай транзакции видит УЖЕ инкрементированную version конкурента,
   * modifiedCount:0 — тот же паттерн, что LeadRepository.changeStageWithVersionCheck
   * (D-07 post-fix). modifiedCount:0 не различает "version устарела"/"уже
   * не active"/"чужая организация"/"не существует" — вызывающий сервис
   * обязан отдельно прочитать текущее состояние, чтобы выбрать между
   * NotFoundException/ConflictException/checkOwnReplay.
   */
  async markPublishing(id: Types.ObjectId, organizationId: Types.ObjectId, expectedVersion: number, session: ClientSession) {
    return this.model
      .updateOne(
        {
          _id: id,
          'publisherScope.type': 'organization',
          'publisherScope.organizationId': organizationId,
          status: 'active',
          version: expectedVersion,
        },
        { $inc: { version: 1 } },
        { session },
      )
      .exec();
  }

  async markPublishingForIdentity(id: Types.ObjectId, identityId: Types.ObjectId, expectedVersion: number, session: ClientSession) {
    return this.model
      .updateOne(
        {
          _id: id,
          'publisherScope.type': 'marketplace_account',
          'publisherScope.identityId': identityId,
          status: 'active',
          version: expectedVersion,
        },
        { $inc: { version: 1 } },
        { session },
      )
      .exec();
  }

  /**
   * Правка цены объявления владельцем-физлицом.
   *
   * CAS по `version` тот же, что у markPublishingForIdentity: два человека,
   * открывшие форму редактирования одновременно, не должны затирать правки друг
   * друга молча — второй получит 0 изменённых документов и явный конфликт.
   *
   * `status` в фильтре не ограничен: править можно и черновик, и активное, и
   * опубликованное объявление. Запрещённые к правке поля (тип сделки, тип
   * объекта, адрес) сюда не попадают вообще — не потому что фильтр их не
   * пропустит, а потому что их нет в сигнатуре.
   *
   * `updatedAt` выставляет Mongoose по timestamps схемы: дата обновления
   * меняется, дата публикации остаётся прежней.
   */
  async updatePriceForIdentity(
    id: Types.ObjectId,
    identityId: Types.ObjectId,
    expectedVersion: number,
    price: { amountMinorUnits: number; currency: Currency },
    session?: ClientSession,
  ) {
    return this.model
      .updateOne(
        {
          _id: id,
          'publisherScope.type': 'marketplace_account',
          'publisherScope.identityId': identityId,
          version: expectedVersion,
        },
        { $set: { price }, $inc: { version: 1 } },
        { session },
      )
      .exec();
  }

  /**
   * Worker-side: без tenant-фильтра — worker резолвит Listing по sourceId
   * из outbox-событие payload (тот же принцип, что DevelopmentRepository.findById).
   */
  async findById(id: Types.ObjectId) {
    return this.model.findOne({ _id: id }).exec();
  }
}
