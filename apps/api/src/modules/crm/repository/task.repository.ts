import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, FilterQuery, Model, Types } from 'mongoose';
import {
  TaskDocument,
  UNFINISHED_TASK_STATUSES,
  type TaskStatus,
  type TaskCategory,
} from '../schemas/task.schema';

export interface ListTasksFilter {
  assignedPositionId?: Types.ObjectId;
  leadId?: Types.ObjectId;
  contactId?: Types.ObjectId;
  status?: TaskStatus;
  dueBefore?: Date;
  dueAfter?: Date;
  cursor?: Types.ObjectId;
  limit: number;
}

export interface CreateTaskParams {
  organizationId: Types.ObjectId;
  title: string;
  description?: string;
  status?: TaskStatus;
  dueAt?: Date;
  assignedPositionId?: Types.ObjectId;
  leadId?: Types.ObjectId;
  contactId?: Types.ObjectId;
  startAt?: Date;
  isUrgent?: boolean;
  isImportant?: boolean;
  taskCategory?: TaskCategory;
  colorHex?: string | null;
  reminderOffsetsMinutes?: number[];
  subtasks?: Array<{ id: string; title: string; done: boolean }>;
  attachments?: Array<{ assetId: Types.ObjectId; fileName: string }>;
  createdByPositionId?: Types.ObjectId;
}

export interface UpdateTaskParams {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  dueAt?: Date | null;
  subtasks?: Array<{ id: string; title: string; done: boolean }>;
}

/**
 * Repository layer for CRM tasks.
 * All mutations and reads strictly enforce tenant isolation (organizationId).
 */
@Injectable()
export class TaskRepository {
  constructor(@InjectModel(TaskDocument.name) private readonly model: Model<TaskDocument>) {}

  async create(params: CreateTaskParams, session?: ClientSession): Promise<TaskDocument> {
    const docData: Record<string, unknown> = {
      organizationId: params.organizationId,
      title: params.title,
      status: params.status ?? 'open',
    };

    if (params.description !== undefined) docData.description = params.description;
    if (params.dueAt !== undefined) docData.dueAt = params.dueAt;
    if (params.assignedPositionId !== undefined) docData.assignedPositionId = params.assignedPositionId;
    if (params.leadId !== undefined) docData.leadId = params.leadId;
    if (params.contactId !== undefined) docData.contactId = params.contactId;
    // Ниже — поля, которыми пользуется экран задач. Каждое проставляется
    // только если пришло: у остальных работают defaults схемы, и запись «как
    // есть» не должна затирать их undefined'ом.
    if (params.startAt !== undefined) docData.startAt = params.startAt;
    if (params.isUrgent !== undefined) docData.isUrgent = params.isUrgent;
    if (params.isImportant !== undefined) docData.isImportant = params.isImportant;
    if (params.taskCategory !== undefined) docData.taskCategory = params.taskCategory;
    if (params.colorHex !== undefined) docData.colorHex = params.colorHex;
    if (params.reminderOffsetsMinutes !== undefined) docData.reminderOffsetsMinutes = params.reminderOffsetsMinutes;
    if (params.subtasks !== undefined) docData.subtasks = params.subtasks;
    if (params.attachments !== undefined) docData.attachments = params.attachments;
    if (params.createdByPositionId !== undefined) docData.createdByPositionId = params.createdByPositionId;

    const [created] = await this.model.create([docData], { session });
    return created!;
  }

  async findByIdForOrganization(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
    assignedPositionId?: Types.ObjectId,
    session?: ClientSession,
  ): Promise<TaskDocument | null> {
    const filter: FilterQuery<TaskDocument> = { _id: id, organizationId };
    if (assignedPositionId) {
      filter.assignedPositionId = assignedPositionId;
    }
    if (session) {
      return this.model.findOne(filter, null, { session }).exec();
    }
    return this.model.findOne(filter).exec();
  }

  async listForOrganization(
    organizationId: Types.ObjectId,
    filter: ListTasksFilter,
  ): Promise<TaskDocument[]> {
    const queryFilter: FilterQuery<TaskDocument> = { organizationId };

    if (filter.cursor) {
      queryFilter._id = { $lt: filter.cursor };
    }

    if (filter.status) {
      queryFilter.status = filter.status;
    }

    if (filter.assignedPositionId) {
      queryFilter.assignedPositionId = filter.assignedPositionId;
    }

    if (filter.leadId) {
      queryFilter.leadId = filter.leadId;
    }

    if (filter.contactId) {
      queryFilter.contactId = filter.contactId;
    }

    if (filter.dueBefore || filter.dueAfter) {
      const dueFilter: Record<string, Date> = {};
      if (filter.dueBefore) dueFilter.$lte = filter.dueBefore;
      if (filter.dueAfter) dueFilter.$gte = filter.dueAfter;
      queryFilter.dueAt = dueFilter;
    }

    return this.model
      .find(queryFilter)
      .sort({ _id: -1 })
      .limit(filter.limit)
      .exec();
  }

