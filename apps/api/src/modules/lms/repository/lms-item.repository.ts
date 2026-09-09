import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  LmsItemDocument,
  type LmsContentType,
  type LmsTargetRole,
} from '../schemas/lms-item.schema';
import type { SeedLmsItem } from '../lms-seed-data';

export interface CreateLmsItemParams {
  organizationId: Types.ObjectId;
  createdByPositionId?: Types.ObjectId;
  itemId?: string;
  type: LmsContentType;
  title: string;
  description: string;
  targetRole?: LmsTargetRole;
  readTime?: string;
  tags?: string[];
  content: Record<string, unknown>;
}

@Injectable()
export class LmsItemRepository {
  constructor(
    @InjectModel(LmsItemDocument.name)
    private readonly model: Model<LmsItemDocument>,
  ) {}

  async listForOrganization(
    organizationId: Types.ObjectId,
    filter?: { role?: string; type?: string },
    session?: ClientSession,
  ): Promise<LmsItemDocument[]> {
    const query: Record<string, unknown> = {
      $or: [{ organizationId }, { organizationId: null }, { isSystem: true }],
    };

    if (filter?.role && filter.role !== 'all') {
      query.targetRole = { $in: [filter.role, 'all'] };
    }
    if (filter?.type) {
      query.type = filter.type;
    }

    return this.model.find(query, null, { session }).sort({ createdAt: -1 }).exec();
  }

  async findByIdForOrganization(
    id: string,
    organizationId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<LmsItemDocument | null> {
    const isObjectId = Types.ObjectId.isValid(id);
    const idClause = isObjectId ? [{ _id: new Types.ObjectId(id) }, { itemId: id }] : [{ itemId: id }];

    return this.model
      .findOne(
        {
          $and: [
            { $or: idClause },
            { $or: [{ organizationId }, { organizationId: null }, { isSystem: true }] },
          ],
        },
        null,
        { session },
      )
      .exec();
  }

  async create(params: CreateLmsItemParams, session?: ClientSession): Promise<LmsItemDocument> {
    const generatedId = new Types.ObjectId();
    const itemId = params.itemId?.trim() || generatedId.toHexString();

    const [doc] = await this.model.create(
      [
        {
          _id: generatedId,
          itemId,
          organizationId: params.organizationId,
          createdByPositionId: params.createdByPositionId,
          type: params.type,
          title: params.title,
          description: params.description,
          targetRole: params.targetRole ?? 'all',
          readTime: params.readTime,
          tags: params.tags ?? [],
          content: params.content,
          isSystem: false,
        },
      ],
      { session },
    );
    return doc!;
  }

  async update(
    id: string,
    organizationId: Types.ObjectId,
    update: Partial<LmsItemDocument>,
    session?: ClientSession,
  ): Promise<LmsItemDocument | null> {
    const isObjectId = Types.ObjectId.isValid(id);
    const idClause = isObjectId ? [{ _id: new Types.ObjectId(id) }, { itemId: id }] : [{ itemId: id }];

    return this.model
      .findOneAndUpdate(
        {
          $and: [{ $or: idClause }, { organizationId, isSystem: false }],
        },
        { $set: update },
        { new: true, session },
      )
      .exec();
  }

  async delete(
    id: string,
    organizationId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<boolean> {
    const isObjectId = Types.ObjectId.isValid(id);
    const idClause = isObjectId ? [{ _id: new Types.ObjectId(id) }, { itemId: id }] : [{ itemId: id }];

    const res = await this.model
      .deleteOne(
        {
          $and: [{ $or: idClause }, { organizationId, isSystem: false }],
        },
        { session },
      )
      .exec();
    return (res.deletedCount ?? 0) > 0;
  }

  async seedSystemItemsIfEmpty(seedItems: SeedLmsItem[]): Promise<void> {
    const existingCount = await this.model.countDocuments({ isSystem: true }).exec();
    if (existingCount > 0) return;

    for (const item of seedItems) {
      await this.model.updateOne(
        { itemId: item.itemId, isSystem: true },
        {
          $setOnInsert: {
            _id: new Types.ObjectId(),
            itemId: item.itemId,
            organizationId: null,
            type: item.type,
            title: item.title,
            description: item.description,
            targetRole: item.targetRole,
            readTime: item.readTime,
            tags: item.tags,
            content: item.content,
            isSystem: true,
          },
        },
        { upsert: true },
      );
    }
  }
}
