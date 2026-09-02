import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { CRM_API_BASE_URL, BAZA_PUBLIC_API_BASE_URL } from '@/config/backend';
import { UserRole } from './types';

const API_BASE_URL = CRM_API_BASE_URL;
const USER_FAVORITES_BASE_URL = BAZA_PUBLIC_API_BASE_URL;
const OBJECTS_DATES_SECRET =
  import.meta.env.VITE_OBJECTS_DATES_SECRET || 'secretlinkweirh2348hwerugh';

export { USER_FAVORITES_BASE_URL, OBJECTS_DATES_SECRET };

/** Декодирует JWT и возвращает payload (id, role, email и т.д.) или null */
export function decodeJwtPayload(token: string): { id?: string; role?: string; email?: string } | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

/** Email текущего пользователя: из JWT или localStorage user_email */
export function getCurrentUserEmail(): string | null {
  const token = typeof window !== 'undefined' ? localStorage.getItem('jwt_token') : null;
  if (token) {
    const payload = decodeJwtPayload(token);
    if (payload?.email) return payload.email;
  }
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('user_email');
    if (stored) return stored;
  }
  return null;
}

/** Заголовки авторизации для запросов к внешним API (например USER_FAVORITES_BASE_URL) */
export function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('jwt_token') : null;
  if (!token) return {};
  const tokenString = typeof token === 'string' ? token : String(token);
  const cleanToken = tokenString.startsWith('Bearer ') ? tokenString.slice(7) : tokenString;
  if (!cleanToken?.trim()) return {};
  return { Authorization: `Bearer ${cleanToken.trim()}` };
}

function buildRemoveHistoryInterceptor() {
  const removeHistory = (obj: any, path = ''): any => {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) {
      if (
        path.includes('history') ||
        (path === '' &&
          obj.length > 0 &&
          obj[0] &&
          typeof obj[0] === 'object' &&
          ('fromStage' in obj[0] || 'toStage' in obj[0]))
      ) {
        return undefined;
      }
      return obj
        .map((item: any, index: number) => removeHistory(item, `${path}[${index}]`))
        .filter((item: any) => item !== undefined);
    }
    if (
      typeof obj === 'object' &&
      !(obj instanceof File) &&
      !(obj instanceof FormData) &&
      !(obj instanceof Date)
    ) {
      const cleaned: any = {};
      for (const key in obj) {
        if (key === 'history') continue;
        const cleanedValue = removeHistory(obj[key], path ? `${path}.${key}` : key);
        if (cleanedValue !== undefined) cleaned[key] = cleanedValue;
      }
      return cleaned;
    }
    return obj;
  };
  return removeHistory;
}

