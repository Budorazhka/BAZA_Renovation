import type { AxiosInstance } from 'axios';

export type ApiContext = { api: AxiosInstance };

export interface HeartbeatResponse {
  lastSeenAt: string; // ISO8601
}

export interface OnlineUser {
  userId: string;
  email?: string;
  lastSeenAt: string;
}

export interface OnlineStatsDay {
  date: string; // YYYY-MM-DD
  minutes: number;
}

export function createOnlineMethods(ctx: ApiContext) {
  const { api } = ctx;

  return {
    /** Отправить heartbeat «я в сети» и опционально передать накопленные минуты за сегодня */
    heartbeat(minutesToday?: number): Promise<{ success: boolean; data: HeartbeatResponse }> {
      return api
        .post<{ success: boolean; data: HeartbeatResponse }>('/crm/online/heartbeat', {
          ...(typeof minutesToday === 'number' && minutesToday >= 0 ? { minutesToday } : {}),
        })
        .then((r) => r.data);
    },

    /** Список пользователей, считающихся онлайн (lastSeenAt не старше maxIdleMinutes) */
    getOnlineUsers(maxIdleMinutes?: number): Promise<{ success: boolean; data: { users: OnlineUser[] } }> {
      return api
        .get<{ success: boolean; data: { users: OnlineUser[] } }>('/crm/online/users', {
          params: maxIdleMinutes != null ? { maxIdleMinutes } : undefined,
        })
        .then((r) => r.data);
    },

    /** Статистика времени в сети по дням (from/to в формате YYYY-MM-DD) */
    getOnlineStats(params: {
      from: string;
      to: string;
      userId?: string;
    }): Promise<{ success: boolean; data: { stats: OnlineStatsDay[] } }> {
      return api
        .get<{ success: boolean; data: { stats: OnlineStatsDay[] } }>('/crm/online/stats', {
          params,
        })
        .then((r) => r.data);
    },
  };
}
