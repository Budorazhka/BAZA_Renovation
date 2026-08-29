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

  /**
   * Admin audit feed (read-only): newest-first, cursor-paginated. Сортировка
   * по `_id` (не `createdAt`) — ObjectId монотонно возрастает по времени
   * создания на уровне драйвера И уникален, поэтому `_id`-курсор не имеет
   * "дырок"/дублей при нескольких событиях с одинаковым `createdAt`
   * (миллисекундная гранулярность Date; несколько audit-записей внутри
   * одной транзакции вполне могут получить одинаковый createdAt) — тот же
   * failure mode, которого избегает `_id`-курсор в listForAdmin/
   * AdminAccountRepository.list, только здесь по убыванию (`$lt`), т.к.
   * фида здесь newest-first, а не oldest-first.
   *
   * `scopeFilter` приходит уже построенным вызывающим кодом
   * (AdminAuditService) — репозиторий не знает про AdminContext/scope,
   * только исполняет готовое Mongo-условие (та же модульная граница, что
   * MarketplacePublicationRepository.listForAdmin).
   */
  async listForAdmin(params: {
    scopeFilter: Record<string, unknown>;
    cursor?: Types.ObjectId;
    limit: number;
  }): Promise<AuditEventDocument[]> {
    const filter: Record<string, unknown> = { ...params.scopeFilter };
    if (params.cursor) {
      filter._id = { $lt: params.cursor };
    }
    return this.model.find(filter).sort({ _id: -1 }).limit(params.limit).exec();
  }
}
