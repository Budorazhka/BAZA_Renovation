import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { AuditEventDocument, type AuditActorType } from '../schemas/audit-event.schema';

/**
 * Единственная точка доступа к коллекции audit_events (ADR-002 требование 2).
 * НАМЕРЕННО не предоставляет update/delete методы — append-only enforced
 * на уровне API этого класса, не только соглашения "не редактировать".
 * Единственный способ "убрать" запись — TTL-индекс (retention, схема).
 */
@Injectable()
export class AuditEventRepository {
  constructor(
    @InjectModel(AuditEventDocument.name) private readonly model: Model<AuditEventDocument>,
  ) {}

  async append(
    params: {
      actor: { type: AuditActorType; id?: Types.ObjectId };
      action: string;
      resource: string;
      resourceId: Types.ObjectId;
      reason?: string;
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
      correlationId: string;
    },
    session?: ClientSession,
  ): Promise<void> {
    await this.model.create([params], { session });
  }

  async findByResource(resourceId: Types.ObjectId): Promise<AuditEventDocument[]> {
    return this.model.find({ resourceId }).sort({ createdAt: -1 }).exec();
  }

  async findByActor(actorId: Types.ObjectId): Promise<AuditEventDocument[]> {
    return this.model.find({ 'actor.id': actorId }).sort({ createdAt: -1 }).exec();
  }
}
