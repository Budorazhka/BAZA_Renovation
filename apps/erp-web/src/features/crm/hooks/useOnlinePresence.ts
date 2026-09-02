import { useEffect, useRef, useCallback } from 'react';
import { apiService } from '../services/api';

/** Интервал отправки heartbeat и учёта одной минуты в сети (мс) */
const HEARTBEAT_INTERVAL_MS = 60 * 1000;

/** Порог (мс), после которого вкладка считается неактивной для учёта минут (опционально) */
const IDLE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Отслеживает онлайн-присутствие пользователя:
 * - при видимой вкладке раз в минуту отправляет heartbeat и передаёт 1 минуту в сеть;
 * - при скрытии вкладки отправляет последний heartbeat и останавливает учёт.
 * Требует авторизации (JWT). Подключать только когда пользователь залогинен.
 */
export function useOnlinePresence(enabled: boolean = true) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const clearHeartbeatInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const sendHeartbeat = useCallback((minutesToday: number) => {
    apiService.heartbeat(minutesToday).catch(() => {
      // Тихо игнорируем ошибки (сеть/бэкенд недоступен)
    });
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined' || !enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        lastActivityRef.current = Date.now();
        sendHeartbeat(0);
        clearHeartbeatInterval();
        intervalRef.current = setInterval(() => {
          const now = Date.now();
          const idle = now - lastActivityRef.current;
          const minutesToAdd = idle >= IDLE_THRESHOLD_MS ? 0 : 1;
          if (minutesToAdd > 0) lastActivityRef.current = now;
          sendHeartbeat(minutesToAdd);
        }, HEARTBEAT_INTERVAL_MS);
      } else {
        clearHeartbeatInterval();
        sendHeartbeat(0);
      }
    };

    if (document.visibilityState === 'visible') {
      sendHeartbeat(0);
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const idle = now - lastActivityRef.current;
        const minutesToAdd = idle >= IDLE_THRESHOLD_MS ? 0 : 1;
        if (minutesToAdd > 0) lastActivityRef.current = now;
        sendHeartbeat(minutesToAdd);
      }, HEARTBEAT_INTERVAL_MS);
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearHeartbeatInterval();
    };
  }, [enabled, sendHeartbeat, clearHeartbeatInterval]);

  // Обновляем lastActivity при действиях пользователя (опционально, для учёта "idle")
  useEffect(() => {
    if (!enabled) return;
    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };
    window.addEventListener('focus', updateActivity);
    window.addEventListener('mousemove', updateActivity);
    window.addEventListener('keydown', updateActivity);
    window.addEventListener('click', updateActivity);
    return () => {
      window.removeEventListener('focus', updateActivity);
      window.removeEventListener('mousemove', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('click', updateActivity);
    };
  }, [enabled]);
}
