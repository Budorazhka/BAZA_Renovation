import { resolveApiBaseUrl } from './api-base'

const API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL)

export class AuthApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'AuthApiError'
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    let errorDetail = response.statusText
    try {
      const errorJson = await response.json()
      errorDetail = errorJson.message || errorJson.error || response.statusText
    } catch {
      // Non-JSON response
    }
    throw new AuthApiError(errorDetail, response.status)
  }

  if (response.status === 204) {
    return {} as T
  }

  return response.json() as Promise<T>
}

export const authApi = {
  async login(login: string, password: string): Promise<{ identityId: string; requires2fa: boolean }> {
    return request<{ identityId: string; requires2fa: boolean }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login, password }),
    })
  },

  async register(login: string, password: string): Promise<{ identityId: string }> {
    return request<{ identityId: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ login, password }),
    })
  },

  async logout(): Promise<{ loggedOut: boolean }> {
    return request<{ loggedOut: boolean }>('/auth/logout', {
      method: 'POST',
    })
  },

  async checkSession(): Promise<boolean> {
    try {
      const response = await request<{ authenticated: boolean }>('/auth/session', { method: 'GET' })
      return response.authenticated
    } catch {
      return false
    }
  },
}