export function createApiClient() {
  const api = axios.create({
    baseURL: API_BASE_URL,
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
  });

  api.interceptors.request.use(
    (config) => {
      if (
        config.url &&
        (config.url.includes('/crm/leads') || config.url.includes('/admin/leads/create'))
      ) {
        if (config.method === 'post' || config.method === 'patch' || config.method === 'put') {
          if (config.data) {
            const removeHistory = buildRemoveHistoryInterceptor();
            if (config.data instanceof FormData) {
              if (config.data.has('history')) config.data.delete('history');
              const dataObj: any = {};
              config.data.forEach((value, key) => {
                if (key === 'history') return;
                if (key === 'data' && typeof value === 'string') {
                  try {
                    const parsed = JSON.parse(value);
                    dataObj[key] = JSON.stringify(removeHistory(parsed, 'data'));
                  } catch {
                    dataObj[key] = value;
                  }
                } else dataObj[key] = value;
              });
              if (dataObj.data) config.data.set('data', dataObj.data);
            } else {
              config.data = removeHistory(config.data);
              const deepClean = (o: any): any => {
                if (o === null || o === undefined) return o;
                if (Array.isArray(o)) return o.map(deepClean).filter((x: any) => x !== undefined);
                if (
                  typeof o === 'object' &&
                  !(o instanceof File) &&
                  !(o instanceof FormData) &&
                  !(o instanceof Date)
                ) {
                  const c: any = {};
                  for (const k in o) {
                    if (k === 'history') continue;
                    const v = deepClean(o[k]);
                    if (v !== undefined) c[k] = v;
                  }
                  return c;
                }
                return o;
              };
              config.data = deepClean(config.data);
              try {
                const s = JSON.stringify(config.data);
                if (s.includes('"history"')) {
                  const parsed = JSON.parse(s);
                  const removeAllHistory = (o: any): any => {
                    if (o === null || o === undefined) return o;
                    if (Array.isArray(o)) return o.map(removeAllHistory);
                    if (
                      typeof o === 'object' &&
                      !(o instanceof File) &&
                      !(o instanceof FormData) &&
                      !(o instanceof Date)
                    ) {
                      const c: any = {};
                      for (const k in o) {
                        if (k === 'history') continue;
                        c[k] = removeAllHistory(o[k]);
                      }
                      return c;
                    }
                    return o;
                  };
                  config.data = removeAllHistory(parsed);
                }
              } catch {}
              const fs = JSON.stringify(config.data || {});
              if (fs.includes('"history"')) {
                try {
                  const parsed = JSON.parse(fs);
                  const allowedKeys = [
                    'name',
                    'phone',
                    'email',
                    'city',
                    'productType',
                    'assignedTo',
                    'source',
                    'notes',
                    'dealValue',
                    'expectedCloseDate',
                    'mode',
                    'forAll',
                    'data',
                  ];
                  const emergencyClean: any = {};
                  for (const k of allowedKeys) {
                    if (k in parsed && k !== 'history') {
                      if (k === 'data' && parsed[k] && typeof parsed[k] === 'object') {
                        const nested: any = {};
                        for (const nk of [
                          'name',
                          'phone',
                          'email',
                          'city',
                          'productType',
                          'assignedTo',
                          'source',
                          'notes',
                          'dealValue',
                          'expectedCloseDate',
                        ]) {
                          if (nk in parsed[k] && nk !== 'history')
                            nested[nk] = parsed[k][nk];
                        }
                        emergencyClean[k] = nested;
                      } else emergencyClean[k] = parsed[k];
                    }
                  }
                  config.data = emergencyClean;
                } catch {}
              }
            }
          }
        }
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  api.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;
      // 403 тоже считаем поводом для попытки авто-логина в демо/dev-режиме, 
      // так как некоторые прокси/бэкенды могут отдавать 403 вместо 401 при отсутствии токена
      if ((error.response?.status === 401 || error.response?.status === 403) && !originalRequest._retry) {
        originalRequest._retry = true;
        const isLoginRequest =
          originalRequest.url?.includes('/auth/login') ||
          originalRequest.url?.includes('/auth/mock-login');
        if (!isLoginRequest) {
          localStorage.removeItem('jwt_token');
          localStorage.removeItem('user_data');
          localStorage.removeItem('userId');
          // Авто-восстановление через mock-login — ТОЛЬКО в dev-сборке (или при
          // явном VITE_USE_MOCK_AUTH). В проде это подменяло сессию на захардкоженного
          // пользователя: токен истёк → 401 → тихий mock-login → чужой аккаунт.
          const isDev =
            (import.meta as any).env?.DEV === true || (import.meta as any).env?.VITE_USE_MOCK_AUTH === 'true';

          if (isDev) {
            try {
              const response = await axios
                .post(`${API_BASE_URL}/auth/mock-login`, {
                  id: '690ca643abbceba815ba7090',
                  role: UserRole.AGENT,
                })
                .catch((e: any) => {
                  if (e?.response?.status === 400 || e?.response?.status === 404 || e?.response?.status === 403)
                    return { data: { success: false } } as any;
                  throw e;
                });
              if (response.data.success && response.data.data?.token) {
                const token = response.data.data.token;
                const tokenString =
                  typeof token === 'string' ? token : (token as any)?.token || String(token);
                const cleanToken = tokenString.startsWith('Bearer ')
                  ? tokenString.substring(7)
                  : tokenString;
                if (cleanToken && cleanToken.trim().length > 0) {
                  localStorage.setItem('jwt_token', cleanToken.trim());
                  localStorage.setItem('userId', response.data.data.id);
                  localStorage.setItem(
                    'user_data',
                    JSON.stringify({
                      id: response.data.data.id,
                      role: response.data.data.role,
                    })
                  );
                  originalRequest.headers.Authorization = `Bearer ${cleanToken.trim()}`;
                  return api(originalRequest);
                }
              }
            } catch (authError) {
              console.error('[API Client] Mock login failed during 401/403 recovery:', authError);
            }
          }
        }
      }
      return Promise.reject(error);
    }
  );

  return api;
}

export function getAuthQuery() {
  try {
    const envUserId =
      (import.meta as any).env?.VITE_USER_ID ||
      (import.meta as any).env?.VITE_NOTIFICATIONS_USER_ID;
    const envUserRole = (import.meta as any).env?.VITE_USER_ROLE as UserRole | undefined;
    if (envUserId) {
      return {
        userId: String(envUserId),
        userRole: (envUserRole || UserRole.AGENT) as UserRole,
      } as { userId?: string; userRole?: UserRole };
    }
    const stored = localStorage.getItem('user_data');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed?.id && parsed?.role) {
        let role = parsed.role;
        // Mapping for CRM backend which doesn't know 'developer' role
        if (role === 'developer') role = UserRole.ADMIN;
        
        return { userId: parsed.id, userRole: role } as {
          userId?: string;
          userRole?: UserRole;
        };
      }
    }
    const userId = localStorage.getItem('userId');
    if (userId)
      return { userId, userRole: UserRole.AGENT } as { userId?: string; userRole?: UserRole };
  } catch {}
  return {} as { userId?: string; userRole?: UserRole };
}

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('admin_token') || sessionStorage.getItem('admin_token');
}

//@ts-expect-error - в некоторых случаях может быть не строкой, но мы всё равно попытаемся её использовать
export function getAdminHeaders(api: AxiosInstance): Record<string, string> {
  const adminToken = getAdminToken();
  const jwtToken = localStorage.getItem('jwt_token');
  const headers: Record<string, string> = {};
  if (jwtToken) {
    const tokenString = typeof jwtToken === 'string' ? jwtToken : String(jwtToken);
    const cleanToken = tokenString.startsWith('Bearer ')
      ? tokenString.substring(7)
      : tokenString;
    if (cleanToken?.trim()) headers['Authorization'] = `Bearer ${cleanToken.trim()}`;
  }
  if (adminToken) headers['X-Admin-Token'] = String(adminToken).trim();
  return headers;
}

export function isValidObjectId(id: string | undefined | null): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-fA-F]{24}$/.test(id.trim());
}
