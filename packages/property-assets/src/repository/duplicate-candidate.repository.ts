import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { DuplicateCandidateDocument, DuplicateCandidateStatus } from '../schemas/duplicate-candidate.schema';

export interface DuplicateSignals {
  phoneMatch: boolean;
  addressMatch: boolean;
  roomsAreaFloorMatch: boolean;
}

/**
 * Единственная точка доступа к коллекции duplicate_candidates (ADR-002
 * требование 2).
 */
@Injectable()
export class DuplicateCandidateRepository {
  constructor(
    @InjectModel(DuplicateCandidateDocument.name) private readonly model: Model<DuplicateCandidateDocument>,
  ) {}

  /**
   * mongodb-schema.md: unique index на {propertyAssetIdA, propertyAssetIdB}
   * буквально по порядку полей — пара (A,B) и (B,A) физически РАЗНЫЕ ключи
   * для MongoDB. normalizePair гарантирует единственный канонический
   * порядок (меньший hex-id первым) на КАЖДОЙ точке входа в этот
   * repository, иначе один и тот же физический дубль мог бы быть записан
   * дважды под разными "сторонами" одной и той же пары.
   */
  private normalizePair(idA: Types.ObjectId, idB: Types.ObjectId): [Types.ObjectId, Types.ObjectId] {
    return idA.toHexString() <= idB.toHexString() ? [idA, idB] : [idB, idA];
  }

  /**
   * upsert — findOrCreate по нормализованной паре, не create() безусловно:
   * повторное обнаружение той же пары (например, повторный createAsset-
   * dedupe-скан после того, как пара уже detected/confirmed) не должно
   * порождать вторую запись или тихо перезаписывать уже принятое admin/
   * owner решение (override_not_duplicate/confirmed_duplicate) — signals
   * пересчитываются и обновляются (могли измениться характеристики
   * asset), но status и override-поля НЕ трогаются, если запись уже
   * существует и находится не в 'detected'.
   */
  async upsertDetected(
    propertyAssetIdA: Types.ObjectId,
    propertyAssetIdB: Types.ObjectId,
    signals: DuplicateSignals,
    session?: ClientSession,
  ): Promise<DuplicateCandidateDocument> {
    const [idA, idB] = this.normalizePair(propertyAssetIdA, propertyAssetIdB);
    const existing = await this.model.findOne({ propertyAssetIdA: idA, propertyAssetIdB: idB }).session(session ?? null).exec();
    if (existing) {
      if (existing.status === 'detected') {
        existing.signals = signals;
        await existing.save({ session });
      }
      return existing;
    }
    const [doc] = await this.model.create([{ propertyAssetIdA: idA, propertyAssetIdB: idB, signals, status: 'detected' }], { session });
    return doc!;
  }

  async findByPair(propertyAssetIdA: Types.ObjectId, propertyAssetIdB: Types.ObjectId): Promise<DuplicateCandidateDocument | null> {
    const [idA, idB] = this.normalizePair(propertyAssetIdA, propertyAssetIdB);
    return this.model.findOne({ propertyAssetIdA: idA, propertyAssetIdB: idB }).exec();
  }

  /**
   * Publish-gate (DEDUPE-001: "Явный дубль блокирует публикацию"): любая
   * НЕ-override запись (detected ИЛИ confirmed_duplicate), где этот
   * propertyAssetId участвует с ЛЮБОЙ стороны пары — блокирующий кандидат.
   * override_not_duplicate НЕ блокирует (владелец уже заявил "не дубль" —
   * xlsx #70 — публикация разрешена, исключение залогировано отдельно).
   */
  async findBlockingCandidates(propertyAssetId: Types.ObjectId): Promise<DuplicateCandidateDocument[]> {
    return this.model
      .find({
        $or: [{ propertyAssetIdA: propertyAssetId }, { propertyAssetIdB: propertyAssetId }],
        status: { $in: ['detected', 'confirmed_duplicate'] },
      })
      .exec();
  }

  async findCandidatesForAsset(propertyAssetId: Types.ObjectId): Promise<DuplicateCandidateDocument[]> {
    return this.model
      .find({
        $or: [{ propertyAssetIdA: propertyAssetId }, { propertyAssetIdB: propertyAssetId }],
      })
      .exec();
  }

  async findById(id: Types.ObjectId): Promise<DuplicateCandidateDocument | null> {
    return this.model.findOne({ _id: id }).exec();
  }

  /**
   * Owner override (xlsx #70: "Дубли мы не пропускаем. Если риэлтор
   * пишет Я ПОДТВЕРЖДАЮ ЧТО ЭТО НЕ ДУБЛЬ") — CAS на status:'detected' в
   * фильтре: override возможен только из detected, не из уже
   * confirmed_duplicate (admin уже подтвердил дубль — owner больше не
   * может отменить это решение сам, только admin).
   */
  async override(
    id: Types.ObjectId,
    params: { overrideReason: string; overrideByIdentityId: Types.ObjectId },
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne(
        { _id: id, status: 'detected' },
        {
          $set: {
            status: 'override_not_duplicate',
            overrideReason: params.overrideReason,
            overrideByIdentityId: params.overrideByIdentityId,
            overrideAt: new Date(),
          },
        },
        { session },
      )
      .exec();
    return { modifiedCount: result.modifiedCount };
  }

  /**
   * Admin-очередь (mongodb-schema.md: "{status:1} обслуживает admin-очередь
   * detected/override_not_duplicate для ручной проверки").
   */
  async listForReview(statuses: DuplicateCandidateStatus[], params: { cursor?: Types.ObjectId; limit: number }): Promise<DuplicateCandidateDocument[]> {
    const filter: Record<string, unknown> = { status: { $in: statuses } };
    if (params.cursor) {
      filter._id = { $gt: params.cursor };
    }
    return this.model.find(filter).sort({ _id: 1 }).limit(params.limit).exec();
  }

  /**
   * Admin critical action: подтверждение дубля вручную (админ рассматривает
   * override_not_duplicate или detected и решает, что это ДЕЙСТВИТЕЛЬНО
   * дубль) — тот же generic паттерн, что AdminPublicationService.unpublish
   * (permission-проверка — ответственность вызывающего сервиса, этот
   * repository только исполняет уже принятое решение).
   */
  async markConfirmedDuplicate(id: Types.ObjectId, session?: ClientSession): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne({ _id: id, status: { $ne: 'confirmed_duplicate' } }, { $set: { status: 'confirmed_duplicate' } }, { session })
      .exec();
    return { modifiedCount: result.modifiedCount };
  }
}
