import { useEffect, useRef, useCallback } from 'react';
import { onPush, offPush, subscribeRooms, fetchReplay } from '../services/socket';
import type { PushEnvelope } from '../services/socket';
import type { Task, Lead, Notification, CalendarEvent } from '../services/api';

export interface RealtimeSyncOptions {
  onTaskCreated?: (task: Task) => void;
  onTaskUpdated?: (task: Task) => void;
  onTaskDeleted?: (id: string) => void;
  onLeadCreated?: (lead: Lead) => void;
  onLeadUpdated?: (lead: Lead) => void;
  onLeadDeleted?: (id: string) => void;
  onNotificationNew?: (notification: Notification) => void;
  onNotificationCountChanged?: (count: number) => void;
  onTaskStatsChanged?: (stats: { total: number; completed: number; overdue: number }) => void;
  onCalendarEventCreated?: (event: CalendarEvent) => void;
  onCalendarEventUpdated?: (event: CalendarEvent) => void;
  onCalendarEventDeleted?: (id: string) => void;
  onError?: (error: Error) => void;
}

export const useRealtimeSync = (options: RealtimeSyncOptions) => {
  const listenersRef = useRef<Array<{ event: string; fn: (env: PushEnvelope<any>) => void }>>([]);
  const mountedRef = useRef(true);

  // Wrapper для подписки с обработкой ошибок
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

    const setupSubscriptions = async () => {
      try {
        // Подписываемся на push-события
        subscribe<Task>('tasks:created', (task) => {
          if (mountedRef.current) options.onTaskCreated?.(task);
        });

        subscribe<Task>('tasks:updated', (task) => {
          if (mountedRef.current) options.onTaskUpdated?.(task);
        });

        subscribe<{ id: string }>('tasks:deleted', (data) => {
          if (mountedRef.current) options.onTaskDeleted?.(data.id);
        });

        subscribe<{ total: number; completed: number; overdue: number }>('tasks:stats', (stats) => {
          if (mountedRef.current) options.onTaskStatsChanged?.(stats);
        });

        subscribe<Lead>('crm:leads:created', (lead) => {
          if (mountedRef.current) options.onLeadCreated?.(lead);
        });

        subscribe<Lead>('crm:leads:updated', (lead) => {
          if (mountedRef.current) options.onLeadUpdated?.(lead);
        });

        subscribe<{ id: string }>('crm:leads:deleted', (data) => {
          if (mountedRef.current) options.onLeadDeleted?.(data.id);
        });

        subscribe<Notification>('notifications:new', (notification) => {
          if (mountedRef.current) options.onNotificationNew?.(notification);
        });

        subscribe<{ count: number }>('notifications:count', (data) => {
          if (mountedRef.current) options.onNotificationCountChanged?.(data.count);
        });

        // Подписываемся на события календаря
        subscribe<CalendarEvent>('calendar:events:created', (event) => {
          if (mountedRef.current) options.onCalendarEventCreated?.(event);
        });

        subscribe<CalendarEvent>('calendar:events:updated', (event) => {
          if (mountedRef.current) options.onCalendarEventUpdated?.(event);
        });

        subscribe<{ id: string }>('calendar:events:deleted', (data) => {
          if (mountedRef.current) options.onCalendarEventDeleted?.(data.id);
        });

        // Пытаемся получить давние события (если было отключение)
        try {
          const replay = await fetchReplay({ limit: 50, onlyMine: true });
          if (mountedRef.current && Array.isArray(replay)) {
            for (const { event, envelope } of replay) {
              if (event === 'tasks:created') options.onTaskCreated?.(envelope.data);
              if (event === 'tasks:updated') options.onTaskUpdated?.(envelope.data);
              if (event === 'tasks:deleted') options.onTaskDeleted?.(envelope.data?.id);
              if (event === 'crm:leads:created') options.onLeadCreated?.(envelope.data);
              if (event === 'crm:leads:updated') options.onLeadUpdated?.(envelope.data);
              if (event === 'crm:leads:deleted') options.onLeadDeleted?.(envelope.data?.id);
              if (event === 'notifications:new') options.onNotificationNew?.(envelope.data);
              if (event === 'notifications:count') options.onNotificationCountChanged?.(envelope.data?.count);
              if (event === 'calendar:events:created') options.onCalendarEventCreated?.(envelope.data);
              if (event === 'calendar:events:updated') options.onCalendarEventUpdated?.(envelope.data);
              if (event === 'calendar:events:deleted') options.onCalendarEventDeleted?.(envelope.data?.id);
            }
          }
        } catch (e) {
          // Replay - optional, не критично если упал
          console.warn('Replay fetch failed:', e);
        }
      } catch (e) {
        options.onError?.(e instanceof Error ? e : new Error(String(e)));
      }
    };

    setupSubscriptions();

    return () => {
      mountedRef.current = false;
      listenersRef.current.forEach(({ event, fn }) => {
        offPush(event, fn);
      });
      listenersRef.current = [];
    };
  }, [subscribe, options]);

  return {
    subscribeToRooms: subscribeRooms,
  };
};
