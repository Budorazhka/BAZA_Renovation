import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { LmsService } from '../../src/modules/lms/lms.service';
import { LmsItemRepository } from '../../src/modules/lms/repository/lms-item.repository';
import { LmsCourseRepository } from '../../src/modules/lms/repository/lms-course.repository';
import { LmsProgressRepository } from '../../src/modules/lms/repository/lms-progress.repository';
import { LmsItemDocument, LmsItemSchema } from '../../src/modules/lms/schemas/lms-item.schema';
import { LmsCourseDocument, LmsCourseSchema } from '../../src/modules/lms/schemas/lms-course.schema';
import { LmsProgressDocument, LmsProgressSchema } from '../../src/modules/lms/schemas/lms-progress.schema';
import type { IdempotencyService } from '../../src/shared/idempotency/idempotency.service';
import type { OutboxService } from '../../src/modules/outbox/outbox.service';
import { ErrorCode } from '../../src/shared/errors/error-codes';

/**
 * До 11.09.2026 `PUT /lms/progress/:courseId` сохраняло `finalQuizPassed`/
 * `finalQuizScore` из тела запроса как есть — курс защитывался пройденным
 * без единого правильного ответа. Проверяется на настоящей MongoDB: сервер
 * сам сверяет присланные `finalQuizAnswers` с курсом внутри транзакции,
 * никакое поле из тела запроса не может подменить это решение.
 */
