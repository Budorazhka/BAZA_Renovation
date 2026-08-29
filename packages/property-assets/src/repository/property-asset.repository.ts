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

  async updateMedia(
    id: Types.ObjectId,
    media: PropertyAssetDocument['media'],
    session?: ClientSession,
  ) {
    return this.model.updateOne({ _id: id }, { $set: { media } }, { session }).exec();
  }
}
