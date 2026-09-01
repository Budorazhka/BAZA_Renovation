import { useEffect, useRef, useCallback } from 'react';
import { onPush, offPush } from '../services/socket';
import type { PushEnvelope } from '../services/socket';
import type { CalendarEvent } from '../services/api';
import { apiService, UserRole } from '../services/api';
import { useSocketConnection } from './useSocketConnection';

export interface CalendarSyncOptions {
  userId?: string;
  userRole?: UserRole;
  currentDate: Date;
  onEventsUpdated?: (events: CalendarEvent[]) => void;
  onError?: (error: Error) => void;
  fallbackInterval?: number; // Интервал для HTTP fallback в миллисекундах (по умолчанию 5000)
}

export const useCalendarRealtimeSync = (options: CalendarSyncOptions) => {
  const { isConnected, mode } = useSocketConnection();
  const listenersRef = useRef<Array<{ event: string; fn: (env: PushEnvelope<any>) => void }>>([]);
  const mountedRef = useRef(true);
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFetchRef = useRef<Date | null>(null);

  const loadEvents = useCallback(async (): Promise<CalendarEvent[]> => {
    if (!options.userId) return [];

    try {
      const year = options.currentDate.getFullYear();
      const month = options.currentDate.getMonth();
      const start = new Date(year, month, 1, 0, 0, 0);
      const end = new Date(year, month + 1, 0, 23, 59, 59);

      const unifiedResponse = await apiService.getCalendarUnified({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        userId: options.userId,
        userRole: options.userRole,
      });

      let allEvents: CalendarEvent[] = [];

      if (unifiedResponse.success && unifiedResponse.data) {
        const calendarEvents = unifiedResponse.data.events || [];
        allEvents = [...calendarEvents];

        // Преобразуем задачи в события календаря, если нужно
        if (unifiedResponse.data.tasks && unifiedResponse.data.tasks.length > 0) {
          const taskEvents = unifiedResponse.data.tasks
            .filter((task: any) => task.startDate)
            .map((task: any) => {
              const startDate = new Date(task.startDate);
              let endDate: Date;
              if (task.endDate) {
                endDate = new Date(task.endDate);
                if (isNaN(endDate.getTime())) {
                  endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
                }
              } else {
                endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
              }

              return {
                _id: task._id,
                title: task.title,
                description: task.description,
                startTime: startDate.toISOString(),
                endTime: endDate.toISOString(),
                type: 'task' as any,
                status: task.status === 'completed' ? ('completed' as any) : ('scheduled' as any),
                isAllDay: false,
                taskId: task.taskId || task._id,
              } as CalendarEvent;
            })
            .filter((event: CalendarEvent | null): event is CalendarEvent => event !== null);

          allEvents = [...allEvents, ...taskEvents];
        }
      }

      lastFetchRef.current = new Date();
      return allEvents;
    } catch (err) {
      console.error('Error loading calendar events:', err);
      options.onError?.(err instanceof Error ? err : new Error(String(err)));
      return [];
    }
  }, [options.userId, options.userRole, options.currentDate, options.onError]);

  // WebSocket подписка
  useEffect(() => {
    if (!mountedRef.current || !isConnected) return;

    // Используем loadEvents из замыкания
    const refreshEvents = () => {
      if (!mountedRef.current) return;
      loadEvents().then((events) => {
        if (mountedRef.current) {
          options.onEventsUpdated?.(events);
        }
      });
    };

    // Обработчик для WebSocket событий
    const handleEvent = (_env: PushEnvelope<any>) => {
      refreshEvents();
    };

    try {
      // Подписываемся на события календаря через WebSocket
      const createdListener = onPush<any>('calendar:events:created', handleEvent);
      listenersRef.current.push({ event: 'calendar:events:created', fn: createdListener });

      const updatedListener = onPush<any>('calendar:events:updated', handleEvent);
      listenersRef.current.push({ event: 'calendar:events:updated', fn: updatedListener });

      const deletedListener = onPush<{ id: string }>('calendar:events:deleted', handleEvent);
      listenersRef.current.push({ event: 'calendar:events:deleted', fn: deletedListener });

      // Также подписываемся на изменения задач, так как они могут быть в календаре
      const taskCreatedListener = onPush<any>('tasks:created', handleEvent);
      listenersRef.current.push({ event: 'tasks:created', fn: taskCreatedListener });

      const taskUpdatedListener = onPush<any>('tasks:updated', handleEvent);
      listenersRef.current.push({ event: 'tasks:updated', fn: taskUpdatedListener });

      const taskDeletedListener = onPush<{ id: string }>('tasks:deleted', handleEvent);
      listenersRef.current.push({ event: 'tasks:deleted', fn: taskDeletedListener });
    } catch (e) {
      console.error('Failed to subscribe to calendar events:', e);
      options.onError?.(e instanceof Error ? e : new Error(String(e)));
    }

    return () => {
      listenersRef.current.forEach(({ event, fn }) => {
        offPush(event, fn);
      });
      listenersRef.current = [];
    };
  }, [isConnected, loadEvents, options]);

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

    const poll = async () => {
      if (!mountedRef.current) return;
      const events = await loadEvents();
      if (mountedRef.current) {
        options.onEventsUpdated?.(events);
      }
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
  }, [isConnected, loadEvents, options]);

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

  return {
    mode,
    isConnected,
    loadEvents, // Экспортируем для ручной загрузки при необходимости
  };
};

