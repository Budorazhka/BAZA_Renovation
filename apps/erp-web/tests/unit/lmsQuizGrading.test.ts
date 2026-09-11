import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * До 11.09.2026 `setFinalQuizResult` отправляла на сервер уже готовые
 * `finalQuizPassed`/`finalQuizScore`, посчитанные в браузере — сервер
 * сохранял их без проверки. Теперь на сервер уходят только сырые ответы
 * (`finalQuizAnswers`), а что засчитано — решает он сам
 * (LmsService.upsertProgress, apps/api). Эти тесты проверяют форму запроса,
 * которую строит клиент, не серверную логику (она покрыта
 * apps/api/src/modules/lms/lms.service.spec.ts и
 * apps/api/test/integration/lms-quiz-grading.integration-spec.ts).
 */

const putProgressMock = vi.fn().mockResolvedValue({ completedItems: [], finalQuizPassed: true, finalQuizScore: 100 });

vi.mock('@/services/lmsApi', () => ({
  lmsApi: {
    putProgress: putProgressMock,
    getProgress: vi.fn().mockResolvedValue({}),
    deleteProgress: vi.fn().mockResolvedValue({ deleted: true }),
  },
}));

describe('lms progress: что уходит на сервер при попытке теста', () => {
  beforeEach(() => {
    putProgressMock.mockClear();
    vi.resetModules();
  });

  it('setFinalQuizResult отправляет finalQuizAnswers по порядку вопросов, не готовый passed/score', async () => {
    const { setFinalQuizResult } = await import('@/components/lms/progress');

    // Ключи объекта отданы не по порядку намеренно — на выходе должен быть
    // массив, отсортированный по номеру вопроса, а не по порядку вставки.
    setFinalQuizResult('course-1', true, 100, { 2: 0, 0: 1, 1: 0 });
    await Promise.resolve();

    expect(putProgressMock).toHaveBeenCalledWith('course-1', {
      completedItems: [],
      finalQuizAnswers: [1, 0, 0],
    });
    // Именно то, что реально выбрал учащийся — не локально посчитанные passed/score.
    const [, payload] = putProgressMock.mock.calls[0]!;
    expect(payload).not.toHaveProperty('finalQuizPassed');
    expect(payload).not.toHaveProperty('finalQuizScore');
  });

  it('setItemCompleted (отметка материала) не отправляет finalQuizAnswers — не трогает результат теста', async () => {
    const { setItemCompleted } = await import('@/components/lms/progress');

    setItemCompleted('course-1', 'item-1', true);
    await Promise.resolve();

    expect(putProgressMock).toHaveBeenCalledWith('course-1', { completedItems: ['item-1'] });
    const [, payload] = putProgressMock.mock.calls[0]!;
    expect(payload).not.toHaveProperty('finalQuizAnswers');
  });
});
