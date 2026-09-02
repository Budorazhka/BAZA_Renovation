import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import type { OwnerScope } from '@baza/tenant-scope';
import {
  ListingRevisionDocument,
  type ListingRevisionActorType,
  type ListingRevisionChangeType,
  type ListingRevisionCharacteristicsSnapshot,
  type ListingRevisionPriceSnapshot,
} from '../schemas/listing-revision.schema';

export interface RecordListingRevisionInput {
  propertyAssetId: Types.ObjectId;
  listingId?: Types.ObjectId;
  publisherScope: OwnerScope;
  actor: { type: ListingRevisionActorType; id?: Types.ObjectId };
  changeType: ListingRevisionChangeType;
  price?: ListingRevisionPriceSnapshot;
  status?: string;
  characteristics?: ListingRevisionCharacteristicsSnapshot;
  mediaKeys?: string[];
}

/**
 * Единственная точка доступа к коллекции listing_revisions (ADR-002
 * требование 2). Append-only — запись никогда не редактируется/удаляется
 * программно (TTL-индекс на схеме — единственный механизм удаления).
 */
@Injectable()
export class ListingRevisionRepository {
  constructor(
    @InjectModel(ListingRevisionDocument.name) private readonly model: Model<ListingRevisionDocument>,
  ) {}

  async record(input: RecordListingRevisionInput, session?: ClientSession): Promise<ListingRevisionDocument> {
    const [doc] = await this.model.create(
      [{ ...input, mediaKeys: input.mediaKeys ?? [] }],
      { session },
    );
    return doc!;
  }

  /**
   * Tenant-scoped через organizationId вызывающего кода (PropertyAssetsService
   * уже проверяет владение assetId ДО вызова) — сам репозиторий фильтрует
   * только по propertyAssetId/listingId, не знает про TenantContext.
   */
  async listForAsset(
    propertyAssetId: Types.ObjectId,
    params: { listingId?: Types.ObjectId; limit: number },
  ): Promise<ListingRevisionDocument[]> {
    const filter: Record<string, unknown> = { propertyAssetId };
    if (params.listingId) {
      filter.listingId = params.listingId;
    }
    return this.model.find(filter).sort({ changedAt: -1, _id: -1 }).limit(params.limit).exec();
  }
}
