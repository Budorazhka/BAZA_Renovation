import { useEffect, useRef, useCallback } from 'react';
import { onPush, offPush } from '../services/socket';
import type { PushEnvelope } from '../services/socket';
import type { Notification } from '../services/api';

export interface NotificationSyncOptions {
  onNotificationNew?: (notification: Notification) => void;
  onNotificationCountChanged?: (count: number) => void;
  onError?: (error: Error) => void;
}

export const useNotificationRealtimeSync = (options: NotificationSyncOptions) => {
  const listenersRef = useRef<Array<{ event: string; fn: (env: PushEnvelope<any>) => void }>>([]);
  const mountedRef = useRef(true);

  const subscribe = useCallback(<T,>(event: string, handler: (data: T) => void) => {
    const wrapped = (env: PushEnvelope<T>) => {
      try {
        if (env?.data) handler(env.data);
      } catch (e) {
        options.onError?.(e instanceof Error ? e : new Error(String(e)));
      }
    };
    const listener = onPush<T>(event, wrapped);
    listenersRef.current.push({ event, fn: listener });
    return listener;
  }, [options]);

  useEffect(() => {
    if (!mountedRef.current) return;

    subscribe<Notification>('notifications:new', (notification) => {
      if (mountedRef.current) options.onNotificationNew?.(notification);
    });

    subscribe<{ count: number }>('notifications:count', (data) => {
      if (mountedRef.current) options.onNotificationCountChanged?.(data.count);
    });

    return () => {
      mountedRef.current = false;
      listenersRef.current.forEach(({ event, fn }) => {
        offPush(event, fn);
      });
      listenersRef.current = [];
    };
  }, [subscribe, options]);
};
