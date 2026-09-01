import { useEffect, useRef, useCallback } from 'react';
import { onPush, offPush } from '../services/socket';
import type { PushEnvelope } from '../services/socket';
import type { Lead } from '../services/api';
import { useSocketConnection } from './useSocketConnection';

export interface LeadRealtimeSyncOptions {
  onLeadCreated?: (lead: Lead) => void;
  onLeadUpdated?: (lead: Lead) => void;
  onLeadDeleted?: (id: string) => void;
  onLeadsReload?: () => void; // Callback для перезагрузки лидов через HTTP
  onError?: (error: Error) => void;
  fallbackInterval?: number; // Интервал для HTTP fallback в миллисекундах (по умолчанию 5000)
}

export const useLeadRealtimeSync = (options: LeadRealtimeSyncOptions) => {
  const { isConnected } = useSocketConnection();
  const listenersRef = useRef<Array<{ event: string; fn: (env: PushEnvelope<any>) => void }>>([]);
  const mountedRef = useRef(true);
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const subscribe = useCallback(
    <T,>(event: string, handler: (data: T) => void) => {
      const wrapped = (env: PushEnvelope<T>) => {
        try {
          if (env?.data && mountedRef.current) handler(env.data);
        } catch (e) {
          options.onError?.(e instanceof Error ? e : new Error(String(e)));
        }
      };
      const listener = onPush<T>(event, wrapped);
      listenersRef.current.push({ event, fn: listener });
      return listener;
    },
    [options]
  );

  // WebSocket подписка
  useEffect(() => {
    if (!mountedRef.current || !isConnected) return;

    subscribe<Lead>('crm:leads:created', (lead) => {
      if (mountedRef.current) options.onLeadCreated?.(lead);
    });

    subscribe<Lead>('crm:leads:updated', (lead) => {
      if (mountedRef.current) options.onLeadUpdated?.(lead);
    });

    subscribe<{ id: string }>('crm:leads:deleted', (data) => {
      if (mountedRef.current) options.onLeadDeleted?.(data.id);
    });

    return () => {
      listenersRef.current.forEach(({ event, fn }) => {
        offPush(event, fn);
      });
      listenersRef.current = [];
    };
  }, [subscribe, options, isConnected]);

  // HTTP Fallback polling
  useEffect(() => {
    if (!mountedRef.current || isConnected) {
      // Очищаем интервал если подключены через WebSocket
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
      return;
    }

    // Если не подключены через WebSocket, используем HTTP polling
    const interval = options.fallbackInterval || 5000;

    const poll = () => {
      if (!mountedRef.current) return;
      options.onLeadsReload?.();
    };

    // Первая загрузка
    poll();

    // Настраиваем интервал
    fallbackIntervalRef.current = setInterval(poll, interval);

    return () => {
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
    };
  }, [isConnected, options]);

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
      listenersRef.current.forEach(({ event, fn }) => {
        offPush(event, fn);
      });
      listenersRef.current = [];
    };
  }, []);
};

