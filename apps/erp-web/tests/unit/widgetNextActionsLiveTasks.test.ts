/** @vitest-environment jsdom */

/**
 * Виджет «Следующие действия» показывал просроченные задачи из `TASKS_MOCK`
 * рядом с настоящими лидами — выдуманное действие было неотличимо от
 * настоящего. Тест закрепляет два свойства: задачи приходят с сервера, а
 * недоступный сервер не подменяется моком и не выдаётся за «действий нет».
 */

import { cleanup, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const listAllTasksMock = vi.fn()

vi.mock('@/i18n', () => ({
  useI18n: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ currentUser: { id: 'u1', name: 'Анна', positionId: 'pos-1' } }),
}))

vi.mock('@/services/tasksApiV2', () => ({
  tasksApiV2: { listAll: listAllTasksMock },
}))

function serverTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    organizationId: 'org-1',
    title: 'Перезвонить Иванову',
    description: null,
    status: 'open',
    dueAt: '2026-08-30T09:00:00.000Z',
    startAt: null,
    priority: 'high',
    taskCategory: 'work',
    colorHex: null,
    reminderOffsetsMinutes: [],
    subtasks: [],
    attachmentFileNames: [],
    entityType: 'none',
    entityId: null,
    isAutomatic: false,
    triggerType: null,
    assignedPositionId: 'pos-1',
    createdByPositionId: 'pos-1',
    leadId: null,
    contactId: null,
    completedAt: null,
    completedByPositionId: null,
    isOverdue: true,
    version: 1,
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: null,
    ...overrides,
  }
}

async function renderWidget() {
  const { WidgetNextActions } = await import('@/components/dashboard/widgets/WidgetNextActions')
  return render(
    createElement(WidgetNextActions, { leads: [], slot: 'big' } as never),
  )
}

describe('WidgetNextActions: просроченные задачи', () => {
  beforeEach(() => {
    listAllTasksMock.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('показывает просроченные задачи с сервера', async () => {
    listAllTasksMock.mockResolvedValue({ items: [serverTask()], complete: true })

    await renderWidget()

    expect(await screen.findByText('Перезвонить Иванову')).toBeTruthy()
  })

  it('не показывает чужие задачи как своё следующее действие', async () => {
    listAllTasksMock.mockResolvedValue({
      items: [serverTask({ id: 'task-2', title: 'Чужая задача', assignedPositionId: 'pos-99' })],
      complete: true,
    })

    await renderWidget()

    await screen.findByText('dashboard.widgets.widgetNextActions.срочных_действий_нет')
    expect(screen.queryByText('Чужая задача')).toBeNull()
  })

  it('берёт просрочку у сервера, а не сравнивает даты сам', async () => {
    // Срок в прошлом, но сервер сказал «не просрочена» (например, задача
    // завершена или отменена) — виджет её не показывает.
    listAllTasksMock.mockResolvedValue({
      items: [serverTask({ id: 'task-3', title: 'Уже закрытая', isOverdue: false })],
      complete: true,
    })

    await renderWidget()

    await screen.findByText('dashboard.widgets.widgetNextActions.срочных_действий_нет')
    expect(screen.queryByText('Уже закрытая')).toBeNull()
  })

  it('при отказе сервера говорит об этом и не подставляет мок-задачи', async () => {
    listAllTasksMock.mockRejectedValue({ response: { status: 500 } })

    await renderWidget()

    expect(
      await screen.findByText('dashboard.widgets.widgetNextActions.просроченные_задачи_'),
    ).toBeTruthy()
    // Мок-реестр начинается с «Связаться с Ивановым А.В.» — ни одной такой
    // строки на экране быть не должно.
    expect(screen.queryByText(/Связаться с Ивановым/)).toBeNull()
  })
})
