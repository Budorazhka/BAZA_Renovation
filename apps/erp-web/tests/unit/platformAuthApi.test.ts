import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const postMock = vi.fn()
let axiosCreateConfig: Record<string, unknown> | undefined

vi.mock('axios', () => ({
  default: {
    create: (config: Record<string, unknown>) => {
      axiosCreateConfig = config
      return { post: postMock }
    },
  },
}))

describe('platformAuthApi', () => {
  beforeEach(() => {
    postMock.mockReset()
    axiosCreateConfig = undefined
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('использует Platform API с cookie-сессией, а не legacy CRM endpoint', async () => {
    await import('@/services/platformAuthApi')

    expect(axiosCreateConfig).toMatchObject({
      baseURL: 'http://localhost:3000',
      withCredentials: true,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  it('логинится и выходит через versioned Platform API маршруты', async () => {
    postMock
      .mockResolvedValueOnce({ data: { identityId: 'identity-1', requires2fa: false } })
      .mockResolvedValueOnce({ data: { loggedOut: true } })

    const { platformAuthApi } = await import('@/services/platformAuthApi')

    await expect(platformAuthApi.login({ login: 'owner@example.test', password: 'secret' })).resolves.toEqual({
      identityId: 'identity-1',
      requires2fa: false,
    })
    await expect(platformAuthApi.logout()).resolves.toEqual({ loggedOut: true })

    expect(postMock).toHaveBeenNthCalledWith(1, '/api/v1/auth/login', {
      login: 'owner@example.test',
      password: 'secret',
    })
    expect(postMock).toHaveBeenNthCalledWith(2, '/api/v1/auth/logout')
  })
})
