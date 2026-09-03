/** @vitest-environment jsdom */

/**
 * LeadsContext (карточный стол лидов) переведён на leadsApiV2 (apps/api,
 * /api/v1/leads/*) — создание, переназначение и смена стадии обязаны идти
 * через новый клиент, а не через легаси apiService (@/features/crm/
 * services/api/service, api-crm.baza.sale). Настройки распределения
 * остаются на легаси backend намеренно (см. докстринг fetchLeads в
 * LeadsContext.tsx) — этот тест мокает apiService ТОЛЬКО ради
 * getDistributionSettings, не как источник лидов.
 */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const listAllMock = vi.fn()
const getByIdMock = vi.fn()
const createMock = vi.fn()
const assignMock = vi.fn()
const unassignMock = vi.fn()
const changeStageMock = vi.fn()
const teamListMock = vi.fn()
const getDistributionSettingsMock = vi.fn()
const updateDistributionSettingsMock = vi.fn()
const createTaskMock = vi.fn()
const toastErrorMock = vi.fn()

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: vi.fn() },
}))

// Стабильная ссылка: свежий объект на каждый вызов useAuth() менял бы
// зависимость эффекта fetchLeads на каждый рендер и зациклил бы монтирование.
const mockCurrentUser = { id: 'user-1', name: 'Директор', positionId: 'pos-owner' }
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ currentUser: mockCurrentUser }),
}))

vi.mock('@/services/leadsApiV2', () => ({
  leadsApiV2: {
    listAll: listAllMock,
    getById: getByIdMock,
    create: createMock,
    assign: assignMock,
    unassign: unassignMock,
    changeStage: changeStageMock,
  },
  newIdempotencyKey: () => 'test-idempotency-key',
}))

vi.mock('@/services/teamApi', () => ({
  teamApi: { list: teamListMock },
}))

vi.mock('@/features/crm/services/api/service', () => ({
  apiService: {
    getDistributionSettings: getDistributionSettingsMock,
    updateDistributionSettings: updateDistributionSettingsMock,
    createTask: createTaskMock,
  },
}))

function makeLeadV2(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    organizationId: 'org-1',
    ownerPositionId: null,
    productType: 'sales',
    stage: 'new',
    version: 0,
    source: { route: 'manual' },
    createdAt: '2026-09-01T00:00:00.000Z',
    contact: { id: 'c-1', name: 'Клиент', phone: '+79990000000' },
    hasOpenNextAction: false,
    stalled: false,
    ...overrides,
  }
}

