import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  LmsCourseDocument,
  type CourseFinalQuiz,
} from '../schemas/lms-course.schema';
import type { SeedLmsCourse } from '../lms-seed-data';

export interface CreateLmsCourseParams {
  organizationId: Types.ObjectId;
  createdByPositionId?: Types.ObjectId;
  courseId?: string;
  title: string;
  description: string;
  targetRoles?: string[];
  emoji?: string;
  itemIds: string[];
  finalQuiz?: CourseFinalQuiz;
}

@Injectable()
export class LmsCourseRepository {
  constructor(
    @InjectModel(LmsCourseDocument.name)
    private readonly model: Model<LmsCourseDocument>,
  ) {}

  async listForOrganization(
    organizationId: Types.ObjectId,
    filter?: { role?: string },
    session?: ClientSession,
  ): Promise<LmsCourseDocument[]> {
    const query: Record<string, unknown> = {
      $or: [{ organizationId }, { organizationId: null }, { isSystem: true }],
    };

    if (filter?.role && filter.role !== 'all') {
      query.targetRoles = { $in: [filter.role, 'all'] };
    }

    return this.model.find(query, null, { session }).sort({ createdAt: -1 }).exec();
  }

  async findByIdForOrganization(
    id: string,
    organizationId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<LmsCourseDocument | null> {
    const isObjectId = Types.ObjectId.isValid(id);
    const idClause = isObjectId ? [{ _id: new Types.ObjectId(id) }, { courseId: id }] : [{ courseId: id }];

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

  async create(params: CreateLmsCourseParams, session?: ClientSession): Promise<LmsCourseDocument> {
    const generatedId = new Types.ObjectId();
    const courseId = params.courseId?.trim() || generatedId.toHexString();

    const [doc] = await this.model.create(
      [
        {
          _id: generatedId,
          courseId,
          organizationId: params.organizationId,
          createdByPositionId: params.createdByPositionId,
          title: params.title,
          description: params.description,
          targetRoles: params.targetRoles && params.targetRoles.length > 0 ? params.targetRoles : ['all'],
          emoji: params.emoji ?? '🎯',
          itemIds: params.itemIds,
          finalQuiz: params.finalQuiz,
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
    update: Partial<LmsCourseDocument>,
    session?: ClientSession,
  ): Promise<LmsCourseDocument | null> {
    const isObjectId = Types.ObjectId.isValid(id);
    const idClause = isObjectId ? [{ _id: new Types.ObjectId(id) }, { courseId: id }] : [{ courseId: id }];

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
    const idClause = isObjectId ? [{ _id: new Types.ObjectId(id) }, { courseId: id }] : [{ courseId: id }];

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

  async seedSystemCoursesIfEmpty(seedCourses: SeedLmsCourse[]): Promise<void> {
    const existingCount = await this.model.countDocuments({ isSystem: true }).exec();
    if (existingCount > 0) return;

    for (const course of seedCourses) {
      await this.model.updateOne(
        { courseId: course.courseId, isSystem: true },
        {
          $setOnInsert: {
            _id: new Types.ObjectId(),
            courseId: course.courseId,
            organizationId: null,
            title: course.title,
            description: course.description,
            targetRoles: course.targetRoles,
            emoji: course.emoji,
            itemIds: course.itemIds,
            finalQuiz: course.finalQuiz,
            isSystem: true,
          },
        },
        { upsert: true },
      );
    }
  }
}
