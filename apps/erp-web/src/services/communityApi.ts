import axios from 'axios';
import { CRM_API_BASE_URL } from '@/config/backend';
import {
  EVENTS,
  MEMBERS,
  REPLIES,
  SECTIONS,
  THREADS,
  TRENDING_TAGS,
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
  baseURL: CRM_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

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

// ─── API availability cache ───────────────────────────────────────────────────
// Once we confirm the API is available, never fall back to mocks again.

let _apiAvailable: boolean | null = null;

async function checkApiAvailable(): Promise<boolean> {
  if (_apiAvailable !== null) return _apiAvailable;
  try {
    const resp = await api.get('/api/community/sections', { timeout: 5000 });
    _apiAvailable = resp.status >= 200 && resp.status < 300;
  } catch {
    _apiAvailable = false;
  }
  return _apiAvailable;
}

async function withFallback<T>(apiCall: () => Promise<T>, fallback: T): Promise<T> {
  const available = await checkApiAvailable();
  if (!available) return fallback;
  try {
    return await apiCall();
  } catch {
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

// ─── Sections ─────────────────────────────────────────────────────────────────

export const communityApi = {
  getSections: () =>
    withFallback(
      () => api.get<ApiResponse<ForumSection[]>>('/api/community/sections').then((r) => r.data.data),
      SECTIONS,
    ).then((s) => (Array.isArray(s) ? s : SECTIONS)),

  getSectionById: (id: string) =>
    withFallback(
      () => api.get<ApiResponse<ForumSection>>(`/api/community/sections/${id}`).then((r) => r.data.data),
      SECTIONS.find((s) => s.id === id) ?? null,
    ),

  // ─── Threads ────────────────────────────────────────────────────────────────

  getThreads: (params?: {
    section?: string;
    type?: ThreadType;
    authorId?: string;
    search?: string;
    sort?: 'active' | 'new' | 'unanswered';
    page?: number;
    pageSize?: number;
  }) =>
    withFallback(
      () =>
        api
          .get<ApiResponse<PaginatedData<ForumThread>>>('/api/community/threads', { params })
          .then((r) => r.data.data),
      (() => {
        let items = [...THREADS];
        if (params?.section) items = items.filter((t) => t.sectionId === params.section);
        if (params?.type) items = items.filter((t) => t.type === params.type);
        if (params?.authorId) items = items.filter((t) => t.authorId === params.authorId);
        if (params?.search) {
          const q = params.search.toLowerCase();
          items = items.filter(
            (t) => t.title.toLowerCase().includes(q) || t.excerpt.toLowerCase().includes(q),
          );
        }
        // pinned first
        items.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
        if (params?.sort === 'unanswered') items = items.filter((t) => t.replyCount === 0);
        return paginate(items, params?.page ?? 1, params?.pageSize ?? 20);
      })(),
    ),

  getThreadById: (id: string) =>
    withFallback(
      () =>
        api.get<ApiResponse<ForumThread>>(`/api/community/threads/${id}`).then((r) => r.data.data),
      THREADS.find((t) => t.id === id) ?? null,
    ),

  createThread: (data: {
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
  }) =>
    withFallback(
      () =>
        api
          .post<ApiResponse<ForumThread>>('/api/community/threads', data)
          .then((r) => r.data.data),
      // Optimistic mock — return a local thread
      (() => {
        const newThread: ForumThread = {
          id: `t${Date.now()}`,
          type: data.type,
          sectionId: data.sectionId,
          title: data.title,
          excerpt: data.body.slice(0, 200),
          authorId: 'm5', // ME_ID
          createdAgo: 'только что',
          lastActiveAgo: 'только что',
          views: 0,
          reactions: 0,
          replyCount: 0,
          tags: data.tags ?? [],
          exchange: data.exchange
            ? {
                ...data.exchange,
                status: 'open' as ExchangeStatus,
              }
            : undefined,
        };
        THREADS.unshift(newThread);
        return newThread;
      })(),
    ),

  updateThread: (id: string, data: Partial<Pick<ForumThread, 'title' | 'pinned' | 'solved'>>) =>
    withFallback(
      () =>
        api
          .patch<ApiResponse<ForumThread>>(`/api/community/threads/${id}`, data)
          .then((r) => r.data.data),
      (() => {
        const t = THREADS.find((t) => t.id === id);
        if (t) Object.assign(t, data);
        return t ?? null;
      })(),
    ),

  deleteThread: (id: string) =>
    withFallback(
      () =>
        api
          .delete<ApiResponse<{ success: boolean }>>(`/api/community/threads/${id}`)
          .then((r) => r.data.data),
      (() => {
        const idx = THREADS.findIndex((t) => t.id === id);
        if (idx !== -1) THREADS.splice(idx, 1);
        return { success: true };
      })(),
    ),

  pinThread: (id: string, pinned: boolean) =>
    withFallback(
      () =>
        api
          .patch<ApiResponse<ForumThread>>(`/api/community/threads/${id}`, { pinned })
          .then((r) => r.data.data),
      (() => {
        const t = THREADS.find((t) => t.id === id);
        if (t) t.pinned = pinned;
        return t ?? null;
      })(),
    ),

  // ─── Replies ────────────────────────────────────────────────────────────────

  getReplies: (threadId: string, params?: { page?: number; pageSize?: number; sort?: string }) =>
    withFallback(
      () =>
        api
          .get<ApiResponse<PaginatedData<ForumReply>>>(`/api/community/threads/${threadId}/replies`, { params })
          .then((r) => r.data.data),
      (() => {
        let items = REPLIES.filter((r) => r.threadId === threadId);
        if (params?.sort === 'best_first') {
          items = [...items].sort((a, b) => Number(Boolean(b.isBest)) - Number(Boolean(a.isBest)));
        }
        return paginate(items, params?.page ?? 1, params?.pageSize ?? 50);
      })(),
    ),

  createReply: (threadId: string, body: string) =>
    withFallback(
      () =>
        api
          .post<ApiResponse<ForumReply>>(`/api/community/threads/${threadId}/replies`, { body })
          .then((r) => r.data.data),
      (() => {
        const reply: ForumReply = {
          id: `r${Date.now()}`,
          threadId,
          authorId: 'm5',
          createdAgo: 'только что',
          reactions: 0,
          body,
        };
        REPLIES.push(reply);
        const thread = THREADS.find((t) => t.id === threadId);
        if (thread) thread.replyCount++;
        return reply;
      })(),
    ),

  updateReply: (id: string, body: string) =>
    withFallback(
      () =>
        api
          .patch<ApiResponse<ForumReply>>(`/api/community/replies/${id}`, { body })
          .then((r) => r.data.data),
      (() => {
        const r = REPLIES.find((r) => r.id === id);
        if (r) r.body = body;
        return r ?? null;
      })(),
    ),

  deleteReply: (id: string) =>
    withFallback(
      () =>
        api
          .delete<ApiResponse<{ success: boolean }>>(`/api/community/replies/${id}`)
          .then((r) => r.data.data),
      (() => {
        const idx = REPLIES.findIndex((r) => r.id === id);
        if (idx !== -1) {
          const reply = REPLIES[idx];
          const thread = THREADS.find((t) => t.id === reply.threadId);
          if (thread) thread.replyCount--;
          REPLIES.splice(idx, 1);
        }
        return { success: true };
      })(),
    ),

  setBestReply: (threadId: string, replyId: string) =>
    withFallback(
      () =>
        api
          .patch<ApiResponse<{ replyId: string; isBest: boolean; threadSolved: boolean }>>(
            `/api/community/threads/${threadId}/best-reply`,
            { replyId },
          )
          .then((r) => r.data.data),
      (() => {
        const thread = THREADS.find((t) => t.id === threadId);
        const replies = REPLIES.filter((r) => r.threadId === threadId);
        const target = replies.find((r) => r.id === replyId);
        if (!target) return { replyId, isBest: false, threadSolved: false };

        const wasBest = target.isBest;
        // Reset all
        replies.forEach((r) => (r.isBest = false));
        if (!wasBest) {
          target.isBest = true;
          if (thread) thread.solved = true;
        } else {
          if (thread) thread.solved = false;
        }
        return { replyId, isBest: !wasBest, threadSolved: !wasBest };
      })(),
    ),

  // ─── Reactions ──────────────────────────────────────────────────────────────

  toggleThreadReaction: (threadId: string) =>
    withFallback(
      () =>
        api
          .post<ApiResponse<{ reacted: boolean; reactionCount: number }>>(
            `/api/community/threads/${threadId}/reactions`,
            { type: 'like' },
          )
          .then((r) => r.data.data),
      (() => {
        const t = THREADS.find((t) => t.id === threadId);
        if (!t) return { reacted: false, reactionCount: 0 };
        t.reactions++;
        return { reacted: true, reactionCount: t.reactions };
      })(),
    ),

  toggleReplyReaction: (replyId: string) =>
    withFallback(
      () =>
        api
          .post<ApiResponse<{ reacted: boolean; reactionCount: number }>>(
            `/api/community/replies/${replyId}/reactions`,
            { type: 'like' },
          )
          .then((r) => r.data.data),
      (() => {
        const r = REPLIES.find((r) => r.id === replyId);
        if (!r) return { reacted: false, reactionCount: 0 };
        r.reactions++;
        return { reacted: true, reactionCount: r.reactions };
      })(),
    ),

  // ─── Members ────────────────────────────────────────────────────────────────

  getMembers: (params?: {
    sort?: 'trust' | 'activity' | 'reactions' | 'joined';
    segment?: string;
    role?: string;
    search?: string;
    inactive?: boolean;
    page?: number;
    pageSize?: number;
  }) =>
    withFallback(
      () =>
        api
          .get<ApiResponse<PaginatedData<ForumMember>>>('/api/community/members', { params })
          .then((r) => r.data.data),
      (() => {
        let items = [...MEMBERS];
        if (params?.segment) items = items.filter((m) => m.segment === params.segment);
        if (params?.role) items = items.filter((m) => m.role === params.role);
        if (params?.search) {
          const q = params.search.toLowerCase();
          items = items.filter((m) => m.name.toLowerCase().includes(q));
        }
        if (params?.sort === 'trust') items.sort((a, b) => b.trustIndex - a.trustIndex);
        else if (params?.sort === 'reactions') items.sort((a, b) => b.reactionsReceived - a.reactionsReceived);
        else items.sort((a, b) => b.trustIndex - a.trustIndex);
        return paginate(items, params?.page ?? 1, params?.pageSize ?? 20);
      })(),
    ),

  getMemberById: (id: string) =>
    withFallback(
      () =>
        api.get<ApiResponse<ForumMember>>(`/api/community/members/${id}`).then((r) => r.data.data),
      MEMBERS.find((m) => m.id === id) ?? null,
    ),

  getMemberThreads: (memberId: string, params?: { page?: number; pageSize?: number }) =>
    withFallback(
      () =>
        api
          .get<ApiResponse<PaginatedData<ForumThread>>>(`/api/community/members/${memberId}/threads`, { params })
          .then((r) => r.data.data),
      (() => {
        const items = THREADS.filter((t) => t.authorId === memberId);
        return paginate(items, params?.page ?? 1, params?.pageSize ?? 20);
      })(),
    ),

  // ─── Events ─────────────────────────────────────────────────────────────────

  getEvents: (params?: { status?: 'planned' | 'done'; format?: 'online' | 'offline' }) =>
    withFallback(
      () =>
        api
          .get<ApiResponse<ForumEvent[]>>('/api/community/events', { params })
          .then((r) => r.data.data),
      (() => {
        const items = [...EVENTS];
        return items;
      })(),
    ).then((e) => (Array.isArray(e) ? e : [])),

  registerForEvent: (eventId: string) =>
    withFallback(
      () =>
        api
          .post<ApiResponse<{ registered: boolean; attendees: number }>>(
            `/api/community/events/${eventId}/register`,
          )
          .then((r) => r.data.data),
      { registered: true, attendees: 0 },
    ),

  // ─── Tags ───────────────────────────────────────────────────────────────────

  getTrendingTags: (limit = 5) =>
    withFallback(
      () =>
        api
          .get<ApiResponse<Array<{ tag: string; count: number }>>>('/api/community/tags/trending', {
            params: { limit },
          })
          .then((r) => r.data.data),
      TRENDING_TAGS.slice(0, limit),
    ).then((t) => (Array.isArray(t) ? t : [])),

  // ─── Exchange ───────────────────────────────────────────────────────────────

  getExchangeBoard: (params?: {
    intentGroup?: 'sale' | 'rent' | 'cobroking' | 'service';
    side?: ExchangeSide;
  }) =>
    withFallback(
      () =>
        api
          .get<ApiResponse<{ demand: ForumThread[]; supply: ForumThread[]; total: number }>>(
            '/api/community/exchange/board',
            { params },
          )
          .then((r) => r.data.data),
      (() => {
        const GROUP_OF: Record<ExchangeIntent, string> = {
          buy_seek: 'sale',
          sale_offer: 'sale',
          rent_seek: 'rent',
          rent_offer: 'rent',
          client_handover: 'cobroking',
          partner_seek: 'cobroking',
          service_offer: 'service',
        };
        const SIDE: Record<ExchangeIntent, ExchangeSide> = {
          rent_seek: 'demand',
          buy_seek: 'demand',
          partner_seek: 'demand',
          client_handover: 'supply',
          rent_offer: 'supply',
          sale_offer: 'supply',
          service_offer: 'supply',
        };
        let items = THREADS.filter((t) => t.type === 'exchange' && t.exchange);
        if (params?.intentGroup) {
          items = items.filter((t) => t.exchange && GROUP_OF[t.exchange.intent] === params.intentGroup);
        }
        const demand = items.filter((t) => t.exchange && SIDE[t.exchange.intent] === 'demand');
        const supply = items.filter((t) => t.exchange && SIDE[t.exchange.intent] === 'supply');
        return { demand, supply, total: items.length };
      })(),
    ).then((r) => ({
      demand: Array.isArray(r?.demand) ? r.demand : [],
      supply: Array.isArray(r?.supply) ? r.supply : [],
      total: r?.total ?? 0,
    })),

  updateExchangeStatus: (threadId: string, status: ExchangeStatus) =>
    withFallback(
      () =>
        api
          .patch<ApiResponse<{ status: ExchangeStatus }>>(
            `/api/community/threads/${threadId}/exchange/status`,
            { status },
          )
          .then((r) => r.data.data),
      (() => {
        const t = THREADS.find((t) => t.id === threadId);
        if (t?.exchange) t.exchange.status = status;
        return { status };
      })(),
    ),

  // ─── Search ─────────────────────────────────────────────────────────────────

  search: (q: string, params?: { type?: 'threads' | 'members' | 'all'; page?: number; pageSize?: number }) =>
    withFallback(
      () =>
        api
          .get<ApiResponse<{ threads: ForumThread[]; members: ForumMember[]; total: number }>>(
            '/api/community/search',
            { params: { q, ...params } },
          )
          .then((r) => r.data.data),
      (() => {
        const ql = q.toLowerCase();
        const threads = THREADS.filter(
          (t) => t.title.toLowerCase().includes(ql) || t.excerpt.toLowerCase().includes(ql),
        );
        const members = MEMBERS.filter((m) => m.name.toLowerCase().includes(ql));
        return { threads, members, total: threads.length + members.length };
      })(),
    ),

  // ─── Stats ──────────────────────────────────────────────────────────────────

  getStats: () =>
    withFallback(
      () =>
        api
          .get<ApiResponse<{
            totalMembers: number;
            activeLast7Days: number;
            avgEngagement: number;
            plannedEvents: number;
            atRiskMembers: number;
            totalThreads: number;
            totalReplies: number;
            solvedQuestions: number;
          }>>('/api/community/stats')
          .then((r) => r.data.data),
      {
        totalMembers: MEMBERS.length,
        activeLast7Days: MEMBERS.filter((m) => m.lastActiveLabel === 'сегодня' || m.lastActiveLabel.includes('ч')).length,
        avgEngagement: Math.round(MEMBERS.reduce((s, m) => s + m.trustIndex, 0) / MEMBERS.length),
        plannedEvents: EVENTS.filter((e) => e.registrationOpen).length,
        atRiskMembers: 2,
        totalThreads: THREADS.length,
        totalReplies: REPLIES.length,
        solvedQuestions: THREADS.filter((t) => t.solved).length,
      },
    ),

  // ─── Current user ───────────────────────────────────────────────────────────

  getCurrentUser: () => {
    const userId = localStorage.getItem('userId') || 'm5';
    return withFallback(
      () =>
        api.get<ApiResponse<ForumMember>>(`/api/community/members/${userId}`).then((r) => r.data.data),
      MEMBERS.find((m) => m.id === userId) ?? MEMBERS.find((m) => m.id === 'm5')!,
    );
  },

  // ─── API status ─────────────────────────────────────────────────────────────

  isApiAvailable: () => checkApiAvailable(),
};
