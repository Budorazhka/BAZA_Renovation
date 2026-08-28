import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { LeadDocument, LeadSource, LeadStage } from '../schemas/lead.schema';

/**
 * Единственная точка доступа к коллекции leads (ADR-002 требование 2).
 */
@Injectable()
export class LeadRepository {
  constructor(@InjectModel(LeadDocument.name) private readonly model: Model<LeadDocument>) {}

  async create(
    params: { organizationId: Types.ObjectId; contactId: Types.ObjectId; source: LeadSource },
    session?: ClientSession,
  ): Promise<LeadDocument> {
    const [doc] = await this.model.create([{ ...params, stage: 'new' }], { session });
    return doc!;
  }

  async findByIdForOrganization(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
    ownerPositionId?: Types.ObjectId,
  ): Promise<LeadDocument | null> {
    return this.model.findOne({ _id: id, organizationId, ...(ownerPositionId ? { ownerPositionId } : {}) }).exec();
  }

  async listForOrganization(
    organizationId: Types.ObjectId,
    params: { ownerPositionId?: Types.ObjectId; stage?: LeadStage; limit: number },
  ): Promise<LeadDocument[]> {
    return this.model
      .find({ organizationId, ...(params.ownerPositionId ? { ownerPositionId: params.ownerPositionId } : {}), ...(params.stage ? { stage: params.stage } : {}) })
      .sort({ createdAt: -1, _id: -1 })
      .limit(params.limit)
      .exec();
  }

  /**
   * assignLead (permission-matrix.md `lead.assign.organization`) — не
   * версионировано (в отличие от Development/Unit): concurrent assign той
   * же lead двумя РОПами одновременно — редкий edge case на MVP-масштабе,
   * последний write выигрывает, явно не защищено optimistic concurrency
   * (D-01 паттерн здесь не переносится автоматически, это сознательное
   * упрощение первого прохода CRM-модуля, не молчаливый пробел).
   */
  async assignOwner(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
    ownerPositionId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne({ _id: id, organizationId }, { $set: { ownerPositionId } }, { session })
      .exec();
    return { modifiedCount: result.modifiedCount };
  }

  /**
   * conventions.md разд.5 optimistic concurrency — тот же паттерн, что
   * UnitRepository.updateStatusWithVersionCheck: `version: expectedVersion`
   * И `stage: { $in: allowedFromStages }` в ОДНОМ атомарном Mongo-фильтре
   * (не два отдельных read-then-write шага) — единственная гарантия, что
   * два параллельных PATCH .../stage не оба проходят transition-проверку
   * против одного и того же прочитанного состояния и оба безусловно
   * записывают (lost update). Добавлено 27.08.2026 — до этого changeStage
   * был безусловным updateOne({_id,organizationId}), ноль concurrency-защиты.
   */
  async changeStageWithVersionCheck(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
    expectedVersion: number,
    stage: LeadStage,
    allowedFromStages: readonly LeadStage[],
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    // Backward compatibility for leads created before Lead.version was added:
    // a missing field is the same logical initial version (0). Once this
    // update succeeds, $inc materializes version:1 on the legacy document.
    const versionFilter = expectedVersion === 0
      ? { $or: [{ version: 0 }, { version: { $exists: false } }] }
      : { version: expectedVersion };
    const result = await this.model
      .updateOne(
        { _id: id, organizationId, ...versionFilter, stage: { $in: allowedFromStages } },
        { $set: { stage }, $inc: { version: 1 } },
        { session },
      )
      .exec();
    return { modifiedCount: result.modifiedCount };
  }
}
