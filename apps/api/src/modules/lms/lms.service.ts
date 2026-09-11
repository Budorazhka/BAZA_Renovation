import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, Types } from 'mongoose';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { IdempotencyService } from '../../shared/idempotency/idempotency.service';
import { runInTransaction } from '../../shared/transactions/run-in-transaction';
import { OutboxService } from '../outbox/outbox.service';
import { LmsItemRepository } from './repository/lms-item.repository';
import { LmsCourseRepository } from './repository/lms-course.repository';
import {
  LmsProgressRepository,
  type LmsProgressMap,
  type LmsProgressEntryPayload,
  type QuizGrade,
} from './repository/lms-progress.repository';
import {
  CreateLmsItemDto,
  UpdateLmsItemDto,
  CreateLmsCourseDto,
  UpdateLmsCourseDto,
  UpsertProgressDto,
  ListLmsItemsQueryDto,
  ListLmsCoursesQueryDto,
} from './dto/lms.dto';
import { SEED_LMS_ITEMS, SEED_LMS_COURSES } from './lms-seed-data';
import type { LmsItemDocument } from './schemas/lms-item.schema';
import type { LmsCourseDocument } from './schemas/lms-course.schema';

/**
 * Сверяет присланные ответы с `course.finalQuiz` — единственное место,
 * которое решает, сдан ли тест (LmsService.upsertProgress). `undefined`,
 * если сверять нечего: у курса нет теста, в нём нет вопросов, или клиент
 * не прислал `finalQuizAnswers` (вызов не про тест — просто отметили
 * материал прочитанным).
 *
 * Лишние/недостающие ответы (длина `answers` не совпадает с числом
 * вопросов) не отбрасываются как ошибка: недостающий индекс просто не
 * совпадёт ни с одним `correct` — вопрос засчитывается неотвеченным
 * (неверным), как и должно быть, без отдельной проверки длины.
 */
function gradeFinalQuiz(course: LmsCourseDocument, answers: number[] | undefined): QuizGrade | undefined {
  if (!course.finalQuiz || answers === undefined) return undefined;
  const questions = course.finalQuiz.questions;
  if (questions.length === 0) return undefined;

  const correctCount = questions.filter((q, i) => answers[i] === q.correct).length;
  const score = Math.round((correctCount / questions.length) * 100);
  return { score, passed: score >= course.finalQuiz.passingScore };
}

export function toLmsItemDto(doc: LmsItemDocument) {
  return {
    id: doc.itemId,
    type: doc.type,
    title: doc.title,
    description: doc.description,
    targetRole: doc.targetRole,
    readTime: doc.readTime,
    tags: doc.tags ?? [],
    content: doc.content,
    isSystem: doc.isSystem,
  };
}

/**
 * `correct` уходит в ответ как есть — читатель с правом `lms_course.read`
 * (по сути вся организация, см. DEFAULT_ROLE_GRANTS) видит ключ ответов
 * финального теста до того, как его пройти. Известный открытый вопрос
 * (lms-knowledge-base.md, «Что открыто» №1): скрыть его от обычного
 * читателя нельзя без переделки самого прохождения теста — сейчас
 * `QuizViewer` (ERP) сверяет выбранный вариант с `correct` ЛОКАЛЬНО, чтобы
 * показать результат сразу, без ответа сервера. Раздельная выдача
 * (полный список — автору/редактору курса, вопросы без ответов —
 * проходящему) потребовала бы сначала перевести прохождение теста на
 * серверную сверку (см. ниже, upsertProgress) и синхронный ответ от неё —
 * самостоятельная задача, не входит в этот проход.
 *
 * Здесь и сейчас (11.09.2026) закрыт другой участок того же дефекта:
 * прохождение теста больше не принимает готовый `finalQuizPassed` от
 * клиента — см. upsertProgress ниже. Раньше PUT с `{finalQuizPassed: true}`
 * защитывал курс пройденным без единого правильного ответа; теперь сервер
 * сам сверяет присланные ответы с `finalQuiz.questions[].correct`.
 */
