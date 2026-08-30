import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, FilterQuery, Model, Types } from 'mongoose';
import { TaskDocument, type TaskStatus } from '../schemas/task.schema';

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
}

export interface UpdateTaskParams {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  dueAt?: Date | null;
  assignedPositionId?: Types.ObjectId | null;
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

  async updateTask(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
    params: UpdateTaskParams,
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, number> = {};

    if (params.title !== undefined) $set.title = params.title;
    if (params.status !== undefined) $set.status = params.status;

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

    if (params.assignedPositionId === null) {
      $unset.assignedPositionId = 1;
    } else if (params.assignedPositionId !== undefined) {
      $set.assignedPositionId = params.assignedPositionId;
    }

    const updateDoc: Record<string, unknown> = {};
    if (Object.keys($set).length > 0) updateDoc.$set = $set;
    if (Object.keys($unset).length > 0) updateDoc.$unset = $unset;

    if (Object.keys(updateDoc).length === 0) {
      return { modifiedCount: 0 };
    }

    const result = await this.model
      .updateOne({ _id: id, organizationId }, updateDoc, { session })
      .exec();

    return { modifiedCount: result.modifiedCount };
  }

  async completeTask(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
    completedByPositionId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne(
        { _id: id, organizationId },
        {
          $set: {
            status: 'completed',
            completedAt: new Date(),
            completedByPositionId,
          },
        },
        { session },
      )
      .exec();

    return { modifiedCount: result.modifiedCount };
  }

  async countOpenForLead(organizationId: Types.ObjectId, leadId: Types.ObjectId): Promise<number> {
    return this.model
      .countDocuments({ organizationId, leadId, status: 'open' })
      .exec();
  }

  async listForLead(organizationId: Types.ObjectId, leadId: Types.ObjectId): Promise<TaskDocument[]> {
    return this.model.find({ organizationId, leadId }).sort({ _id: -1 }).exec();
  }

  async listForContact(organizationId: Types.ObjectId, contactId: Types.ObjectId): Promise<TaskDocument[]> {
    return this.model.find({ organizationId, contactId }).sort({ _id: -1 }).exec();
  }
}
