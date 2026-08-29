const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

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
    return request<{ identityId: string; requires2fa: boolean }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login, password }),
    })
  },

  async register(login: string, password: string): Promise<{ identityId: string }> {
    return request<{ identityId: string }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ login, password }),
    })
  },

  async logout(): Promise<{ loggedOut: boolean }> {
    return request<{ loggedOut: boolean }>('/api/v1/auth/logout', {
      method: 'POST',
    })
  },

  async checkSession(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/marketplace/property-assets`, {
        method: 'GET',
        credentials: 'include',
      })
      return res.status === 200
    } catch {
      return false
    }
  },
}
