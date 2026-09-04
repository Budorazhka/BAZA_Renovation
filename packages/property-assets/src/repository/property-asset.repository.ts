import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { PropertyAssetDocument } from '../schemas/property-asset.schema';
import type { OwnerScope } from '@baza/tenant-scope';
import type { CommercialSubtype, PropertyType } from '../schemas/property-asset.schema';

export interface CreatePropertyAssetInput {
  publisherScope: OwnerScope;
  propertyType: PropertyType;
  commercialSubtype?: CommercialSubtype;
  location: PropertyAssetDocument['location'];
  characteristics: PropertyAssetDocument['characteristics'];
  representativePhone: string;
  version: number;
}

/**
 * Единственная точка доступа к коллекции property_assets (ADR-002
 * требование 2). Используется API-процессом (tenant-scoped методы) и
 * worker-процессом (findById — без tenant-фильтра, worker читает по
 * sourceId из outbox-события payload, тот же принцип, что
 * @baza/development::DevelopmentRepository.findById).
 */
@Injectable()
export class PropertyAssetRepository {
  constructor(@InjectModel(PropertyAssetDocument.name) private readonly model: Model<PropertyAssetDocument>) {}

  async create(params: CreatePropertyAssetInput, session?: ClientSession) {
    const [doc] = await this.model.create([params], { session });
    return doc!;
  }

  async findByIdForOrganization(id: Types.ObjectId, organizationId: Types.ObjectId) {
    return this.model
      .findOne({ _id: id, 'publisherScope.type': 'organization', 'publisherScope.organizationId': organizationId })
      .exec();
  }

  async listForOrganization(organizationId: Types.ObjectId) {
    return this.model
      .find({ 'publisherScope.type': 'organization', 'publisherScope.organizationId': organizationId })
      .sort({ _id: 1 })
      .exec();
  }

  /**
   * Owner/realtor marketplace publishing wizard: зеркало
   * findByIdForOrganization/listForOrganization для второй ветки
   * publisherScope-union (`{type:'marketplace_account', identityId}`,
   * @baza/tenant-scope). identityId — из MarketplaceAccountContext
   * (сервер, никогда от клиента), тот же ADR-002 принцип, что ERP-сторона.
   */
  async findByIdForIdentity(id: Types.ObjectId, identityId: Types.ObjectId) {
    return this.model
      .findOne({ _id: id, 'publisherScope.type': 'marketplace_account', 'publisherScope.identityId': identityId })
      .exec();
  }

  async listForIdentity(identityId: Types.ObjectId) {
    return this.model
      .find({ 'publisherScope.type': 'marketplace_account', 'publisherScope.identityId': identityId })
      .sort({ _id: 1 })
      .exec();
  }

  /**
   * Worker-side: без tenant-фильтра — worker резолвит PropertyAsset по
   * sourceId из canonical Listing (уже tenant-checked на API-стороне при
   * publish), не имеет TenantContext в собственном смысле.
   */
  async findById(id: Types.ObjectId) {
    return this.model.findOne({ _id: id }).exec();
  }

  /**
   * DEDUPE-001: намеренно БЕЗ tenant-фильтра — dedupe ищет совпадения
   * ПОПЕРЁК организаций (master plan: "физический объект вторички имеет
   * одного владельца/представителя. Несколько объявлений об одном
   * объекте считаются кандидатами в дубли" — сценарий, который tenant-
   * scoped поиск НЕ может обнаружить в принципе, поскольку разные
   * объявления одного и того же физического объекта типично заводят
   * разные риэлторы/организации). excludeId исключает сам asset (иначе
   * он всегда "дубль самого себя"). Возвращает кандидатов по phone ИЛИ
   * address — точное совпадение сигналов вычисляется вызывающим кодом
   * (PropertyAssetsService), этот метод — только грубый pre-filter,
   * сужающий выборку до реалистичного размера перед детальным сравнением.
   */
  async findPotentialDuplicates(params: {
    excludeId: Types.ObjectId;
    representativePhone: string;
    city: string;
    address: string;
  }) {
    return this.model
      .find({
        _id: { $ne: params.excludeId },
        $or: [
          { representativePhone: params.representativePhone },
          { 'location.city': params.city, 'location.address': params.address },
        ],
      })
      .exec();
  }

