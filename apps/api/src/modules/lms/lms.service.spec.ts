import { Types } from 'mongoose';
import { LmsService } from './lms.service';
import { ErrorCode } from '../../shared/errors/error-codes';
import type { LmsItemRepository } from './repository/lms-item.repository';
import type { LmsCourseRepository } from './repository/lms-course.repository';
import type { LmsProgressRepository } from './repository/lms-progress.repository';
import type { IdempotencyService } from '../../shared/idempotency/idempotency.service';
import type { OutboxService } from '../outbox/outbox.service';
import type { LmsItemDocument } from './schemas/lms-item.schema';
import type { LmsCourseDocument } from './schemas/lms-course.schema';
import type { LmsProgressDocument } from './schemas/lms-progress.schema';

function makeTransactionConnection() {
  return {
    startSession: jest.fn().mockResolvedValue({
      withTransaction: async (work: () => Promise<unknown>) => work(),
      endSession: jest.fn().mockResolvedValue(undefined),
    }),
  };
}

interface MockItemRepo {
  listForOrganization: jest.Mock;
  findByIdForOrganization: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  seedSystemItemsIfEmpty: jest.Mock;
}

interface MockCourseRepo {
  listForOrganization: jest.Mock;
  findByIdForOrganization: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  seedSystemCoursesIfEmpty: jest.Mock;
}

interface MockProgressRepo {
  getProgressMapForPosition: jest.Mock;
  upsertProgress: jest.Mock;
  deleteProgress: jest.Mock;
}

interface MockIdempotencyService {
  checkReplay: jest.Mock;
  record: jest.Mock;
}

interface MockOutboxService {
  publish: jest.Mock;
}

