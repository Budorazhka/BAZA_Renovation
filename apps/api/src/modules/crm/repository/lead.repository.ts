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

  async findByIdForOrganization(id: Types.ObjectId, organizationId: Types.ObjectId): Promise<LeadDocument | null> {
    return this.model.findOne({ _id: id, organizationId }).exec();
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

  async changeStage(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
    stage: LeadStage,
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model.updateOne({ _id: id, organizationId }, { $set: { stage } }, { session }).exec();
    return { modifiedCount: result.modifiedCount };
  }
}