  /**
   * conventions.md разд.5 optimistic concurrency — тот же паттерн, что
   * LeadRepository.changeStageWithVersionCheck/UnitRepository.updateStatusWithVersionCheck:
   * `version: expectedVersion` в ОДНОМ атомарном Mongo-фильтре с самим
   * изменением, не read-then-write. TaskDocument.version существует с
   * первого дня схемы (default:0) — нет legacy-документов без него,
   * поэтому, в отличие от Lead, здесь не нужен `$or` fallback на
   * отсутствующее поле.
   */
  async updateTask(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
    expectedVersion: number,
    params: UpdateTaskParams,
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, number> = {};

    if (params.title !== undefined) $set.title = params.title;
    if (params.status !== undefined) $set.status = params.status;
    if (params.subtasks !== undefined) $set.subtasks = params.subtasks;

    if (params.description === null) {
      $unset.description = 1;
    } else if (params.description !== undefined) {
      $set.description = params.description;
    }

    if (params.dueAt === null) {
      $unset.dueAt = 1;
    } else if (params.dueAt !== undefined) {
      $set.dueAt = params.dueAt;
    }

    const updateDoc: Record<string, unknown> = { $inc: { version: 1 } };
    if (Object.keys($set).length > 0) updateDoc.$set = $set;
    if (Object.keys($unset).length > 0) updateDoc.$unset = $unset;

    const result = await this.model
      .updateOne({ _id: id, organizationId, version: expectedVersion }, updateDoc, { session })
      .exec();

    return { modifiedCount: result.modifiedCount };
  }

  /**
   * PATCH /tasks/:taskId/reassign — единственный путь смены
   * assignedPositionId, физически отдельный от updateTask (task.reassign —
   * отдельный action/grant, не task.edit, тот же принцип, что
   * lead.assign отделён от lead.changeStage). CAS на version, тот же
   * паттерн, что updateTask.
   */
  async reassignTask(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
    expectedVersion: number,
    assignedPositionId: Types.ObjectId | null,
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const updateDoc: Record<string, unknown> =
      assignedPositionId === null
        ? { $unset: { assignedPositionId: 1 }, $inc: { version: 1 } }
        : { $set: { assignedPositionId }, $inc: { version: 1 } };

    const result = await this.model
      .updateOne({ _id: id, organizationId, version: expectedVersion }, updateDoc, { session })
      .exec();

    return { modifiedCount: result.modifiedCount };
  }

  async completeTask(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
    expectedVersion: number,
    completedByPositionId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne(
        { _id: id, organizationId, version: expectedVersion },
        {
          $set: {
            status: 'completed',
            completedAt: new Date(),
            completedByPositionId,
          },
          $inc: { version: 1 },
        },
        { session },
      )
      .exec();

    return { modifiedCount: result.modifiedCount };
  }

  async countOpenForLead(organizationId: Types.ObjectId, leadId: Types.ObjectId): Promise<number> {
    return this.model
      .countDocuments({ organizationId, leadId, status: { $in: UNFINISHED_TASK_STATUSES } })
      .exec();
  }

  async listForLead(organizationId: Types.ObjectId, leadId: Types.ObjectId): Promise<TaskDocument[]> {
    return this.model.find({ organizationId, leadId }).sort({ _id: -1 }).exec();
  }

  async listForContact(organizationId: Types.ObjectId, contactId: Types.ObjectId): Promise<TaskDocument[]> {
    return this.model.find({ organizationId, contactId }).sort({ _id: -1 }).exec();
  }

  /**
   * CRM-003 hasOpenNextAction для GET /leads (список) — тот же принцип
   * батчинга, что ContactRepository.findByIdsForOrganization: ОДИН запрос
   * на всю страницу лидов вместо N countOpenForLead (N+1 query). Возвращает
   * множество leadId, у которых есть хотя бы одна незавершённая задача — caller
   * (CrmService.listLeads) проверяет через Set.has(), не считает точное
   * количество (странице всё равно нужен только boolean-флаг).
   */
  async distinctLeadIdsWithOpenTask(
    organizationId: Types.ObjectId,
    leadIds: Types.ObjectId[],
  ): Promise<Types.ObjectId[]> {
    if (leadIds.length === 0) return [];
    return this.model
      .distinct('leadId', {
        organizationId,
        leadId: { $in: leadIds },
        status: { $in: UNFINISHED_TASK_STATUSES },
      })
      .exec();
  }
}