describe('LMS: тест проверяется сервером, не клиентом (lms-knowledge-base.md, «Что открыто» №1)', () => {
  let replSet: MongoMemoryReplSet;
  let connection: mongoose.Connection;
  let CourseModel: mongoose.Model<LmsCourseDocument>;
  let ProgressModel: mongoose.Model<LmsProgressDocument>;
  let service: LmsService;

  const orgId = new Types.ObjectId();
  const positionId = new Types.ObjectId();
  const identityId = new Types.ObjectId();

  async function seedCourse(overrides: Partial<{ courseId: string; itemIds: string[]; finalQuiz: unknown }>) {
    const courseId = overrides.courseId ?? `course-${new Types.ObjectId().toHexString()}`;
    await CourseModel.create({
      courseId,
      organizationId: orgId,
      title: 'Курс',
      description: 'Описание',
      itemIds: overrides.itemIds ?? ['item-1'],
      finalQuiz: overrides.finalQuiz,
      isSystem: false,
    });
    return courseId;
  }

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    connection = await mongoose.createConnection(replSet.getUri()).asPromise();

    const ItemModel = connection.model(LmsItemDocument.name, LmsItemSchema);
    CourseModel = connection.model(LmsCourseDocument.name, LmsCourseSchema);
    ProgressModel = connection.model(LmsProgressDocument.name, LmsProgressSchema);

    const idempotencyService: Pick<IdempotencyService, 'checkReplay' | 'record'> = {
      checkReplay: jest.fn().mockResolvedValue(null),
      record: jest.fn().mockResolvedValue(undefined),
    };
    const outboxService: Pick<OutboxService, 'publish'> = { publish: jest.fn().mockResolvedValue(undefined) };

    service = new LmsService(
      connection,
      new LmsItemRepository(ItemModel),
      new LmsCourseRepository(CourseModel),
      new LmsProgressRepository(ProgressModel),
      idempotencyService as unknown as IdempotencyService,
      outboxService as unknown as OutboxService,
    );
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
    await replSet?.stop();
  });

  const QUIZ = {
    passingScore: 70,
    questions: [
      { question: 'В1', options: ['a', 'b'], correct: 0 },
      { question: 'В2', options: ['a', 'b'], correct: 1 },
      { question: 'В3', options: ['a', 'b'], correct: 0 },
    ],
  };

  it('верные ответы засчитывают тест сданным и проставляют дату завершения', async () => {
    const courseId = await seedCourse({ finalQuiz: QUIZ });

    const res = await service.upsertProgress({
      organizationId: orgId,
      positionId,
      identityId,
      courseId,
      data: { completedItems: ['item-1'], finalQuizAnswers: [0, 1, 0] },
    });

    expect(res).toEqual({ completedItems: ['item-1'], finalQuizPassed: true, finalQuizScore: 100 });
    const persisted = await ProgressModel.findOne({ organizationId: orgId, positionId, courseId }).lean();
    expect(persisted!.completedAt).toBeInstanceOf(Date);
  });

  it('тело запроса не может подменить решение сервера (регресс на дыру до 11.09.2026)', async () => {
    const courseId = await seedCourse({ finalQuiz: QUIZ });

    const res = await service.upsertProgress({
      organizationId: orgId,
      positionId,
      identityId,
      courseId,
      // `as never`: в UpsertProgressDto этих полей больше нет — эмулирует
      // обходной запрос мимо TypeScript, тот самый прежний контракт.
      data: { completedItems: [], finalQuizPassed: true, finalQuizScore: 100 } as never,
    });

    expect(res.finalQuizPassed).toBeUndefined();
    expect(res.finalQuizScore).toBeUndefined();
    const persisted = await ProgressModel.findOne({ organizationId: orgId, positionId, courseId }).lean();
    expect(persisted!.completedAt).toBeUndefined();
  });

  it('неверные ответы дают настоящий незачёт с настоящим счётом', async () => {
    const courseId = await seedCourse({ finalQuiz: QUIZ });

    const res = await service.upsertProgress({
      organizationId: orgId,
      positionId,
      identityId,
      courseId,
      data: { completedItems: [], finalQuizAnswers: [1, 0, 1] },
    });

    expect(res.finalQuizPassed).toBe(false);
    expect(res.finalQuizScore).toBe(0);
  });

  it('повторная сдача: провал после успеха обновляет passed/score, но не двигает дату первого завершения', async () => {
    const courseId = await seedCourse({ finalQuiz: QUIZ });

    await service.upsertProgress({
      organizationId: orgId,
      positionId,
      identityId,
      courseId,
      data: { completedItems: ['item-1'], finalQuizAnswers: [0, 1, 0] },
    });
    const firstCompletedAt = (await ProgressModel.findOne({ organizationId: orgId, positionId, courseId }).lean())!
      .completedAt;

    const retake = await service.upsertProgress({
      organizationId: orgId,
      positionId,
      identityId,
      courseId,
      data: { completedItems: ['item-1'], finalQuizAnswers: [1, 1, 1] },
    });

    expect(retake.finalQuizPassed).toBe(false);
    const afterRetake = await ProgressModel.findOne({ organizationId: orgId, positionId, courseId }).lean();
    expect(afterRetake!.completedAt?.getTime()).toBe(firstCompletedAt?.getTime());
  });

  it('отметка материала прочитанным после сдачи теста не сбрасывает результат теста', async () => {
    const courseId = await seedCourse({ finalQuiz: QUIZ, itemIds: ['item-1', 'item-2'] });

    await service.upsertProgress({
      organizationId: orgId,
      positionId,
      identityId,
      courseId,
      data: { completedItems: ['item-1'], finalQuizAnswers: [0, 1, 0] },
    });

    const res = await service.upsertProgress({
      organizationId: orgId,
      positionId,
      identityId,
      courseId,
      data: { completedItems: ['item-1', 'item-2'] },
    });

    expect(res).toEqual({
      completedItems: ['item-1', 'item-2'],
      finalQuizPassed: true,
      finalQuizScore: 100,
    });
  });

  it('курс без финального теста завершается прочтением всех материалов', async () => {
    const courseId = await seedCourse({ itemIds: ['item-1', 'item-2'], finalQuiz: undefined });

    const partial = await service.upsertProgress({
      organizationId: orgId,
      positionId,
      identityId,
      courseId,
      data: { completedItems: ['item-1'] },
    });
    expect((await ProgressModel.findOne({ organizationId: orgId, positionId, courseId }).lean())!.completedAt).toBeUndefined();
    expect(partial.finalQuizPassed).toBeUndefined();

    await service.upsertProgress({
      organizationId: orgId,
      positionId,
      identityId,
      courseId,
      data: { completedItems: ['item-1', 'item-2'] },
    });
    expect((await ProgressModel.findOne({ organizationId: orgId, positionId, courseId }).lean())!.completedAt).toBeInstanceOf(
      Date,
    );
  });

  it('несуществующий курс — NOT_FOUND, прогресс не создаётся', async () => {
    await expect(
      service.upsertProgress({
        organizationId: orgId,
        positionId,
        identityId,
        courseId: 'no-such-course',
        data: { completedItems: [] },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });

    expect(await ProgressModel.countDocuments({ courseId: 'no-such-course' })).toBe(0);
  });
});