describe('LmsService', () => {
  let service: LmsService;
  let itemRepo: MockItemRepo;
  let courseRepo: MockCourseRepo;
  let progressRepo: MockProgressRepo;
  let idempotencyService: MockIdempotencyService;
  let outboxService: MockOutboxService;

  const orgId = new Types.ObjectId();
  const positionId = new Types.ObjectId();
  const identityId = new Types.ObjectId();

  beforeEach(() => {
    itemRepo = {
      listForOrganization: jest.fn(),
      findByIdForOrganization: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      seedSystemItemsIfEmpty: jest.fn().mockResolvedValue(undefined),
    };
    courseRepo = {
      listForOrganization: jest.fn(),
      findByIdForOrganization: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      seedSystemCoursesIfEmpty: jest.fn().mockResolvedValue(undefined),
    };
    progressRepo = {
      getProgressMapForPosition: jest.fn(),
      upsertProgress: jest.fn(),
      deleteProgress: jest.fn(),
    };
    idempotencyService = {
      checkReplay: jest.fn().mockResolvedValue(null),
      record: jest.fn().mockResolvedValue(undefined),
    };
    outboxService = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    service = new LmsService(
      makeTransactionConnection() as never,
      itemRepo as unknown as LmsItemRepository,
      courseRepo as unknown as LmsCourseRepository,
      progressRepo as unknown as LmsProgressRepository,
      idempotencyService as unknown as IdempotencyService,
      outboxService as unknown as OutboxService,
    );
  });

  describe('Items (Материалы библиотеки)', () => {
    it('listItems возвращает список материалов, обогащенных DTO', async () => {
      const mockDoc = {
        itemId: 'art-intro',
        type: 'article',
        title: 'Инструкция',
        description: 'Описание',
        targetRole: 'manager',
        readTime: '5 мин',
        tags: ['CRM'],
        content: { type: 'article', body: 'Текст' },
        isSystem: true,
      } as unknown as LmsItemDocument;
      itemRepo.listForOrganization.mockResolvedValue([mockDoc]);

      const result = await service.listItems(orgId);
      expect(result).toEqual([
        {
          id: 'art-intro',
          type: 'article',
          title: 'Инструкция',
          description: 'Описание',
          targetRole: 'manager',
          readTime: '5 мин',
          tags: ['CRM'],
          content: { type: 'article', body: 'Текст' },
          isSystem: true,
        },
      ]);
    });

    it('createItem требует Idempotency-Key и сохраняет ответ', async () => {
      await expect(
        service.createItem({
          organizationId: orgId,
          positionId,
          identityId,
          idempotencyKey: '',
          data: {
            type: 'script',
            title: 'Новый скрипт',
            description: 'Тест',
            content: { type: 'script', lines: [] },
          },
        }),
      ).rejects.toMatchObject({ code: ErrorCode.IDEMPOTENCY_KEY_REQUIRED });

      const mockCreated = {
        itemId: 'generated-id-123',
        type: 'script',
        title: 'Новый скрипт',
        description: 'Тест',
        targetRole: 'all',
        tags: [],
        content: { type: 'script', lines: [] },
        isSystem: false,
      } as unknown as LmsItemDocument;
      itemRepo.create.mockResolvedValue(mockCreated);

      const created = await service.createItem({
        organizationId: orgId,
        positionId,
        identityId,
        idempotencyKey: 'idem-key-1',
        data: {
          type: 'script',
          title: 'Новый скрипт',
          description: 'Тест',
          content: { type: 'script', lines: [] },
        },
      });

      expect(created.id).toBe('generated-id-123');
      expect(idempotencyService.record).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'idem-key-1', responseStatus: 201 }),
        expect.anything(),
      );
    });

    it('updateItem запрещает редактирование системных шаблонов', async () => {
      itemRepo.findByIdForOrganization.mockResolvedValue({
        itemId: 'art-crm-intro',
        isSystem: true,
      } as unknown as LmsItemDocument);

      await expect(
        service.updateItem('art-crm-intro', orgId, { title: 'Попытка взлома' }),
      ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
    });

    it('deleteItem запрещает удаление системных материалов', async () => {
      itemRepo.findByIdForOrganization.mockResolvedValue({
        itemId: 'art-crm-intro',
        isSystem: true,
      } as unknown as LmsItemDocument);

      await expect(
        service.deleteItem('art-crm-intro', orgId),
      ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
    });
  });

  describe('Courses (Курсы)', () => {
    it('listCourses возвращает курсы с валидацией структуры', async () => {
      const mockCourse = {
        courseId: 'course-manager-base',
        title: 'Курс менеджера',
        description: 'Описание курса',
        targetRoles: ['manager'],
        emoji: '🎯',
        itemIds: ['art-crm-intro'],
        finalQuiz: {
          passingScore: 70,
          questions: [{ question: 'В SLA?', options: ['15 мин'], correct: 0 }],
        },
        isSystem: true,
      } as unknown as LmsCourseDocument;
      courseRepo.listForOrganization.mockResolvedValue([mockCourse]);

      const result = await service.listCourses(orgId);
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('course-manager-base');
      expect(result[0]!.finalQuiz?.passingScore).toBe(70);
    });

    it('createCourse с idempotency-key сохраняет курс', async () => {
      const mockCourse = {
        courseId: 'custom-course-1',
        title: 'Спецкурс агентства',
        description: 'Описание',
        targetRoles: ['all'],
        emoji: '⭐',
        itemIds: ['art-intro'],
        isSystem: false,
      } as unknown as LmsCourseDocument;
      courseRepo.create.mockResolvedValue(mockCourse);

      const created = await service.createCourse({
        organizationId: orgId,
        positionId,
        identityId,
        idempotencyKey: 'idem-course-1',
        data: {
          title: 'Спецкурс агентства',
          description: 'Описание',
          itemIds: ['art-intro'],
        },
      });

      expect(created.id).toBe('custom-course-1');
      expect(idempotencyService.record).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'idem-course-1', responseStatus: 201 }),
        expect.anything(),
      );
    });
  });

  describe('Progress (Прогресс ученика): тест проверяется сервером, не клиентом', () => {
    const quizCourse = {
      courseId: 'course-manager-base',
      itemIds: ['art-crm-intro'],
      finalQuiz: {
        passingScore: 70,
        questions: [
          { question: 'В1', options: ['a', 'b'], correct: 0 },
          { question: 'В2', options: ['a', 'b'], correct: 1 },
          { question: 'В3', options: ['a', 'b'], correct: 0 },
        ],
      },
    } as unknown as LmsCourseDocument;

    beforeEach(() => {
      courseRepo.findByIdForOrganization.mockResolvedValue(quizCourse);
      progressRepo.upsertProgress.mockImplementation(async (params) => ({
        _id: new Types.ObjectId(),
        courseId: params.courseId,
        completedItems: params.completedItems,
        finalQuizPassed: params.quizGrade?.passed,
        finalQuizScore: params.quizGrade?.score,
      } as unknown as LmsProgressDocument));
    });

    it('верные ответы: сервер сам считает score/passed и публикует LmsCourseCompleted', async () => {
      const res = await service.upsertProgress({
        organizationId: orgId,
        positionId,
        identityId,
        courseId: 'course-manager-base',
        data: { completedItems: ['art-crm-intro'], finalQuizAnswers: [0, 1, 0] },
        correlationId: 'test-corr-1',
      });

      expect(res.finalQuizPassed).toBe(true);
      expect(res.finalQuizScore).toBe(100);
      expect(progressRepo.upsertProgress).toHaveBeenCalledWith(
        expect.objectContaining({ quizGrade: { score: 100, passed: true } }),
        expect.anything(),
      );
      expect(outboxService.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'LmsCourseCompleted',
          payload: expect.objectContaining({ courseId: 'course-manager-base', finalQuizScore: 100 }),
        }),
        expect.anything(),
      );
    });

    it('присланный finalQuizPassed:true без верных ответов не защитывает тест (регресс на дыру до 11.09.2026)', async () => {
      const res = await service.upsertProgress({
        organizationId: orgId,
        positionId,
        identityId,
        courseId: 'course-manager-base',
        // finalQuizPassed/finalQuizScore в DTO больше нет вовсе — `as never`
        // эмулирует именно старый обходной запрос мимо типов TS.
        data: { completedItems: [], finalQuizPassed: true, finalQuizScore: 100 } as never,
        correlationId: 'test-corr-2',
      });

      expect(res.finalQuizPassed).toBeUndefined();
      expect(outboxService.publish).not.toHaveBeenCalled();
    });

    it('неверные ответы: passed false с реальным счётом, не с придуманным', async () => {
      const res = await service.upsertProgress({
        organizationId: orgId,
        positionId,
        identityId,
        courseId: 'course-manager-base',
        data: { completedItems: [], finalQuizAnswers: [1, 1, 1] },
        correlationId: 'test-corr-3',
      });

      expect(res.finalQuizPassed).toBe(false);
      expect(res.finalQuizScore).toBe(33);
      expect(outboxService.publish).not.toHaveBeenCalled();
    });

    it('без finalQuizAnswers (отметили материал прочитанным) — grade не пересчитывается', async () => {
      await service.upsertProgress({
        organizationId: orgId,
        positionId,
        identityId,
        courseId: 'course-manager-base',
        data: { completedItems: ['art-crm-intro'] },
        correlationId: 'test-corr-4',
      });

      expect(progressRepo.upsertProgress).toHaveBeenCalledWith(
        expect.objectContaining({ quizGrade: undefined }),
        expect.anything(),
      );
      expect(outboxService.publish).not.toHaveBeenCalled();
    });

    it('курс без финального теста считается пройденным по всем материалам', async () => {
      courseRepo.findByIdForOrganization.mockResolvedValue({
        courseId: 'course-no-quiz',
        itemIds: ['art-1', 'art-2'],
        finalQuiz: undefined,
      } as unknown as LmsCourseDocument);

      await service.upsertProgress({
        organizationId: orgId,
        positionId,
        identityId,
        courseId: 'course-no-quiz',
        data: { completedItems: ['art-1', 'art-2'] },
        correlationId: 'test-corr-5',
      });

      expect(progressRepo.upsertProgress).toHaveBeenCalledWith(
        expect.objectContaining({ allItemsCompletedWithoutQuiz: true }),
        expect.anything(),
      );
    });

    it('несуществующий courseId — NOT_FOUND, прогресс не пишется', async () => {
      courseRepo.findByIdForOrganization.mockResolvedValue(null);

      await expect(
        service.upsertProgress({
          organizationId: orgId,
          positionId,
          identityId,
          courseId: 'no-such-course',
          data: { completedItems: [] },
        }),
      ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
      expect(progressRepo.upsertProgress).not.toHaveBeenCalled();
    });

    it('getProgress возвращает карту прогресса сотрудника', async () => {
      progressRepo.getProgressMapForPosition.mockResolvedValue({
        'course-manager-base': {
          completedItems: ['art-crm-intro'],
          finalQuizPassed: false,
        },
      });

      const map = await service.getProgress(orgId, positionId);
      expect(map['course-manager-base']?.completedItems).toEqual(['art-crm-intro']);
    });
  });
});
