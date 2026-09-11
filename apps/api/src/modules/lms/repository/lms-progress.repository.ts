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

/** Итог проверки теста, посчитанный LmsService (никогда — присланный клиентом). */
export interface QuizGrade {
  score: number;
  passed: boolean;
}

export interface UpsertProgressParams {
  organizationId: Types.ObjectId;
  positionId: Types.ObjectId;
  identityId: Types.ObjectId;
  courseId: string;
  completedItems: string[];
  /**
   * `undefined` — этот вызов не содержит попытки теста (например, просто
   * отметили материал прочитанным до того, как дошли до теста): прежний
   * результат теста, если он есть, сохраняется как есть, не сбрасывается.
   * Задано — итог САМОЙ СВЕЖЕЙ попытки, посчитанный сервером
   * (LmsService.upsertProgress), полностью заменяет прежний.
   */
  quizGrade?: QuizGrade;
  /**
   * Курс без финального теста завершается прочтением всех материалов —
   * это знает только вызывающий (LmsService: сверяет с course.itemIds),
   * репозиторий содержимого курса не видит.
   */
  allItemsCompletedWithoutQuiz?: boolean;
}

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

  /**
   * ИСПРАВЛЕНО 11.09.2026: раньше `completedAt` ставился только `$setOnInsert`
   * — если запись прогресса уже существовала (обычный случай: она создаётся
   * при первой же отметке прочитанного материала, задолго до теста), дата
   * завершения не появлялась никогда, даже при реально сданном тесте позже.
   * Теперь читаем текущую запись и ставим `completedAt` ровно один раз — в
   * момент перехода в завершённое состояние, не переписываем его на
   * повторных попытках (более раннюю историческую дату не двигаем вперёд,
   * даже если пересдача провалена — `finalQuizPassed`/`finalQuizScore` при
   * этом всё равно отражают самую свежую попытку).
   */
  async upsertProgress(params: UpsertProgressParams, session?: ClientSession): Promise<LmsProgressDocument> {
    const existing = await this.model
      .findOne(
        { organizationId: params.organizationId, positionId: params.positionId, courseId: params.courseId },
        null,
        { session },
      )
      .exec();

    const wasCompleted = existing?.completedAt != null;
    const impliesCompletedThisCall = params.quizGrade
      ? params.quizGrade.passed
      : Boolean(params.allItemsCompletedWithoutQuiz);

    const setFields: Record<string, unknown> = {
      completedItems: params.completedItems,
      identityId: params.identityId,
    };
    if (params.quizGrade) {
      setFields.finalQuizPassed = params.quizGrade.passed;
      setFields.finalQuizScore = params.quizGrade.score;
    }
    if (!wasCompleted && impliesCompletedThisCall) {
      setFields.completedAt = new Date();
    }

    const doc = await this.model
      .findOneAndUpdate(
        {
          organizationId: params.organizationId,
          positionId: params.positionId,
          courseId: params.courseId,
        },
        { $set: setFields },
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
