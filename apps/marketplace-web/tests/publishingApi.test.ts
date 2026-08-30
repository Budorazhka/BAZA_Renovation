/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { publishingApi } from '../src/features/publishing/api/publishing-api'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('publishingApi empty-body requests', () => {
  it('does not send a JSON content type for activateListing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ _id: 'listing-1', status: 'active', version: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(publishingApi.activateListing('asset-1', 'listing-1')).resolves.toEqual({
      _id: 'listing-1',
      status: 'active',
      version: 1,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/marketplace/property-assets/asset-1/listings/listing-1/activate',
      expect.objectContaining({
        method: 'PATCH',
        credentials: 'include',
        headers: expect.not.objectContaining({ 'Content-Type': expect.anything() }),
      }),
    )
  })
})
