/** @vitest-environment jsdom */

/**
 * teamApi.ts write-операции (create/update/setStatus/move/vacate/
 * assignOccupant/remove/createAccountSlot) закрывали mock-долг TEAM-001
 * (03.09.2026): раньше они ходили на отдельный axios-инстанс с
 * `CRM_API_BASE_URL` и без глобального префикса `/api/v1` — в production это
 * другой backend, где `/team-users/...` не существует, то есть вызовы тихо
 * 404'ились бы, даже когда мок-флаги были уже выключены. Этот тест закрепляет
 * границу: все write-операции идут через один и тот же HTTP-клиент
 * (`axios.create`, тут замокан) на `/api/v1/team-users/...` — ни на другой
 * baseURL, ни в обход HTTP через localStorage.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()
const postMock = vi.fn()
const patchMock = vi.fn()
const deleteMock = vi.fn()

vi.mock('axios', () => ({
  default: {
    create: () => ({ get: getMock, post: postMock, patch: patchMock, delete: deleteMock }),
  },
}))

describe('teamApi write-операции: один HTTP-клиент, реальные /api/v1 маршруты', () => {
  beforeEach(() => {
    getMock.mockReset()
    postMock.mockReset()
    patchMock.mockReset()
    deleteMock.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('create() отправляет POST /api/v1/team-users', async () => {
    postMock.mockResolvedValueOnce({ data: { success: true, data: { id: 'pos-1' } } })
    const { teamApi } = await import('@/services/teamApi')

    await teamApi.create({
      name: 'Иван',
      role: 'manager',
      position: 'Менеджер',
      loginEmail: 'ivan@example.com',
      password: 'password123',
    })

    expect(postMock).toHaveBeenCalledWith('/api/v1/team-users', expect.objectContaining({ name: 'Иван' }))
  })

  it('update() отправляет PATCH /api/v1/team-users/positions/:id без пароля', async () => {
    patchMock.mockResolvedValueOnce({ data: { success: true, data: { id: 'pos-1' } } })
    const { teamApi } = await import('@/services/teamApi')

    await teamApi.update('pos-1', { name: 'Иван', password: 'secret' })

    expect(patchMock).toHaveBeenCalledWith('/api/v1/team-users/positions/pos-1', { name: 'Иван' })
  })

  it('setStatus() отправляет PATCH /api/v1/team-users/positions/:id/status', async () => {
    patchMock.mockResolvedValueOnce({ data: { success: true, data: { id: 'pos-1', status: 'blocked' } } })
    const { teamApi } = await import('@/services/teamApi')

    await teamApi.setStatus('pos-1', 'blocked')

    expect(patchMock).toHaveBeenCalledWith('/api/v1/team-users/positions/pos-1/status', { status: 'blocked' })
  })

  it('move() отправляет PATCH /api/v1/team-users/positions/:id/move', async () => {
    patchMock.mockResolvedValueOnce({ data: { success: true, data: { id: 'pos-1' } } })
    const { teamApi } = await import('@/services/teamApi')

    await teamApi.move('pos-1', 'pos-manager')

    expect(patchMock).toHaveBeenCalledWith('/api/v1/team-users/positions/pos-1/move', { managerId: 'pos-manager' })
  })

  it('vacate() отправляет POST /api/v1/team-users/positions/:id/vacate', async () => {
    postMock.mockResolvedValueOnce({ data: { success: true, data: { id: 'pos-1', vacant: true } } })
    const { teamApi } = await import('@/services/teamApi')

    await teamApi.vacate('pos-1')

    expect(postMock).toHaveBeenCalledWith('/api/v1/team-users/positions/pos-1/vacate')
  })

  it('assignOccupant() отправляет POST /api/v1/team-users/positions/:id/assign', async () => {
    postMock.mockResolvedValueOnce({
      data: { success: true, data: { user: { id: 'pos-1' }, linkedExisting: false, inviteToken: 'tok' } },
    })
    const { teamApi } = await import('@/services/teamApi')

    await teamApi.assignOccupant('pos-1', { name: 'Иван', email: 'ivan@example.com', loginEmail: 'ivan@example.com' })

    expect(postMock).toHaveBeenCalledWith(
      '/api/v1/team-users/positions/pos-1/assign',
      expect.objectContaining({ name: 'Иван' }),
    )
  })

  it('remove() отправляет DELETE /api/v1/team-users/positions/:id', async () => {
    deleteMock.mockResolvedValueOnce({ data: { success: true, data: null } })
    const { teamApi } = await import('@/services/teamApi')

    await teamApi.remove('pos-1')

    expect(deleteMock).toHaveBeenCalledWith('/api/v1/team-users/positions/pos-1')
  })

  it('createAccountSlot() отправляет POST /api/v1/team-users/positions (известный backend-блокер, но не мок)', async () => {
    postMock.mockResolvedValueOnce({ data: { success: true, data: { id: 'pos-2', vacant: true } } })
    const { teamApi } = await import('@/services/teamApi')

    await teamApi.createAccountSlot({ role: 'manager', position: 'Manager 2', managerId: 'pos-rop' })

    expect(postMock).toHaveBeenCalledWith('/api/v1/team-users/positions', expect.objectContaining({ role: 'manager' }))
  })

  it('getById() отправляет GET /api/v1/team-users/:id (известный backend-блокер, но не мок)', async () => {
    getMock.mockResolvedValueOnce({ data: { success: true, data: { id: 'pos-1' } } })
    const { teamApi } = await import('@/services/teamApi')

    await teamApi.getById('pos-1')

    expect(getMock).toHaveBeenCalledWith('/api/v1/team-users/pos-1')
  })

  it('ни одна write-операция не пишет в localStorage', async () => {
    postMock.mockResolvedValue({ data: { success: true, data: { id: 'pos-1' } } })
    patchMock.mockResolvedValue({ data: { success: true, data: { id: 'pos-1' } } })
    deleteMock.mockResolvedValue({ data: { success: true, data: null } })

    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    const { teamApi } = await import('@/services/teamApi')

    await teamApi.create({ name: 'Иван', role: 'manager', position: 'Менеджер', loginEmail: 'ivan@example.com', password: 'password123' })
    await teamApi.update('pos-1', { name: 'Иван' })
    await teamApi.setStatus('pos-1', 'blocked')
    await teamApi.vacate('pos-1')
    await teamApi.remove('pos-1')

    expect(setItemSpy).not.toHaveBeenCalled()
    setItemSpy.mockRestore()
  })
})
