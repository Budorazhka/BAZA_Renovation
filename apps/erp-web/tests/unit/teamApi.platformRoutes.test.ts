import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()
const postMock = vi.fn()

vi.mock('axios', () => ({
  default: {
    create: () => ({ get: getMock, post: postMock }),
  },
}))

describe('teamApi Platform API boundary', () => {
  beforeEach(() => {
    getMock.mockReset()
    postMock.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('получает команду и собственную позицию из server-scoped /api/v1 маршрутов', async () => {
    getMock.mockResolvedValueOnce({ data: { success: true, data: [] } })
    postMock.mockResolvedValueOnce({ data: { success: true, data: null } })

    const { teamApi } = await import('@/services/teamApi')

    await expect(teamApi.list()).resolves.toEqual([])
    await expect(teamApi.ensureSelf()).resolves.toBeNull()

    expect(getMock).toHaveBeenCalledWith('/api/v1/team-users')
    expect(postMock).toHaveBeenCalledWith('/api/v1/team-users/ensure-self')
  })
})