export function toLmsCourseDto(doc: LmsCourseDocument) {
  return {
    id: doc.courseId,
    title: doc.title,
    description: doc.description,
    targetRoles: doc.targetRoles ?? ['all'],
    emoji: doc.emoji ?? '🎯',
    itemIds: doc.itemIds ?? [],
    finalQuiz: doc.finalQuiz
      ? {
          passingScore: doc.finalQuiz.passingScore,
          questions: doc.finalQuiz.questions.map((q) => ({
            question: q.question,
            options: q.options,
            correct: q.correct,
          })),
        }
      : undefined,
    isSystem: doc.isSystem,
  };
}

@Injectable()
export class LmsService implements OnModuleInit {
  private readonly logger = new Logger(LmsService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly itemRepository: LmsItemRepository,
    private readonly courseRepository: LmsCourseRepository,
    private readonly progressRepository: LmsProgressRepository,
    private readonly idempotencyService: IdempotencyService,
    private readonly outboxService: OutboxService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultsIfEmpty();
  }

  async seedDefaultsIfEmpty(): Promise<void> {
    try {
      await this.itemRepository.seedSystemItemsIfEmpty(SEED_LMS_ITEMS);
      await this.courseRepository.seedSystemCoursesIfEmpty(SEED_LMS_COURSES);
    } catch (error) {
      // Ожидаемо: реплика ещё не проинициализирована в юнит-тестах. Но
      // ИСПРАВЛЕНО 10.09.2026: раньше ошибка глушилась молча (catch {}) —
      // в проде реальный сбой сидирования (например, дублирующийся courseId)
      // был бы неотличим от штатного пропуска. Логируем, дальше не бросаем:
      // отсутствие системных курсов не должно ронять старт API.
      this.logger.warn(`seedDefaultsIfEmpty failed, skipping: ${(error as Error).message}`);
    }
  }

  // ─── Items (Материалы библиотеки) ──────────────────────────────────────────

  async listItems(organizationId: Types.ObjectId, query?: ListLmsItemsQueryDto) {
    const docs = await this.itemRepository.listForOrganization(organizationId, {
      role: query?.role,
      type: query?.type,
    });
    return docs.map(toLmsItemDto);
  }

  async getItem(id: string, organizationId: Types.ObjectId) {
    const doc = await this.itemRepository.findByIdForOrganization(id, organizationId);
    if (!doc) {
      throw new AppException(ErrorCode.NOT_FOUND, `LMS item '${id}' not found`);
    }
    return toLmsItemDto(doc);
  }