describe('LeadsContext — карточный стол лидов на leadsApiV2', () => {
  beforeEach(() => {
    listAllMock.mockReset().mockResolvedValue({ items: [makeLeadV2()], complete: true })
    getByIdMock.mockReset()
    createMock.mockReset()
    assignMock.mockReset()
    unassignMock.mockReset()
    changeStageMock.mockReset()
    teamListMock.mockReset().mockResolvedValue([
      { id: 'pos-1', positionId: 'pos-1', name: 'Менеджер Первый', email: 'm1@test.com', vacant: false, position: 'Менеджер' },
    ])
    getDistributionSettingsMock.mockReset().mockResolvedValue({ success: true, data: { type: 'manual', manualDistributorId: null } })
    updateDistributionSettingsMock.mockReset().mockResolvedValue({ success: true, data: {} })
    createTaskMock.mockReset()
    toastErrorMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  async function renderLeadsHook() {
    const { LeadsProvider, useLeads } = await import('@/context/LeadsContext')
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(LeadsProvider, null, children)
    return renderHook(() => useLeads(), { wrapper })
  }

  it('при монтировании читает лиды через leadsApiV2.listAll и менеджеров через teamApi.list, не через легаси apiService', async () => {
    const { result } = await renderLeadsHook()

    await waitFor(() => expect(listAllMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current.state.leadPool).toHaveLength(1))

    expect(teamListMock).toHaveBeenCalledTimes(1)
    expect(result.current.state.leadPool[0]?.id).toBe('lead-1')
    expect(result.current.leadManagers).toEqual([
      { id: 'pos-1', login: 'm1@test.com', name: 'Менеджер Первый', sourceTypes: ['primary', 'secondary', 'rent', 'ad_campaigns'] },
    ])
  })

  it('ASSIGN_LEAD вызывает leadsApiV2.assign, а не легаси apiService.updateLead', async () => {
    const { result } = await renderLeadsHook()
    await waitFor(() => expect(result.current.state.leadPool).toHaveLength(1))

    assignMock.mockResolvedValueOnce({ id: 'lead-1', organizationId: 'org-1', contactId: 'c-1', ownerPositionId: 'pos-1', stage: 'new', source: { route: 'manual' } })

    await act(async () => {
      await result.current.dispatch({ type: 'ASSIGN_LEAD', leadId: 'lead-1', managerId: 'pos-1' })
    })

    expect(assignMock).toHaveBeenCalledWith('lead-1', 'pos-1')
    expect(result.current.state.leadPool[0]?.managerId).toBe('pos-1')
  })

  it('UNASSIGN_LEAD вызывает leadsApiV2.unassign', async () => {
    const { result } = await renderLeadsHook()
    await waitFor(() => expect(result.current.state.leadPool).toHaveLength(1))

    unassignMock.mockResolvedValueOnce({ id: 'lead-1', organizationId: 'org-1', contactId: 'c-1', ownerPositionId: null, stage: 'new', source: { route: 'manual' } })

    await act(async () => {
      await result.current.dispatch({ type: 'UNASSIGN_LEAD', leadId: 'lead-1' })
    })

    expect(unassignMock).toHaveBeenCalledWith('lead-1')
    expect(result.current.state.leadPool[0]?.managerId).toBeNull()
  })

  it('UPDATE_LEAD_STAGE транслирует poker-id продукта лида в backend stage id и передаёт закешированный version (CAS)', async () => {
    listAllMock.mockResolvedValueOnce({ items: [makeLeadV2({ productType: 'sales', stage: 'new', version: 3 })], complete: true })
    const { result } = await renderLeadsHook()
    await waitFor(() => expect(result.current.state.leadPool).toHaveLength(1))

    changeStageMock.mockResolvedValueOnce({ id: 'lead-1', organizationId: 'org-1', contactId: 'c-1', ownerPositionId: null, stage: 'callback', version: 4, source: { route: 'manual' } })

    await act(async () => {
      await result.current.dispatch({ type: 'UPDATE_LEAD_STAGE', leadId: 'lead-1', stageId: 'callback' })
    })

    expect(changeStageMock).toHaveBeenCalledWith('lead-1', 'callback', 3)
  })

  it('UPDATE_LEAD_STAGE при 409 (VERSION_CONFLICT) показывает toast и перечитывает лиды вместо падения', async () => {
    listAllMock.mockResolvedValueOnce({ items: [makeLeadV2({ productType: 'sales', stage: 'new', version: 0 })], complete: true })
    const { result } = await renderLeadsHook()
    await waitFor(() => expect(result.current.state.leadPool).toHaveLength(1))

    const conflictError = Object.assign(new Error('Conflict'), { response: { status: 409 } })
    changeStageMock.mockRejectedValueOnce(conflictError)
    listAllMock.mockResolvedValueOnce({ items: [makeLeadV2({ productType: 'sales', stage: 'new', version: 1 })], complete: true })

    await act(async () => {
      await result.current.dispatch({ type: 'UPDATE_LEAD_STAGE', leadId: 'lead-1', stageId: 'callback' })
    })

    expect(toastErrorMock).toHaveBeenCalledWith('Стадию лида изменил кто-то ещё. Карточка обновлена.')
    await waitFor(() => expect(listAllMock).toHaveBeenCalledTimes(2))
  })

  it('ADD_LEAD вызывает leadsApiV2.create (не легаси apiService.createLead)', async () => {
    const { result } = await renderLeadsHook()
    await waitFor(() => expect(result.current.state.leadPool).toHaveLength(1))

    createMock.mockResolvedValueOnce(makeLeadV2({ id: 'lead-new', version: 0 }))

    await act(async () => {
      await result.current.dispatch({
        type: 'ADD_LEAD',
        lead: {
          id: 'temp-1',
          source: 'primary',
          stageId: 'new',
          managerId: null,
          createdAt: '2026-09-01T00:00:00.000Z',
          name: 'Новый клиент',
          phone: '+79990000001',
        },
      })
    })

    expect(createMock).toHaveBeenCalledWith(
      { requesterName: 'Новый клиент', requesterPhone: '+79990000001', productType: 'sales' },
      'test-idempotency-key',
    )
  })
})
