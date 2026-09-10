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

  it('createThread() отправляет POST /api/v1/community/threads с Idempotency-Key', async () => {
    const { communityApi } = await import('@/services/communityApi');
    const payload = {
      type: 'general' as const,
      sectionId: 'market',
      title: 'Новая тема',
      body: 'Текст обсуждения',
    };
    const created = { id: 't-1', ...payload };
    postMock.mockResolvedValueOnce({ data: { success: true, data: created } });

    const result = await communityApi.createThread(payload, 'custom-idem-1');
    expect(postMock).toHaveBeenCalledWith(
      '/api/v1/community/threads',
      payload,
      expect.objectContaining({
        headers: expect.objectContaining({ 'idempotency-key': 'custom-idem-1' }),
      }),
    );
    expect(result).toEqual(created);
  });

  it('createReply() отправляет POST /api/v1/community/threads/:id/replies с Idempotency-Key', async () => {
    const { communityApi } = await import('@/services/communityApi');
    const created = { id: 'r-1', threadId: 't-1', body: 'Ответ' };
    postMock.mockResolvedValueOnce({ data: { success: true, data: created } });

    const result = await communityApi.createReply('t-1', 'Ответ', 'custom-idem-reply');
    expect(postMock).toHaveBeenCalledWith(
      '/api/v1/community/threads/t-1/replies',
      { body: 'Ответ' },
      expect.objectContaining({
        headers: expect.objectContaining({ 'idempotency-key': 'custom-idem-reply' }),
      }),
    );
    expect(result).toEqual(created);
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