  async createItem(params: {
    organizationId: Types.ObjectId;
    positionId: Types.ObjectId;
    identityId: Types.ObjectId;
    idempotencyKey?: string;
    data: CreateLmsItemDto;
  }) {
    if (!params.idempotencyKey) {
      throw new AppException(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Idempotency-Key header is required');
    }

    const replay = await this.idempotencyService.checkReplay({
      identityId: params.identityId,
      operation: 'createLmsItem',
      key: params.idempotencyKey,
      requestBody: params.data as unknown as Record<string, unknown>,
    });
    if (replay) {
      return replay.responseBody;
    }

    return runInTransaction(this.connection, async (session: ClientSession) => {
      const created = await this.itemRepository.create(
        {
          organizationId: params.organizationId,
          createdByPositionId: params.positionId,
          itemId: params.data.itemId,
          type: params.data.type,
          title: params.data.title,
          description: params.data.description,
          targetRole: params.data.targetRole,
          readTime: params.data.readTime,
          tags: params.data.tags,
          content: params.data.content,
        },
        session,
      );

      const response = toLmsItemDto(created);

      await this.idempotencyService.record(
        {
          identityId: params.identityId,
          operation: 'createLmsItem',
          key: params.idempotencyKey!,
          requestBody: params.data as unknown as Record<string, unknown>,
          responseStatus: 201,
          responseBody: response as unknown as Record<string, unknown>,
        },
        session,
      );

      return response;
    });
  }

  async updateItem(id: string, organizationId: Types.ObjectId, data: UpdateLmsItemDto) {
    const existing = await this.itemRepository.findByIdForOrganization(id, organizationId);
    if (!existing) {
      throw new AppException(ErrorCode.NOT_FOUND, `LMS item '${id}' not found`);
    }
    if (existing.isSystem) {
      throw new AppException(ErrorCode.FORBIDDEN, 'System template materials cannot be modified directly');
    }

    const updated = await this.itemRepository.update(id, organizationId, {
      type: data.type,
      title: data.title,
      description: data.description,
      targetRole: data.targetRole,
      readTime: data.readTime,
      tags: data.tags,
      content: data.content,
    });
    if (!updated) {
      throw new AppException(ErrorCode.NOT_FOUND, `LMS item '${id}' not found`);
    }

    return toLmsItemDto(updated);
  }

  async deleteItem(id: string, organizationId: Types.ObjectId) {
    const existing = await this.itemRepository.findByIdForOrganization(id, organizationId);
    if (!existing) {
      throw new AppException(ErrorCode.NOT_FOUND, `LMS item '${id}' not found`);
    }
    if (existing.isSystem) {
      throw new AppException(ErrorCode.FORBIDDEN, 'System template materials cannot be deleted');
    }

    const deleted = await this.itemRepository.delete(id, organizationId);
    return { deleted };
  }

  // ─── Courses (Курсы) ───────────────────────────────────────────────────────

  async listCourses(organizationId: Types.ObjectId, query?: ListLmsCoursesQueryDto) {
    const docs = await this.courseRepository.listForOrganization(organizationId, {
      role: query?.role,
    });
    return docs.map(toLmsCourseDto);
  }

  async getCourse(id: string, organizationId: Types.ObjectId) {
    const doc = await this.courseRepository.findByIdForOrganization(id, organizationId);
    if (!doc) {
      throw new AppException(ErrorCode.NOT_FOUND, `LMS course '${id}' not found`);
    }
    return toLmsCourseDto(doc);
  }

  async createCourse(params: {
    organizationId: Types.ObjectId;
    positionId: Types.ObjectId;
    identityId: Types.ObjectId;
    idempotencyKey?: string;
    data: CreateLmsCourseDto;
  }) {
    if (!params.idempotencyKey) {
      throw new AppException(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Idempotency-Key header is required');
    }

    const replay = await this.idempotencyService.checkReplay({
      identityId: params.identityId,
      operation: 'createLmsCourse',
      key: params.idempotencyKey,
      requestBody: params.data as unknown as Record<string, unknown>,
    });
    if (replay) {
      return replay.responseBody;
    }

    return runInTransaction(this.connection, async (session: ClientSession) => {
      const created = await this.courseRepository.create(
        {
          organizationId: params.organizationId,
          createdByPositionId: params.positionId,
          courseId: params.data.courseId,
          title: params.data.title,
          description: params.data.description,
          targetRoles: params.data.targetRoles,
          emoji: params.data.emoji,
          itemIds: params.data.itemIds,
          finalQuiz: params.data.finalQuiz,
        },
        session,
      );

      const response = toLmsCourseDto(created);

      await this.idempotencyService.record(
        {
          identityId: params.identityId,
          operation: 'createLmsCourse',
          key: params.idempotencyKey!,
          requestBody: params.data as unknown as Record<string, unknown>,
          responseStatus: 201,
          responseBody: response as unknown as Record<string, unknown>,
        },
        session,
      );

      return response;
    });
  }

  async updateCourse(id: string, organizationId: Types.ObjectId, data: UpdateLmsCourseDto) {
    const existing = await this.courseRepository.findByIdForOrganization(id, organizationId);
    if (!existing) {
      throw new AppException(ErrorCode.NOT_FOUND, `LMS course '${id}' not found`);
    }
    if (existing.isSystem) {
      throw new AppException(ErrorCode.FORBIDDEN, 'System template courses cannot be modified directly');
    }

    const updated = await this.courseRepository.update(id, organizationId, {
      title: data.title,
      description: data.description,
      targetRoles: data.targetRoles,
      emoji: data.emoji,
      itemIds: data.itemIds,
      finalQuiz: data.finalQuiz,
    });
    if (!updated) {
      throw new AppException(ErrorCode.NOT_FOUND, `LMS course '${id}' not found`);
    }

    return toLmsCourseDto(updated);
  }

  async deleteCourse(id: string, organizationId: Types.ObjectId) {
    const existing = await this.courseRepository.findByIdForOrganization(id, organizationId);
    if (!existing) {
      throw new AppException(ErrorCode.NOT_FOUND, `LMS course '${id}' not found`);
    }
    if (existing.isSystem) {
      throw new AppException(ErrorCode.FORBIDDEN, 'System template courses cannot be deleted');
    }

    const deleted = await this.courseRepository.delete(id, organizationId);
    return { deleted };
  }

  // ─── Progress (Прогресс ученика) ────────────────────────────────────────────

  async getProgress(organizationId: Types.ObjectId, positionId: Types.ObjectId): Promise<LmsProgressMap> {
    return this.progressRepository.getProgressMapForPosition(organizationId, positionId);
  }

  /**
   * ИСПРАВЛЕНО 11.09.2026: раньше `finalQuizPassed`/`finalQuizScore`
   * принимались от клиента как есть и сохранялись без единой проверки —
   * `PUT /lms/progress/:courseId` с телом `{completedItems: [],
   * finalQuizPassed: true}` защитывал курс пройденным без единого
   * правильного ответа, LmsCourseCompleted уходил в outbox по тому же
   * телу. Теперь клиент присылает `finalQuizAnswers` (что он выбрал),
   * сервер сам сверяет их с `LmsCourseDocument.finalQuiz`, посчитанным
   * `finalQuizPassed`/`finalQuizScore` доверяет только он. `correct`
   * по-прежнему уходит в ответ на чтение курса (см. toLmsCourseDto docstring
   * — отдельный, ещё не закрытый вопрос), поэтому это не защита от того, кто
   * подсмотрел ответы, а защита от того, кто пытается засчитать тест, вовсе
   * его не решая — например, произвольным PATCH-запросом в обход интерфейса.
   *
   * `finalQuizAnswers` отсутствует — вызов не про тест (отметили материал
   * прочитанным): прежний результат теста не трогаем (см. репозиторий).
   * Курс без финального теста завершается прочтением всех `itemIds`.
   */
  async upsertProgress(params: {
    organizationId: Types.ObjectId;
    positionId: Types.ObjectId;
    identityId: Types.ObjectId;
    courseId: string;
    data: UpsertProgressDto;
    correlationId?: string;
  }): Promise<LmsProgressEntryPayload> {
    return runInTransaction(this.connection, async (session: ClientSession) => {
      const course = await this.courseRepository.findByIdForOrganization(
        params.courseId,
        params.organizationId,
        session,
      );
      if (!course) {
        throw new AppException(ErrorCode.NOT_FOUND, `LMS course '${params.courseId}' not found`);
      }

      const quizGrade = gradeFinalQuiz(course, params.data.finalQuizAnswers);
      const allItemsCompletedWithoutQuiz =
        !course.finalQuiz && course.itemIds.length > 0
          ? course.itemIds.every((id) => params.data.completedItems.includes(id))
          : false;

      const progressDoc = await this.progressRepository.upsertProgress(
        {
          organizationId: params.organizationId,
          positionId: params.positionId,
          identityId: params.identityId,
          courseId: params.courseId,
          completedItems: params.data.completedItems,
          quizGrade,
          allItemsCompletedWithoutQuiz,
        },
        session,
      );

      if (quizGrade?.passed === true) {
        await this.outboxService.publish(
          {
            eventType: 'LmsCourseCompleted',
            aggregateType: 'LmsProgress',
            aggregateId: progressDoc._id,
            payload: {
              organizationId: params.organizationId.toHexString(),
              positionId: params.positionId.toHexString(),
              identityId: params.identityId.toHexString(),
              courseId: params.courseId,
              finalQuizScore: quizGrade.score,
              completedAt: new Date().toISOString(),
            },
            deduplicationKey: `LmsProgress:${params.organizationId.toHexString()}:${params.positionId.toHexString()}:${params.courseId}:LmsCourseCompleted`,
          },
          session,
        );
      }

      return {
        completedItems: progressDoc.completedItems ?? [],
        finalQuizPassed: progressDoc.finalQuizPassed,
        finalQuizScore: progressDoc.finalQuizScore,
      };
    });
  }

  async deleteProgress(
    organizationId: Types.ObjectId,
    positionId: Types.ObjectId,
    courseId: string,
  ): Promise<{ deleted: boolean }> {
    const deleted = await this.progressRepository.deleteProgress(organizationId, positionId, courseId);
    return { deleted };
  }
}
