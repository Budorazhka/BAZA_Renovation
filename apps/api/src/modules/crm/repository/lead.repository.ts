import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, PipelineStage, Types } from 'mongoose';
import { LeadDocument, LeadSource, LeadStage, LeadProductType } from '../schemas/lead.schema';

export interface LeadWithStalled {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  contactId: Types.ObjectId;
  ownerPositionId?: Types.ObjectId;
  productType?: LeadProductType;
  stage: LeadStage;
  version: number;
  source: LeadSource;
  createdAt: Date;
  stalled: boolean;
}

/**
 * Единственная точка доступа к коллекции leads (ADR-002 требование 2).
 */
@Injectable()
export class LeadRepository {
  constructor(@InjectModel(LeadDocument.name) private readonly model: Model<LeadDocument>) {}

  /**
   * `stage` — опционален, по умолчанию 'new' (generic-путь, как раньше).
   * Продуктовые воронки лида: вызывающий (CrmService.createLead) явно
   * передаёт первую стадию продукта, когда задан `productType` — этот
   * метод её не вычисляет, только сохраняет то, что пришло.
   */
  async create(
    params: {
      organizationId: Types.ObjectId;
      contactId: Types.ObjectId;
      source: LeadSource;
      productType?: LeadProductType;
      stage?: LeadStage;
    },
    session?: ClientSession,
  ): Promise<LeadDocument> {
    const [doc] = await this.model.create([{ ...params, stage: params.stage ?? 'new' }], { session });
    return doc!;
  }

  async findByIdForOrganization(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
    ownerPositionId?: Types.ObjectId,
  ): Promise<LeadDocument | null> {
    return this.model.findOne({ _id: id, organizationId, ...(ownerPositionId ? { ownerPositionId } : {}) }).exec();
  }

  /**
   * Cursor pagination по `_id` (не `createdAt`) — тот же принцип, что
   * AuditEventRepository.listForAdmin: ObjectId монотонно возрастает и
   * уникален, поэтому `_id`-курсор не имеет дублей/пропусков даже когда
   * несколько лидов созданы в одну и ту же миллисекунду. Newest-first
   * (`$lt` на курсор), симметрично AuditEventRepository. limit+1 — на одну
   * запись больше, чем запрошено, вызывающий код (CrmService.listLeads)
   * решает hasMore/nextCursor по факту лишней записи, не отдельным count().
   *
   * CRM-004: вычисляет `stalled` статус лида через $lookup на открытые задачи:
   * stalled = true для активных стадий (new, contacted, qualified) без открытых задач;
   * stalled = false для терминальных стадий (converted, lost) или при наличии >= 1 открытой задачи.
   */
  async listForOrganization(
    organizationId: Types.ObjectId,
    params: {
      ownerPositionId?: Types.ObjectId;
      stage?: LeadStage;
      stalled?: boolean;
      cursor?: Types.ObjectId;
      limit: number;
    },
  ): Promise<LeadWithStalled[]> {
    const matchStage: Record<string, unknown> = {
      organizationId,
      ...(params.ownerPositionId ? { ownerPositionId: params.ownerPositionId } : {}),
      ...(params.stage ? { stage: params.stage } : {}),
    };
    if (params.cursor) {
      matchStage._id = { $lt: params.cursor };
    }

    const openTasksLookup: PipelineStage = {
      $lookup: {
        from: 'tasks',
        let: { leadId: '$_id', orgId: '$organizationId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$leadId', '$$leadId'] },
                  { $eq: ['$organizationId', '$$orgId'] },
                  { $eq: ['$status', 'open'] },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: 'openTasks',
      },
    };

    const addStalledField: PipelineStage = {
      $addFields: {
        stalled: {
          $cond: {
            if: { $in: ['$stage', ['converted', 'lost']] },
            then: false,
            else: { $eq: [{ $size: '$openTasks' }, 0] },
          },
        },
      },
    };

    const removeOpenTasks: PipelineStage = {
      $project: { openTasks: 0 },
    };

    const pipeline: PipelineStage[] = [
      { $match: matchStage },
      { $sort: { _id: -1 } },
    ];

    if (params.stalled === undefined) {
      pipeline.push(
        { $limit: params.limit },
        openTasksLookup,
        addStalledField,
        removeOpenTasks,
      );
    } else {
      pipeline.push(
        openTasksLookup,
        addStalledField,
        { $match: { stalled: params.stalled } },
        { $limit: params.limit },
        removeOpenTasks,
      );
    }

    return this.model.aggregate<LeadWithStalled>(pipeline).exec();
  }

  async findLeadIdsForContact(
    organizationId: Types.ObjectId,
    contactId: Types.ObjectId,
    ownerPositionId?: Types.ObjectId,
  ): Promise<Types.ObjectId[]> {
    const filter: Record<string, unknown> = { organizationId, contactId };
    if (ownerPositionId) {
      filter.ownerPositionId = ownerPositionId;
    }
    return this.model.distinct('_id', filter).exec();
  }

  /**
   * GET /contacts own-scope (contact.read scope:'own', permission-matrix.md):
   * Contact сам по себе не хранит ownerPositionId — "свой" контакт для
   * manager'а определён transитивно через Lead (contact связан с лидом,
   * ownerPositionId которого — эта Position). distinct() возвращает
   * уникальные contactId без дублей, даже если у Position несколько лидов
   * на один и тот же Contact (повторный reveal того же телефона — см.
   * CrmService.resolveContact докстринг). ContactController/CrmService
   * резолвит это множество ОДИН раз в начале запроса, передаёт как
   * ContactRepository.listForOrganization({contactIds}) — не постфильтрация
   * уже прочитанного списка контактов.
   */
  async distinctContactIdsForOwner(
    organizationId: Types.ObjectId,
    ownerPositionId: Types.ObjectId,
  ): Promise<Types.ObjectId[]> {
    return this.model.distinct('contactId', { organizationId, ownerPositionId }).exec();
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
