import axios from 'axios';
import { PLATFORM_API_BASE_URL } from '@/config/backend';
import {
  type ExchangeIntent,
  type ExchangeSide,
  type ExchangeStatus,
  type ForumMember,
  type ForumReply,
  type ForumSection,
  type ForumThread,
  type ForumEvent,
  type ThreadType,
} from '@/components/community/forum/forumData';

// ─── Axios client ─────────────────────────────────────────────────────────────

const api = axios.create({
  baseURL: PLATFORM_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

export function newIdempotencyKey(): string {
  const globalCrypto = typeof window !== 'undefined' ? window.crypto : (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID();
  }
  return `community-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

function emptyPage<T>(page?: number, pageSize?: number): PaginatedData<T> {
  return { items: [], total: 0, page: page ?? 1, pageSize: pageSize ?? 20, hasMore: false };
}

// ─── Чтение: реальный вызов, честный пустой результат при ошибке ──────────────
// В отличие от мутаций (см. ниже), для чтения допустимо показать "нет данных"
// вместо падения экрана — но НЕ моки, выдаваемые за реальные данные. Раньше
// здесь был общий withFallback с постоянным кэшем "API доступен/недоступен",
// который после первой ошибки (в т.ч. 400 из-за расхождения параметров с
// бэкендом) навсегда переключал ВСЕ вызовы, включая мутации, на локальные
// моки — пользователь видел "опубликовано", а данные не сохранялись.

async function safeGet<T>(request: () => Promise<T>, fallback: T, context: string): Promise<T> {
  try {
    return await request();
  } catch (error) {
    console.warn(`[community] ${context}: не удалось загрузить, показываю пустое состояние`, error);
    return fallback;
  }
}

function paginate<T>(items: T[], page: number, pageSize: number): PaginatedData<T> {
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    page,
    pageSize,
    hasMore: start + pageSize < items.length,
  };
}

// ─── API ────────────────────────────────────────────────────────────────────

export const communityApi = {
  // ─── Разделы ────────────────────────────────────────────────────────────────

  getSections: () =>
    safeGet(
      () =>
        api
          .get<ApiResponse<{ sections: ForumSection[]; groups: unknown[] } | ForumSection[]>>(
            '/api/v1/community/sections',
          )
          .then((r) => {
            const data = r.data.data;
            if (Array.isArray(data)) return data;
            if (data && 'sections' in data && Array.isArray(data.sections)) return data.sections;
            return [];
          }),
      [] as ForumSection[],
      'getSections',
    ),

  getSectionById: (id: string) =>
    safeGet(
      () =>
        api
          .get<ApiResponse<ForumSection>>(`/api/v1/community/sections/${id}`)
          .then((r) => r.data.data),
      null as ForumSection | null,
      'getSectionById',
    ),

  // ─── Темы (треды) ────────────────────────────────────────────────────────────

  getThreads: (params?: {
    section?: string;
    type?: ThreadType;
    search?: string;
    sort?: 'active' | 'new' | 'unanswered';
    page?: number;
    pageSize?: number;
  }) =>
    safeGet(
      () =>
        api
          .get<ApiResponse<PaginatedData<ForumThread>>>('/api/v1/community/threads', {
            // Бэкенд (ListCommunityThreadsQueryDto) ждёт `section`, не `sectionId` —
            // раньше здесь уходил `sectionId`, ValidationPipe с
            // forbidNonWhitelisted отклонял его 400-й, и любое чтение тредов
            // уходило в fallback.
            params: {
              section: params?.section,
              type: params?.type,
              search: params?.search,
              sort: params?.sort,
              page: params?.page,
              pageSize: params?.pageSize,
            },
          })
          .then((r) => r.data.data),
      emptyPage<ForumThread>(params?.page, params?.pageSize),
      'getThreads',
    ),

  getThreadById: (id: string) =>
    safeGet(
      () =>
        api
          .get<ApiResponse<ForumThread>>(`/api/v1/community/threads/${id}`)
          .then((r) => r.data.data),
      null as ForumThread | null,
      'getThreadById',
    ),

  // ─── Мутации: без отката на моки — ошибка должна долететь до UI ────────────
  // Раньше withFallback на любой ошибке (в т.ч. неверные query-параметры) тихо
  // возвращал "оптимистичный" локальный мок, будто запись прошла, и мутировал
  // общий модульный THREADS/REPLIES массив — пользователь видел "опубликовано",
  // а на сервере ничего не было. Теперь ошибка пробрасывается вызывающему коду.

  createThread: (
    data: {
      type: ThreadType;
      sectionId: string;
      title: string;
      body: string;
      tags?: string[];
      exchange?: {
        intent: ExchangeIntent;
        side: ExchangeSide;
        dealKind: string;
        location: string;
        amount: string;
        commission?: string;
        deadline?: string;
      };
    },
    idempotencyKey?: string,
  ) =>
    api
      .post<ApiResponse<ForumThread>>('/api/v1/community/threads', data, {
        headers: { 'idempotency-key': idempotencyKey || newIdempotencyKey() },
      })
      .then((r) => r.data.data),

  updateThread: (id: string, data: Partial<Pick<ForumThread, 'title' | 'pinned' | 'solved'>>) =>
    api
      .patch<ApiResponse<ForumThread>>(`/api/v1/community/threads/${id}`, data)
      .then((r) => r.data.data),

  deleteThread: (id: string) =>
    api
      .delete<ApiResponse<{ success: boolean }>>(`/api/v1/community/threads/${id}`)
      .then((r) => r.data.data),

  pinThread: (id: string, pinned: boolean) =>
    api
      .patch<ApiResponse<ForumThread>>(`/api/v1/community/threads/${id}/pin`, { pinned })
      .then((r) => r.data.data),

  // ─── Ответы ──────────────────────────────────────────────────────────────────

  getReplies: (threadId: string, params?: { page?: number; pageSize?: number; sort?: string }) =>
    safeGet(
      () =>
        api
          .get<ApiResponse<PaginatedData<ForumReply>>>(`/api/v1/community/threads/${threadId}/replies`, { params })
          .then((r) => r.data.data),
      emptyPage<ForumReply>(params?.page, params?.pageSize),
      'getReplies',
    ),

  createReply: (threadId: string, body: string, idempotencyKey?: string) =>
    api
      .post<ApiResponse<ForumReply>>(
        `/api/v1/community/threads/${threadId}/replies`,
        { body },
        { headers: { 'idempotency-key': idempotencyKey || newIdempotencyKey() } },
      )
      .then((r) => r.data.data),

  updateReply: (id: string, body: string) =>
    api
      .patch<ApiResponse<ForumReply>>(`/api/v1/community/replies/${id}`, { body })
      .then((r) => r.data.data),

  deleteReply: (id: string) =>
    api
      .delete<ApiResponse<{ success: boolean }>>(`/api/v1/community/replies/${id}`)
      .then((r) => r.data.data),

  setBestReply: (threadId: string, replyId: string) =>
    api
      .patch<ApiResponse<ForumReply>>(`/api/v1/community/replies/${replyId}/accept`, { threadId })
      .then((r) => {
        const reply = r.data.data;
        return {
          replyId,
          isBest: reply?.isBest ?? true,
          threadSolved: true,
        };
      }),

  // ─── Реакции ────────────────────────────────────────────────────────────────

  toggleThreadReaction: (threadId: string) =>
    api
      .post<ApiResponse<{ reacted?: boolean; hasLiked?: boolean; reactions?: number; reactionCount?: number }>>(
        `/api/v1/community/threads/${threadId}/like`,
      )
      .then((r) => {
        const data = r.data.data;
        const reactionCount = data?.reactionCount ?? data?.reactions ?? 0;
        const reacted = data?.reacted ?? data?.hasLiked ?? false;
        return { reacted, reactionCount };
      }),

  toggleReplyReaction: (replyId: string) =>
    api
      .post<ApiResponse<{ reacted?: boolean; hasLiked?: boolean; reactions?: number; reactionCount?: number }>>(
        `/api/v1/community/replies/${replyId}/like`,
      )
      .then((r) => {
        const data = r.data.data;
        const reactionCount = data?.reactionCount ?? data?.reactions ?? 0;
        const reacted = data?.reacted ?? data?.hasLiked ?? false;
        return { reacted, reactionCount };
      }),

  // ─── Участники ──────────────────────────────────────────────────────────────

  getMembers: (params?: {
    sort?: 'trust' | 'activity' | 'reactions' | 'joined';
    segment?: string;
    role?: string;
    search?: string;
    inactive?: boolean;
    page?: number;
    pageSize?: number;
  }) =>
    safeGet(
      () =>
        api.get<ApiResponse<ForumMember[]>>('/api/v1/community/leaderboard').then((r) => {
          let items = Array.isArray(r.data.data) ? [...r.data.data] : [];
          if (params?.segment) items = items.filter((m) => m.segment === params.segment);
          if (params?.role) items = items.filter((m) => m.role === params.role);
          if (params?.search) {
            const q = params.search.toLowerCase();
            items = items.filter((m) => m.name.toLowerCase().includes(q));
          }
          if (params?.sort === 'trust') items.sort((a, b) => b.trustIndex - a.trustIndex);
          else if (params?.sort === 'reactions') items.sort((a, b) => b.reactionsReceived - a.reactionsReceived);
          return paginate(items, params?.page ?? 1, params?.pageSize ?? 20);
        }),
      emptyPage<ForumMember>(params?.page, params?.pageSize),
      'getMembers',
    ),

  getMemberById: (id: string) =>
    safeGet(
      () =>
        api.get<ApiResponse<ForumMember[]>>('/api/v1/community/leaderboard').then((r) => {
          const members = Array.isArray(r.data.data) ? r.data.data : [];
          return members.find((m) => m.id === id) ?? null;
        }),
      null as ForumMember | null,
      'getMemberById',
    ),

  getMemberThreads: (memberId: string, params?: { page?: number; pageSize?: number }) =>
    safeGet(
      () =>
        api
          .get<ApiResponse<PaginatedData<ForumThread>>>('/api/v1/community/threads', {
            // Бэкенд не умеет фильтровать треды по автору (ListCommunityThreadsQueryDto
            // такого поля не знает) — тянем более широкую страницу реальных
            // тредов и фильтруем на клиенте, а не подставляем локальный мок.
            params: { pageSize: 200 },
          })
          .then((r) => {
            const items = (r.data.data?.items ?? []).filter((t) => t.authorId === memberId);
            return paginate(items, params?.page ?? 1, params?.pageSize ?? 20);
          }),
      emptyPage<ForumThread>(params?.page, params?.pageSize),
      'getMemberThreads',
    ),

  // ─── Мероприятия ────────────────────────────────────────────────────────────

  getEvents: (params?: { format?: 'online' | 'offline' }) =>
    safeGet(
      () =>
        api
          .get<ApiResponse<{ items: ForumEvent[]; total: number } | ForumEvent[]>>('/api/v1/community/events')
          .then((r) => {
            const data = r.data.data;
            let items: ForumEvent[] = Array.isArray(data)
              ? data
              : data && 'items' in data && Array.isArray(data.items)
                ? data.items
                : [];
            // ListCommunityEventsQueryDto не знает ни `status`, ни `format` —
            // фильтруем на клиенте по полю, которое реально есть в ForumEvent.
            if (params?.format) items = items.filter((e) => e.format === params.format);
            return items;
          }),
      [] as ForumEvent[],
      'getEvents',
    ),

  registerForEvent: (eventId: string) =>
    api
      .post<ApiResponse<{ attending: boolean; attendeeCount: number }>>(`/api/v1/community/events/${eventId}/attend`)
      .then((r) => ({
        registered: r.data.data.attending,
        attendees: r.data.data.attendeeCount,
      })),

  // ─── Теги ───────────────────────────────────────────────────────────────────

  getTrendingTags: (_limit = 5) => {
    // /api/v1/community/tags/trending не существует в community.controller.ts
    // на бэкенде — раньше 404 тихо подменялся константными тегами из мока.
    // Честно возвращаем пусто, ничего не запрашивая.
    return Promise.resolve([] as Array<{ tag: string; count: number }>);
  },

  // ─── Биржа ──────────────────────────────────────────────────────────────────

  getExchangeBoard: (params?: {
    intentGroup?: 'sale' | 'rent' | 'cobroking' | 'service';
    side?: ExchangeSide;
  }) =>
    safeGet(
      () =>
        api
          .get<ApiResponse<PaginatedData<ForumThread>>>('/api/v1/community/exchange', {
            // Бэкенд знает `exchangeSide`/`exchangeIntent`, а не `side`/`intentGroup` —
            // `intentGroup` (группа из нескольких intent) на бэкенде не
            // существует вовсе, группируем на клиенте по реальным данным.
            params: { exchangeSide: params?.side },
          })
          .then((r) => {
            const GROUP_OF: Record<ExchangeIntent, string> = {
              buy_seek: 'sale',
              sale_offer: 'sale',
              rent_seek: 'rent',
              rent_offer: 'rent',
              client_handover: 'cobroking',
              partner_seek: 'cobroking',
              service_offer: 'service',
            };
            let items = r.data.data?.items ?? [];
            if (params?.intentGroup) {
              items = items.filter((t) => t.exchange && GROUP_OF[t.exchange.intent] === params.intentGroup);
            }
            const demand = items.filter((t) => t.exchange?.side === 'demand');
            const supply = items.filter((t) => t.exchange?.side === 'supply');
            return { demand, supply, total: r.data.data?.total ?? items.length };
          }),
      { demand: [] as ForumThread[], supply: [] as ForumThread[], total: 0 },
      'getExchangeBoard',
    ),

  updateExchangeStatus: (threadId: string, status: ExchangeStatus) =>
    api
      .patch<ApiResponse<ForumThread>>(`/api/v1/community/exchange/${threadId}/status`, { status })
      .then((r) => ({ status: (r.data.data?.exchange?.status as ExchangeStatus) ?? status })),

  // ─── Поиск ──────────────────────────────────────────────────────────────────

  search: (q: string, params?: { page?: number; pageSize?: number }) =>
    safeGet(
      () =>
        api
          .get<ApiResponse<PaginatedData<ForumThread>>>('/api/v1/community/threads', {
            // `type: 'threads' | 'members' | 'all'` раньше уходил напрямую в query
            // `type`, а бэкенд трактует `type` как ThreadType (discussion/question/…)
            // — 'all' там не значение enum, 400. Поиск по участникам бэкенд не
            // поддерживает вовсе (leaderboard без query), возвращаем честно [].
            params: { search: q, page: params?.page, pageSize: params?.pageSize },
          })
          .then((r) => ({
            threads: r.data.data?.items ?? [],
            members: [] as ForumMember[],
            total: r.data.data?.total ?? 0,
          })),
      { threads: [] as ForumThread[], members: [] as ForumMember[], total: 0 },
      'search',
    ),

  // ─── Статистика ─────────────────────────────────────────────────────────────

  getStats: () => {
    // /api/v1/community/stats не существует в community.controller.ts —
    // раньше 404 тихо подменялся числами, посчитанными по локальному моку.
    // Честно возвращаем нули, ничего не запрашивая. Не используется нигде в
    // текущем UI.
    return Promise.resolve({
      totalMembers: 0,
      activeLast7Days: 0,
      avgEngagement: 0,
      plannedEvents: 0,
      atRiskMembers: 0,
      totalThreads: 0,
      totalReplies: 0,
      solvedQuestions: 0,
    });
  },

  // ─── Текущий пользователь ───────────────────────────────────────────────────

  /** identityId берёт вызывающий компонент из auth-контекста (useAuth), не localStorage. */
  getCurrentUser: (identityId?: string) => {
    if (!identityId) return Promise.resolve(null as ForumMember | null);
    return safeGet(
      () =>
        api.get<ApiResponse<ForumMember[]>>('/api/v1/community/leaderboard').then((r) => {
          const members = Array.isArray(r.data.data) ? r.data.data : [];
          return members.find((m) => m.id === identityId) ?? null;
        }),
      null as ForumMember | null,
      'getCurrentUser',
    );
  },
};
