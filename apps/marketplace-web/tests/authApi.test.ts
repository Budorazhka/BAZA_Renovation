/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '../src/features/publishing/api/auth-api'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('authApi.checkSession', () => {
  it('uses the read-only auth session endpoint and returns its authenticated flag', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ authenticated: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(authApi.checkSession()).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/session',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    )
  })

  it('returns false for a valid response that says there is no session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ authenticated: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await expect(authApi.checkSession()).resolves.toBe(false)
  })

  it('does not send a JSON content type for the empty logout request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ loggedOut: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(authApi.logout()).resolves.toEqual({ loggedOut: true })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/logout',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.not.objectContaining({ 'Content-Type': expect.anything() }),
      }),
    )
  })
})