  /**
   * MKT-004-MEDIA-RACE-001: CAS on the document's `version`. Every media[]
   * write (confirm/delete/update/reorder, both ERP and marketplace-account
   * paths — both call this one shared method) previously did a plain
   * read-modify-write on the whole array with no version check, so two
   * concurrent mutations on the SAME asset (e.g. confirming two different
   * photos at once, or confirming one while deleting another) could
   * silently lose one write — whichever `$set` committed last won outright,
   * discarding the other caller's change with no error to either side.
   */
  /**
   * Правка характеристик объекта владельцем-физлицом (площадь, комнаты, этаж,
   * телефон в объявлении).
   *
   * Тип объекта и адрес сюда намеренно не входят: по ним система ищет дубликаты,
   * и разрешить их правку значило бы дать объявлению «переехать» в другой дом,
   * обойдя проверку. Для этого создаётся новое объявление — решение владельца от
   * 04.09.2026.
   *
   * CAS по `version` — тот же приём, что у медиа ниже.
   */
  async updateEditableForIdentity(
    id: Types.ObjectId,
    identityId: Types.ObjectId,
    expectedVersion: number,
    patch: {
      characteristics?: PropertyAssetDocument['characteristics'];
      representativePhone?: string;
    },
    session?: ClientSession,
  ) {
    const $set: Record<string, unknown> = {};
    if (patch.characteristics) $set.characteristics = patch.characteristics;
    if (patch.representativePhone) $set.representativePhone = patch.representativePhone;
    return this.model
      .updateOne(
        {
          _id: id,
          'publisherScope.type': 'marketplace_account',
          'publisherScope.identityId': identityId,
          version: expectedVersion,
        },
        { $set, $inc: { version: 1 } },
        { session },
      )
      .exec();
  }

  private async updateMediaIfVersionMatches(
    id: Types.ObjectId,
    media: PropertyAssetDocument['media'],
    expectedVersion: number,
    session?: ClientSession,
  ) {
    return this.model
      .updateOne(
        { _id: id, version: expectedVersion },
        { $set: { media }, $inc: { version: 1 } },
        { session },
      )
      .exec();
  }

  /**
   * Read-modify-write on `media[]` with automatic retry on a lost CAS race
   * (see updateMediaIfVersionMatches above). `mutator` receives the CURRENT
   * media array on each attempt (never a stale copy from a prior attempt)
   * and returns the array to write; it must be a pure function of that
   * array so a retry re-applies the same logic against the latest state
   * rather than reapplying a decision made against data that's since
   * changed. `id` is assumed already ownership-checked by the caller
   * before this is invoked — retries re-fetch by `_id` alone (no repeated
   * tenant/identity filter), since ownership cannot change mid-operation.
   * Bounded at 5 attempts: a real, persistent conflict (not just one
   * unlucky race) should surface as an honest error, not retry forever.
   */
  async mutateMedia(
    id: Types.ObjectId,
    mutator: (currentMedia: PropertyAssetDocument['media']) => PropertyAssetDocument['media'],
    options: { maxAttempts?: number } = {},
  ): Promise<PropertyAssetDocument> {
    const maxAttempts = options.maxAttempts ?? 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const current = await this.model.findOne({ _id: id }).exec();
      if (!current) {
        throw new Error(`PropertyAsset ${id.toString()} not found during mutateMedia`);
      }
      const nextMedia = mutator(current.media || []);
      const result = await this.updateMediaIfVersionMatches(id, nextMedia, current.version);
      if (result.modifiedCount > 0) {
        return (await this.model.findOne({ _id: id }).exec())!;
      }
      // Someone else's write committed between our read and our write —
      // loop back and retry against the now-current state.
    }
    throw new Error(
      `PropertyAsset ${id.toString()} media update lost the optimistic-concurrency race ${maxAttempts} times in a row`,
    );
  }
}
