import type { AxiosInstance } from 'axios';
import type { ApiResponse } from './types';
import { UserRole } from './types';
//@ts-expect-error
import { getAuthQuery } from './client';

export type ApiContext = {
  api: AxiosInstance;
};

export function createAuthMethods(ctx: ApiContext) {
  const { api } = ctx;
  return {
    login(
      email: string,
      password?: string
    ): Promise<ApiResponse<{ token: string; id: string; role: UserRole }>> {
      const payload: Record<string, string> = { email };
      if (password) payload.password = password;
      return api.post('/auth/login', payload).then((r) => {
        const d = r.data;
        if (d.success && d.data?.token) {
          const token = d.data.token;
          const tokenString =
            typeof token === 'string' ? token : (token as any)?.token || String(token);
          const cleanToken = tokenString.startsWith('Bearer ')
            ? tokenString.substring(7)
            : tokenString;
          if (cleanToken?.trim()) {
            localStorage.setItem('jwt_token', cleanToken.trim());
            localStorage.setItem('userId', d.data.id);
            localStorage.setItem(
              'user_data',
              JSON.stringify({ id: d.data.id, role: d.data.role })
            );
          }
        }
        return d;
      }).catch((err: any) => {
        const status = err?.response?.status;
        if (status === 502 || status === 503 || status === 504) {
          return {
            success: false,
            message: 'Сервер временно недоступен. Попробуйте войти позже или обратитесь к администратору.',
          };
        }
        const msg = err?.response?.data?.message || err?.message;
        return { success: false, message: msg || 'Ошибка входа' };
      });
    },
    mockLogin(
      id = '690ca643abbceba815ba7090',
      role: UserRole = UserRole.AGENT
    ): Promise<ApiResponse<{ token: string; id: string; role: UserRole }>> {
      return api.post('/auth/mock-login', { id, role }).then((r) => {
        const d = r.data;
        if (d.success && d.data?.token) {
          const token = d.data.token;
          const tokenString =
            typeof token === 'string' ? token : (token as any)?.token || String(token);
          const cleanToken = tokenString.startsWith('Bearer ')
            ? tokenString.substring(7)
            : tokenString;
          if (cleanToken?.trim()) {
            localStorage.setItem('jwt_token', cleanToken.trim());
            localStorage.setItem('userId', d.data.id);
            localStorage.setItem(
              'user_data',
              JSON.stringify({ id: d.data.id, role: d.data.role })
            );
          }
        }
        return d;
      });
    },
  };
}
