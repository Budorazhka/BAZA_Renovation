import axios from 'axios'
import { PLATFORM_API_BASE_URL } from '@/config/backend'

export interface PlatformLoginResponse {
  identityId: string
  requires2fa: boolean
}

const api = axios.create({
  baseURL: PLATFORM_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

/**
 * Минимальная граница ERP → нового Platform API для host-only cookie-сессии.
 * Не использует legacy CRM URL и не читает/не сохраняет session token в JS.
 */
export const platformAuthApi = {
  async login(params: { login: string; password: string }): Promise<PlatformLoginResponse> {
    const { data } = await api.post<PlatformLoginResponse>('/api/v1/auth/login', params)
    return data
  },

  async logout(): Promise<{ loggedOut: true }> {
    const { data } = await api.post<{ loggedOut: true }>('/api/v1/auth/logout')
    return data
  },
}
