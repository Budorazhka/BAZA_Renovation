import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const patchMock = vi.fn();
const postMock = vi.fn();
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
        delete: deleteMock,
      };
    },
  },
}));

describe('communityApi service client', () => {
  beforeEach(() => {
    getMock.mockReset();
    patchMock.mockReset();
    postMock.mockReset();
    deleteMock.mockReset();
    axiosCreateConfigs.length = 0;
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('создаёт axios-инстанс с baseURL платформы и withCredentials: true', async () => {
    await import('@/services/communityApi');
    expect(axiosCreateConfigs.length).toBeGreaterThanOrEqual(1);
    const platformConfig = axiosCreateConfigs[0];
    expect(platformConfig.baseURL).toBe('http://localhost:3000');
    expect(platformConfig.withCredentials).toBe(true);
    expect(platformConfig.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('newIdempotencyKey генерирует уникальные ключи', async () => {
    const { newIdempotencyKey } = await import('@/services/communityApi');
    const key1 = newIdempotencyKey();
    const key2 = newIdempotencyKey();
    expect(key1).toBeTruthy();
    expect(key2).toBeTruthy();
    expect(key1).not.toBe(key2);
  });

  it('getSections() вызывает GET /api/v1/community/sections', async () => {
    const { communityApi } = await import('@/services/communityApi');
    const mockSections = [{ id: 'market', name: 'Аналитика' }];
    getMock.mockResolvedValueOnce({ data: { success: true, data: { sections: mockSections, groups: [] } } });

    const result = await communityApi.getSections();
    expect(getMock).toHaveBeenCalledWith('/api/v1/community/sections');
    expect(result).toEqual(mockSections);
  });

  it('createThread() отправляет POST /api/v1/community/threads с Idempotency-Key и маппит ответ API', async () => {
    const { communityApi } = await import('@/services/communityApi');
    const payload = {
      type: 'discussion' as const,
      sectionId: 'market',
      title: 'Новая тема',
      body: 'Текст обсуждения',
    };
    // Форма реального ответа community.controller.ts (toCommunityThreadDto):
    // reactionCount/createdAt/author, не reactions/createdAgo из мока.
    const raw = {
      id: 't-1',
      ...payload,
      excerpt: 'Текст обсуждения',
      authorId: '507f1f77bcf86cd799439011',
      author: { name: 'Никита Девелопер', company: 'ГК «Север»' },
      createdAt: new Date().toISOString(),
      views: 0,
      reactionCount: 3,
      replyCount: 0,
      tags: [],
      pinned: false,
      solved: false,
    };
    postMock.mockResolvedValueOnce({ data: { success: true, data: raw } });

    const result = await communityApi.createThread(payload, 'custom-idem-1');
    expect(postMock).toHaveBeenCalledWith(
      '/api/v1/community/threads',
      payload,
      expect.objectContaining({
        headers: expect.objectContaining({ 'idempotency-key': 'custom-idem-1' }),
      }),
    );
    expect(result.id).toBe('t-1');
    expect(result.body).toBe('Текст обсуждения');
    expect(result.author).toEqual({ name: 'Никита Девелопер', company: 'ГК «Север»' });
    expect(result.reactions).toBe(3);
    expect(result.createdAgo).toBe('только что');
  });

  it('createReply() отправляет POST /api/v1/community/threads/:id/replies с Idempotency-Key и маппит ответ API', async () => {
    const { communityApi } = await import('@/services/communityApi');
    const raw = {
      id: 'r-1',
      threadId: 't-1',
      body: 'Ответ',
      authorId: '507f1f77bcf86cd799439012',
      author: { name: 'Мария Ким', company: 'Сити Экспресс' },
      createdAt: new Date().toISOString(),
      reactionCount: 0,
      isBest: false,
    };
    postMock.mockResolvedValueOnce({ data: { success: true, data: raw } });

    const result = await communityApi.createReply('t-1', 'Ответ', 'custom-idem-reply');
    expect(postMock).toHaveBeenCalledWith(
      '/api/v1/community/threads/t-1/replies',
      { body: 'Ответ' },
      expect.objectContaining({
        headers: expect.objectContaining({ 'idempotency-key': 'custom-idem-reply' }),
      }),
    );
    expect(result.id).toBe('r-1');
    expect(result.body).toBe('Ответ');
    expect(result.author).toEqual({ name: 'Мария Ким', company: 'Сити Экспресс' });
    expect(result.reactions).toBe(0);
  });

  it('getThreads() маппит reactionCount → reactions, createdAt → createdAgo и сохраняет author (N-08)', async () => {
    const { communityApi } = await import('@/services/communityApi');
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    getMock.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          items: [
            {
              id: 't-2',
              type: 'discussion',
              sectionId: 'law',
              title: 'Вопрос по эскроу',
              excerpt: 'Краткое превью',
              body: 'Полный текст вопроса',
              authorId: '507f1f77bcf86cd799439013',
              author: { name: 'Георгий Мамедов', segment: 'broker' },
              createdAt: twoHoursAgo,
              views: 12,
              reactionCount: 5,
              replyCount: 2,
              tags: ['эскроу'],
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
          hasMore: false,
        },
      },
    });

    const result = await communityApi.getThreads({ pageSize: 20 });

    expect(result.items).toHaveLength(1);
    const thread = result.items[0]!;
    expect(thread.reactions).toBe(5);
    expect(thread.createdAgo).toBe('2 ч');
    expect(thread.author).toEqual({ name: 'Георгий Мамедов', segment: 'broker' });
    expect(thread.body).toBe('Полный текст вопроса');
  });

  it('getReplies() маппит reactionCount → reactions и сохраняет author (N-08)', async () => {
    const { communityApi } = await import('@/services/communityApi');
    getMock.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          items: [
            {
              id: 'r-2',
              threadId: 't-1',
              body: 'Ответ по делу',
              authorId: '507f1f77bcf86cd799439014',
              author: { name: 'Олег Панин', company: 'LegalPro' },
              createdAt: new Date().toISOString(),
              reactionCount: 7,
              isBest: true,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
          hasMore: false,
        },
      },
    });

    const result = await communityApi.getReplies('t-1');

    expect(result.items[0]!.reactions).toBe(7);
    expect(result.items[0]!.author).toEqual({ name: 'Олег Панин', company: 'LegalPro' });
    expect(result.items[0]!.isBest).toBe(true);
  });

  it('updateExchangeStatus() вызывает PATCH /api/v1/community/exchange/:id/status', async () => {
    const { communityApi } = await import('@/services/communityApi');
    patchMock.mockResolvedValueOnce({
      data: { success: true, data: { exchange: { status: 'closed' } } },
    });

    const result = await communityApi.updateExchangeStatus('ex-1', 'closed');
    expect(patchMock).toHaveBeenCalledWith(
      '/api/v1/community/exchange/ex-1/status',
      { status: 'closed' },
    );
    expect(result).toEqual({ status: 'closed' });
  });

  it('registerForEvent() вызывает POST /api/v1/community/events/:id/attend', async () => {
    const { communityApi } = await import('@/services/communityApi');
    postMock.mockResolvedValueOnce({
      data: { success: true, data: { attending: true, attendeeCount: 15 } },
    });

    const result = await communityApi.registerForEvent('ev-1');
    expect(postMock).toHaveBeenCalledWith('/api/v1/community/events/ev-1/attend');
    expect(result).toEqual({ registered: true, attendees: 15 });
  });
});
