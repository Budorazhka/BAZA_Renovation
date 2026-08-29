import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import type { OwnerScope } from '@baza/tenant-scope';
import { MediaAssetDocument, MediaVariant } from '../schemas/media-asset.schema';

/**
 * Единственная точка доступа к коллекции media_assets (ADR-002 требование 2).
 * Используется и API-процессом (create/markVerified/markRejected — upload
 * flow), и worker-процессом (appendVariant — derivative-generation после
 * MediaVerified).
 */
@Injectable()
export class MediaAssetRepository {
  constructor(
    @InjectModel(MediaAssetDocument.name) private readonly model: Model<MediaAssetDocument>,
  ) {}

  /**
   * _id передаётся явно вызывающим кодом (MediaService.createUploadIntent),
   * а не сгенерирован Mongo автоматически — presigned upload URL строится
   * ДО вставки записи и уже содержит storage key вида `{assetId}/original.*`,
   * поэтому _id должен быть известен заранее и совпасть с тем, что попадёт
   * в БД, иначе originalPath ссылался бы на key с одним id, а сама запись
   * имела бы другой.
   */
  async create(params: {
    _id: Types.ObjectId;
    ownerScope: OwnerScope;
    declaredMimeType: string;
    sizeBytes: number;
    bucket: 'private' | 'public';
    originalPath: string;
    purpose: string;
  }): Promise<MediaAssetDocument> {
    const [doc] = await this.model.create([{ ...params, status: 'pending', variants: [] }]);
    return doc!;
  }

  async findById(id: Types.ObjectId): Promise<MediaAssetDocument | null> {
    return this.model.findById(id).exec();
  }

  async findByIds(ids: Types.ObjectId[]): Promise<MediaAssetDocument[]> {
    if (ids.length === 0) return [];
    return this.model.find({ _id: { $in: ids } }).exec();
  }

  /**
   * ADR-006: session — часть той же транзакции, что audit+outbox запись
   * в MediaService.confirmUpload (без session смена статуса коммитилась бы
   * немедленно и независимо от audit/outbox, рассинхронизируя состояние
   * при откате транзакции — найдено ревью).
   *
   * Условие `status: 'pending'` в фильтре (не просто `{_id}`) — конкурентная
   * защита: если два параллельных confirmUpload для одного asset дойдут
   * сюда одновременно, второй получит `modifiedCount: 0` и должен
   * трактовать это как "уже обработано", не как ошибку — вызывающий код
   * проверяет результат явно, не полагается на отсутствие исключения.
   */
  async markVerified(
    id: Types.ObjectId,
    params: { verifiedMimeType: string; checksum: string },
    session: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne({ _id: id, status: 'pending' }, { $set: { status: 'verified', ...params } }, { session })
      .exec();
    return { modifiedCount: result.modifiedCount };
  }

  async markRejected(
    id: Types.ObjectId,
    rejectionReason: string,
    session: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne({ _id: id, status: 'pending' }, { $set: { status: 'rejected', rejectionReason } }, { session })
      .exec();
    return { modifiedCount: result.modifiedCount };
  }

  async appendVariant(id: Types.ObjectId, variant: MediaVariant): Promise<void> {
    await this.model.updateOne({ _id: id }, { $push: { variants: variant } }).exec();
  }

  /**
   * Cleanup-очередь ADR-008 Consequences: intent'ы, застрявшие в pending
   * дольше presigned URL TTL — клиент запросил intent, не завершил загрузку.
   */
  async findStalePending(olderThan: Date, limit: number): Promise<MediaAssetDocument[]> {
    return this.model
      .find({ status: 'pending', createdAt: { $lt: olderThan } })
      .limit(limit)
      .exec();
  }
}
