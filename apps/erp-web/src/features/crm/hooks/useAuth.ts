import { useState, useEffect, useCallback, useRef } from 'react';
import { apiService, UserRole } from '../services/api';

const TOKEN_LIFETIME_MS = 7 * 60 * 60 * 1000; // 7 часов
const REFRESH_BUFFER_MS = 60 * 1000; // пытаться обновить за минуту до конца
const MIN_REFRESH_DELAY_MS = 5 * 1000; // минимум 5 секунд ожидания до триггера

interface AuthOptions {
  portalCode?: string;
}

interface AuthResult {
  success: boolean;
  message?: string;
}

interface UseAuthReturn {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: { id: string; role: UserRole } | null;
  login: (email: string, password?: string, options?: AuthOptions) => Promise<AuthResult>;
  logout: () => void;
}

export const useAuth = (): UseAuthReturn => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<{ id: string; role: UserRole } | null>(null);

  const refreshTimerRef = useRef<number | null>(null);
  const refreshHandlerRef = useRef<() => void>(() => {});

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const clearStoredAuthData = useCallback(() => {
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('user_data');
    localStorage.removeItem('userId');
    localStorage.removeItem('user_email');
    localStorage.removeItem('portal_code');
    localStorage.removeItem('jwt_obtained_at');
  }, []);

  const scheduleRefresh = useCallback(
    (obtainedAt: number) => {
      const normalizedAt = obtainedAt || Date.now();
      const elapsed = Date.now() - normalizedAt;
      const remaining = TOKEN_LIFETIME_MS - elapsed;

      if (remaining <= 0) {
        refreshHandlerRef.current?.();
        return;
      }

      const delay = Math.max(remaining - REFRESH_BUFFER_MS, MIN_REFRESH_DELAY_MS);
      clearRefreshTimer();
      if (typeof window === 'undefined') {
        return;
      }

      refreshTimerRef.current = window.setTimeout(() => {
        refreshHandlerRef.current?.();
      }, delay);
    },
    [clearRefreshTimer]
  );

  const logout = useCallback(() => {
    clearRefreshTimer();
    clearStoredAuthData();
    setIsAuthenticated(false);
    setUser(null);
  }, [clearRefreshTimer, clearStoredAuthData]);

  const authenticate = useCallback(
    async (email: string, password?: string, options?: AuthOptions): Promise<AuthResult> => {
      try {
        const response = await apiService.login(email, password);

        if (response.success && response.data) {
          const now = Date.now();
          localStorage.setItem('user_email', email);
          if (options?.portalCode?.trim()) {
            localStorage.setItem('portal_code', options.portalCode.trim());
          }
          localStorage.setItem('jwt_obtained_at', String(now));

          setIsAuthenticated(true);
          setUser({ id: response.data.id, role: response.data.role });

          scheduleRefresh(now);
          return { success: true };
        }

        return { success: false, message: response.message || 'Ошибка авторизации' };
      } catch (error: any) {
        return {
          success: false,
          message: error?.response?.data?.message || error?.message || 'Произошла ошибка при входе'
        };
      }
    },
    [scheduleRefresh]
  );

  const login = useCallback(
    async (email: string, password?: string, options?: AuthOptions) => {
      const result = await authenticate(email, password, options);
      if (!result.success) {
        setIsAuthenticated(false);
        setUser(null);
      }
      return result;
    },
    [authenticate]
  );

  const refreshSession = useCallback(async (): Promise<AuthResult> => {
    const storedEmail = typeof window === 'undefined' ? null : localStorage.getItem('user_email');
    if (!storedEmail) {
      logout();
      return { success: false, message: 'Не удалось продлить сессию (нет сохраненной почты)' };
    }

    const portalCode = localStorage.getItem('portal_code') ?? undefined;
    const result = await authenticate(storedEmail, undefined, { portalCode });
    if (!result.success) {
      logout();
    }
    return result;
  }, [authenticate, logout]);

  useEffect(() => {
    refreshHandlerRef.current = refreshSession;
  }, [refreshSession]);

  useEffect(() => {
    let mounted = true;
    let isInitialized = false;

    const initAuth = async (isManualRefresh = false) => {
      // Предотвращаем повторную инициализацию, если уже инициализировано (только для первого запуска)
      if (!isManualRefresh && isInitialized) return;
      isInitialized = true;

      try {
        const token = localStorage.getItem('jwt_token');
        const storedData = localStorage.getItem('user_data');
        const obtainedRaw = localStorage.getItem('jwt_obtained_at');
        const obtainedAt = Number(obtainedRaw);

        if (token && storedData && token !== 'null' && token !== 'undefined') {
          try {
            const parsedUser = JSON.parse(storedData);
            if (parsedUser?.id && parsedUser?.role) {
              const hasValidTimestamp = !Number.isNaN(obtainedAt) && obtainedAt > 0;
              const tokenExpired = hasValidTimestamp && (Date.now() - obtainedAt >= TOKEN_LIFETIME_MS);

              if (!tokenExpired && mounted) {
                setUser(parsedUser);
                setIsAuthenticated(true);
                if (hasValidTimestamp) scheduleRefresh(obtainedAt);
                if (mounted) {
                  setIsLoading(false);
                }
                return;
              }

              // Токен истек или нет метки времени, пытаемся обновить сессию 
              // (только если есть email, иначе это может быть старый токен от другого входа)
              if (mounted && localStorage.getItem('user_email')) {
                const refreshResult = await refreshSession();
                if (refreshResult.success && mounted) {
                  setIsLoading(false);
                  return;
                }
              }
            }
          } catch (error) {
            console.error('Corrupted auth payload:', error);
          }
        }

        // Если мы попали сюда, значит реальной валидной сессии нет
        // Проверяем, не является ли текущий пользователь в ERP демо-пользователем
        const erpAuthRaw = localStorage.getItem('agency.auth.current-user');
        const isDemo = erpAuthRaw?.includes('"login":"demo"');
        // Реальный логин (AuthContext.login) ставит этот флаг и не пишет jwt_token —
        // сессия живёт в httpOnly cookie. Без этой проверки условие ниже читало бы
        // "нет legacy JWT" как "можно мок-логиниться" даже для уже залогиненного
        // реальным логином пользователя (и для страницы логина ДО первой попытки
        // входа) — тихая подмена сессии гонкой с формой входа (см. isDemoSession()
        // в teamApi.ts — тот же флаг, тот же смысл).
        const hasRealCrmSession = !!localStorage.getItem('crm_session_active');

        // mock-login — только для dev-сборки/демо: в проде тихая подмена сессии
        // захардкоженным пользователем маскировала истёкший токен (см. section-development-todo.md).
        const allowMockAuth =
          !hasRealCrmSession &&
          ((import.meta as any).env?.DEV === true || (import.meta as any).env?.VITE_USE_MOCK_AUTH === 'true');

        if (mounted) {
          if (allowMockAuth && isDemo) {
            // Демо-режим: пытаемся получить реальный токен через mock-login,
            // чтобы запросы к API не падали с 401/403.
            try {
              const res = await apiService.mockLogin();
              if (res.success && res.data) {
                setUser({ id: res.data.id, role: res.data.role });
                setIsAuthenticated(true);
              } else {
                setUser({ id: '690ca643abbceba815ba7090', role: UserRole.MANAGER });
                setIsAuthenticated(true);
              }
            } catch (e) {
              setUser({ id: '690ca643abbceba815ba7090', role: UserRole.MANAGER });
              setIsAuthenticated(true);
            } finally {
              if (mounted) setIsLoading(false);
            }
          } else {
            // Нет валидной сессии (или прод-сборка без mock-auth) — честно разлогиниваем.
            setIsAuthenticated(false);
            setUser(null);
            setIsLoading(false);
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        if (mounted) {
          setIsAuthenticated(false);
          setUser(null);
          setIsLoading(false);
        }
      }
    };

    initAuth();

    // Слушаем изменения в localStorage, чтобы синхронизировать вход между ERP и CRM
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'jwt_token' || e.key === 'user_data' || e.key === 'agency.auth.current-user') {
        initAuth(true);
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      mounted = false;
      clearRefreshTimer();
      window.removeEventListener('storage', handleStorageChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Запускаем только при монтировании

  return {
    isAuthenticated,
    isLoading,
    user,
    login,
    logout
  };
};
