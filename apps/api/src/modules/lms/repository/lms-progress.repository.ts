import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { LmsProgressDocument } from '../schemas/lms-progress.schema';

export interface LmsProgressEntryPayload {
  completedItems: string[];
  finalQuizPassed?: boolean;
  finalQuizScore?: number;
}

export type LmsProgressMap = Record<string, LmsProgressEntryPayload>;

@Injectable()
export class LmsProgressRepository {
  constructor(
    @InjectModel(LmsProgressDocument.name)
    private readonly model: Model<LmsProgressDocument>,
  ) {}

  async getProgressMapForPosition(
    organizationId: Types.ObjectId,
    positionId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<LmsProgressMap> {
    const docs = await this.model
      .find({ organizationId, positionId }, null, { session })
      .exec();

    const map: LmsProgressMap = {};
    for (const doc of docs) {
      map[doc.courseId] = {
        completedItems: doc.completedItems ?? [],
        finalQuizPassed: doc.finalQuizPassed,
        finalQuizScore: doc.finalQuizScore,
      };
    }
    return map;
  }

  async upsertProgress(
    params: {
      organizationId: Types.ObjectId;
      positionId: Types.ObjectId;
      identityId: Types.ObjectId;
      courseId: string;
      entry: LmsProgressEntryPayload;
    },
    session?: ClientSession,
  ): Promise<LmsProgressDocument> {
    const isCompleted =
      params.entry.finalQuizPassed === true ||
      (params.entry.finalQuizScore !== undefined && params.entry.finalQuizScore >= 70);

    const updateDoc: Record<string, unknown> = {
      $set: {
        completedItems: params.entry.completedItems ?? [],
        finalQuizPassed: params.entry.finalQuizPassed,
        finalQuizScore: params.entry.finalQuizScore,
        identityId: params.identityId,
      },
    };

    if (isCompleted) {
      updateDoc.$setOnInsert = { completedAt: new Date() };
    }

    const doc = await this.model
      .findOneAndUpdate(
        {
          organizationId: params.organizationId,
          positionId: params.positionId,
          courseId: params.courseId,
        },
        updateDoc,
        { upsert: true, new: true, session },
      )
      .exec();

    return doc!;
  }

  async deleteProgress(
    organizationId: Types.ObjectId,
    positionId: Types.ObjectId,
    courseId: string,
    session?: ClientSession,
  ): Promise<boolean> {
    const res = await this.model
      .deleteOne({ organizationId, positionId, courseId }, { session })
      .exec();
    return (res.deletedCount ?? 0) > 0;
  }
}
