/** @vitest-environment jsdom */

/**
 * useCrmData (список лидов/задач классической CRM, apps/erp-web/src/
 * features/crm/pages/crm/hooks/useCrmData.ts) переведён на leadsApiV2/
 * tasksApiV2 (apps/api, Platform API) — легаси api-crm.baza.sale здесь
 * больше не читается. Сокет-слой (features/crm/services/socket) замокан
 * целиком: реальные попытки WebSocket-подключения в юнит-тесте не нужны и
 * не должны влиять на проверяемое поведение (HTTP fallback-поллинг дёргает
 * те же loadTasks/loadLeads, что и проверяются напрямую ниже).
 */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskPriority, TaskStatus } from '@/features/crm/services/api/types'

const leadsListAllMock = vi.fn()
const tasksListMock = vi.fn()
const tasksListAllMock = vi.fn()
const tasksCompleteMock = vi.fn()
const tasksSetStatusMock = vi.fn()
const tasksSetDueAtMock = vi.fn()

vi.mock('@/services/leadsApiV2', () => ({
  leadsApiV2: { listAll: leadsListAllMock },
}))

vi.mock('@/services/tasksApiV2', () => ({
  tasksApiV2: {
    list: tasksListMock,
    listAll: tasksListAllMock,
    complete: tasksCompleteMock,
    setStatus: tasksSetStatusMock,
    setDueAt: tasksSetDueAtMock,
  },
}))

vi.mock('@/features/crm/services/socket', () => ({
  getSocket: () => null,
  onPush: () => () => {},
  offPush: () => {},
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

function makeTaskV2(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    organizationId: 'org-1',
    title: 'Позвонить',
    description: null,
    status: 'open',
    dueAt: null,
    startAt: null,
    isUrgent: false,
    isImportant: true,
    priority: 'medium',
    taskCategory: 'work',
    colorHex: null,
    reminderOffsetsMinutes: [],
    subtasks: [],
    attachments: [],
    attachmentFileNames: [],
    entityType: 'lead',
    entityId: 'lead-1',
    isAutomatic: false,
    triggerType: null,
    assignedPositionId: null,
    createdByPositionId: null,
    leadId: 'lead-1',
    contactId: null,
    completedAt: null,
    completedByPositionId: null,
    isOverdue: false,
    version: 0,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: null,
    ...overrides,
  }
}

describe('useCrmData — лиды и задачи классической CRM на leadsApiV2/tasksApiV2', () => {
  beforeEach(() => {
    leadsListAllMock.mockReset().mockResolvedValue({ items: [makeLeadV2()], complete: true })
    tasksListAllMock.mockReset().mockResolvedValue({ items: [makeTaskV2()], complete: true })
    tasksListMock.mockReset().mockResolvedValue({ items: [makeTaskV2()], nextCursor: null })
    tasksCompleteMock.mockReset()
    tasksSetStatusMock.mockReset()
    tasksSetDueAtMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  async function renderCrmData() {
    const { useCrmData } = await import('@/features/crm/pages/crm/hooks/useCrmData')
    return renderHook(() => useCrmData({ isAuthenticated: true }))
  }

  it('читает лиды через leadsApiV2.listAll, не через легаси apiService.getLeads', async () => {
    const { result } = await renderCrmData()

    await waitFor(() => expect(result.current.backendLeads).toHaveLength(1))
    expect(leadsListAllMock).toHaveBeenCalled()
    expect(result.current.backendLeads[0]._id).toBe('lead-1')
  })

  it('задачи организации читаются через tasksApiV2.listAll, задачи конкретного лида — через tasksApiV2.list', async () => {
    const { result } = await renderCrmData()

    await waitFor(() => expect(result.current.backendTasks).toHaveLength(1))
    expect(tasksListAllMock).toHaveBeenCalled()

    await act(async () => {
      await result.current.loadTasks('lead-1')
    })

    expect(tasksListMock).toHaveBeenCalledWith({ leadId: 'lead-1', limit: 100 })
  })

  it('категории задач сведены к фиксированным work/personal — без обращения к легаси getTaskCategories/getOrCreateTaskCategory', async () => {
    const { result } = await renderCrmData()

    await waitFor(() => expect(result.current.taskCategoriesMap.size).toBe(2))
    expect(Array.from(result.current.taskCategoriesMap.values())).toEqual(['Работа', 'Личное'])
  })

  it('updateTaskStatus(COMPLETED) идёт через tasksApiV2.complete, остальные статусы — через setStatus', async () => {
    tasksCompleteMock.mockResolvedValueOnce(makeTaskV2({ status: 'completed', version: 1 }))
    tasksSetStatusMock.mockResolvedValueOnce(makeTaskV2({ status: 'in_progress', version: 2 }))
    const { result } = await renderCrmData()
    await waitFor(() => expect(result.current.backendTasks).toHaveLength(1))

    await act(async () => {
      await result.current.updateTaskStatus('task-1', TaskStatus.COMPLETED)
    })
    expect(tasksCompleteMock).toHaveBeenCalledWith('task-1', 0)

    await act(async () => {
      await result.current.updateTaskStatus('task-1', TaskStatus.IN_PROGRESS)
    })
    // Версия — expect.any(Number): фоновый HTTP-fallback-поллинг (useTaskRealtimeSync)
    // может перечитать задачи между вызовами и обновить кэш expectedVersion —
    // здесь важна не точная версия, а то, что не-COMPLETED статус идёт через setStatus.
    expect(tasksSetStatusMock).toHaveBeenCalledWith('task-1', expect.any(Number), 'in_progress')
  })

  it('handleDeleteTask отменяет задачу через tasksApiV2.setStatus(cancelled) — DELETE /tasks/:id не существует', async () => {
    tasksSetStatusMock.mockResolvedValueOnce(makeTaskV2({ status: 'cancelled' }))
    const { result } = await renderCrmData()
    await waitFor(() => expect(result.current.backendTasks).toHaveLength(1))

    await act(async () => {
      await result.current.handleDeleteTask('task-1')
    })

    expect(tasksSetStatusMock).toHaveBeenCalledWith('task-1', 0, 'cancelled')
  })

  it('updateTaskPriority — честный пробел: PATCH /tasks/:id не принимает isUrgent/isImportant, ни один клиент не вызывается', async () => {
    const { result } = await renderCrmData()
    await waitFor(() => expect(result.current.backendTasks).toHaveLength(1))

    await act(async () => {
      await result.current.updateTaskPriority('task-1', TaskPriority.URGENT_IMPORTANT)
    })

    expect(tasksCompleteMock).not.toHaveBeenCalled()
    expect(tasksSetStatusMock).not.toHaveBeenCalled()
    expect(tasksSetDueAtMock).not.toHaveBeenCalled()
  })
})
