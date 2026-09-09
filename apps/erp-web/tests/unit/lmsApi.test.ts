import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const patchMock = vi.fn();
const postMock = vi.fn();
const putMock = vi.fn();
const deleteMock = vi.fn();
const axiosCreateConfigs: Record<string, unknown>[] = [];

vi.mock('axios', () => ({
  default: {
    create: (config: Record<string, unknown>) => {
      axiosCreateConfigs.push(config);
      return {
        get: getMock,
        patch: patchMock,
        post: postMock,
        put: putMock,
        delete: deleteMock,
      };
    },
  },
}));

describe('lmsApi service client', () => {
  beforeEach(() => {
    getMock.mockReset();
    patchMock.mockReset();
    postMock.mockReset();
    putMock.mockReset();
    deleteMock.mockReset();
    axiosCreateConfigs.length = 0;
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('создаёт axios-инстанс с baseURL платформы и withCredentials: true', async () => {
    await import('@/services/lmsApi');
    expect(axiosCreateConfigs.length).toBeGreaterThanOrEqual(1);
    const platformConfig = axiosCreateConfigs[0];
    expect(platformConfig.baseURL).toBe('http://localhost:3000');
    expect(platformConfig.withCredentials).toBe(true);
    expect(platformConfig.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('newIdempotencyKey генерирует уникальные ключи', async () => {
    const { newIdempotencyKey } = await import('@/services/lmsApi');
    const key1 = newIdempotencyKey();
    const key2 = newIdempotencyKey();
    expect(key1).toBeTruthy();
    expect(key2).toBeTruthy();
    expect(key1).not.toBe(key2);
  });

  it('getItems() вызывает GET /api/v1/lms/items с параметрами и разворачивает data', async () => {
    const { lmsApi } = await import('@/services/lmsApi');
    const mockItems = [{ id: 'item-1', title: 'Скрипт звонка' }];
    getMock.mockResolvedValueOnce({ data: { success: true, data: mockItems } });

    const result = await lmsApi.getItems({ type: 'script', targetRole: 'manager' });
    expect(getMock).toHaveBeenCalledWith('/api/v1/lms/items', {
      params: { type: 'script', targetRole: 'manager' },
    });
    expect(result).toEqual(mockItems);
  });

  it('createItem() передаёт Idempotency-Key заголовок и POST /api/v1/lms/items', async () => {
    const { lmsApi } = await import('@/services/lmsApi');
    const input = {
      title: 'Новый материал',
      type: 'article' as const,
      description: 'Описание',
      targetRole: 'manager' as const,
      content: { type: 'article' as const, body: 'Текст' },
    };
    const createdItem = { id: 'created-1', ...input };
    postMock.mockResolvedValueOnce({ data: { success: true, data: createdItem } });

    const result = await lmsApi.createItem(input, 'test-key-123');
    expect(postMock).toHaveBeenCalledWith(
      '/api/v1/lms/items',
      input,
      expect.objectContaining({
        headers: expect.objectContaining({ 'idempotency-key': 'test-key-123' }),
      }),
    );
    expect(result).toEqual(createdItem);
  });

  it('updateItem() вызывает PATCH /api/v1/lms/items/:id', async () => {
    const { lmsApi } = await import('@/services/lmsApi');
    const updated = { id: 'item-1', title: 'Новый заголовок' };
    patchMock.mockResolvedValueOnce({ data: { success: true, data: updated } });

    const result = await lmsApi.updateItem('item-1', { title: 'Новый заголовок' });
    expect(patchMock).toHaveBeenCalledWith('/api/v1/lms/items/item-1', {
      title: 'Новый заголовок',
    });
    expect(result).toEqual(updated);
  });

  it('deleteItem() вызывает DELETE /api/v1/lms/items/:id', async () => {
    const { lmsApi } = await import('@/services/lmsApi');
    deleteMock.mockResolvedValueOnce({ data: { success: true, data: { deleted: true } } });

    const result = await lmsApi.deleteItem('item-1');
    expect(deleteMock).toHaveBeenCalledWith('/api/v1/lms/items/item-1');
    expect(result).toEqual({ deleted: true });
  });

  it('getCourses() вызывает GET /api/v1/lms/courses с фильтрами', async () => {
    const { lmsApi } = await import('@/services/lmsApi');
    const mockCourses = [{ id: 'course-1', title: 'Онбординг' }];
    getMock.mockResolvedValueOnce({ data: { success: true, data: mockCourses } });

    const result = await lmsApi.getCourses({ targetRole: 'manager' });
    expect(getMock).toHaveBeenCalledWith('/api/v1/lms/courses', {
      params: { targetRole: 'manager' },
    });
    expect(result).toEqual(mockCourses);
  });

  it('createCourse() передаёт Idempotency-Key заголовок и POST /api/v1/lms/courses', async () => {
    const { lmsApi } = await import('@/services/lmsApi');
    const input = {
      title: 'Курс новичка',
      description: 'Введение',
      emoji: '🎓',
      targetRoles: ['manager' as const],
      itemIds: ['item-1'],
    };
    const createdCourse = { id: 'course-1', ...input };
    postMock.mockResolvedValueOnce({ data: { success: true, data: createdCourse } });

    const result = await lmsApi.createCourse(input, 'course-key-456');
    expect(postMock).toHaveBeenCalledWith(
      '/api/v1/lms/courses',
      input,
      expect.objectContaining({
        headers: expect.objectContaining({ 'idempotency-key': 'course-key-456' }),
      }),
    );
    expect(result).toEqual(createdCourse);
  });

  it('updateCourse() вызывает PATCH /api/v1/lms/courses/:id', async () => {
    const { lmsApi } = await import('@/services/lmsApi');
    const updated = { id: 'course-1', title: 'Обновленный курс' };
    patchMock.mockResolvedValueOnce({ data: { success: true, data: updated } });

    const result = await lmsApi.updateCourse('course-1', { title: 'Обновленный курс' });
    expect(patchMock).toHaveBeenCalledWith('/api/v1/lms/courses/course-1', {
      title: 'Обновленный курс',
    });
    expect(result).toEqual(updated);
  });

  it('deleteCourse() вызывает DELETE /api/v1/lms/courses/:id', async () => {
    const { lmsApi } = await import('@/services/lmsApi');
    deleteMock.mockResolvedValueOnce({ data: { success: true, data: { deleted: true } } });

    const result = await lmsApi.deleteCourse('course-1');
    expect(deleteMock).toHaveBeenCalledWith('/api/v1/lms/courses/course-1');
    expect(result).toEqual({ deleted: true });
  });

  it('getProgress() вызывает GET /api/v1/lms/progress', async () => {
    const { lmsApi } = await import('@/services/lmsApi');
    const mockProgress = {
      'course-1': { completedItems: ['item-1'], finalQuizPassed: true, finalQuizScore: 85 },
    };
    getMock.mockResolvedValueOnce({ data: { success: true, data: mockProgress } });

    const result = await lmsApi.getProgress();
    expect(getMock).toHaveBeenCalledWith('/api/v1/lms/progress');
    expect(result).toEqual(mockProgress);
  });

  it('putProgress() вызывает PUT /api/v1/lms/progress/:courseId', async () => {
    const { lmsApi } = await import('@/services/lmsApi');
    const entry = { completedItems: ['item-1'], finalQuizPassed: true, finalQuizScore: 90 };
    putMock.mockResolvedValueOnce({ data: { success: true, data: entry } });

    const result = await lmsApi.putProgress('course-1', entry);
    expect(putMock).toHaveBeenCalledWith('/api/v1/lms/progress/course-1', entry);
    expect(result).toEqual(entry);
  });

  it('deleteProgress() вызывает DELETE /api/v1/lms/progress/:courseId', async () => {
    const { lmsApi } = await import('@/services/lmsApi');
    deleteMock.mockResolvedValueOnce({ data: { success: true, data: { deleted: true } } });

    const result = await lmsApi.deleteProgress('course-1');
    expect(deleteMock).toHaveBeenCalledWith('/api/v1/lms/progress/course-1');
    expect(result).toEqual({ deleted: true });
  });
});
