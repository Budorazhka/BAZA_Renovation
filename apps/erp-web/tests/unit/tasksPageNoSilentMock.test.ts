/** @vitest-environment jsdom */

/**
 * Реестр задач переведён с `TASKS_MOCK` на Platform API. Тест закрепляет
 * границу, ради которой это делалось: отказ сервера остаётся отказом.
 *
 * Опасных исходов здесь два, и оба выглядят для пользователя как нормальная
 * работа: показать демо-задачи вместо своих и сказать «задач не найдено»,
 * когда задачи просто не загрузились. Первое — подмена данных, второе —
 * ложное утверждение о данных.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const listAllTasksMock = vi.fn()
const completeTaskMock = vi.fn()
const reopenTaskMock = vi.fn()
const createTaskMock = vi.fn()
const listTeamMock = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/dashboard/tasks' }),
}))

// t() без fallback возвращает сам ключ — по нему и проверяем, какое состояние
// отрисовано, не завися от формулировок в словарях.
vi.mock('@/i18n', () => ({
  useI18n: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ currentUser: { id: 'u1', name: 'Анна', positionId: 'pos-1' } }),
}))

vi.mock('@/components/layout/DashboardShell', () => ({
  DashboardShell: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
}))

vi.mock('@/components/tasks/CreateTaskModal', () => ({
  CreateTaskModal: () => null,
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

vi.mock('@/services/tasksApiV2', () => ({
  tasksApiV2: {
    listAll: listAllTasksMock,
    complete: completeTaskMock,
    reopen: reopenTaskMock,
    create: createTaskMock,
  },
  newIdempotencyKey: () => 'key-1',
}))

vi.mock('@/services/teamApi', () => ({
  teamApi: { list: listTeamMock },
}))

const TEAM = [{ id: 'u1', positionId: 'pos-1', name: 'Анна Первичкина' }]

function serverTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    organizationId: 'org-1',
    title: 'Настоящая задача с сервера',
    description: null,
    status: 'open',
    dueAt: '2026-09-10T09:00:00.000Z',
    startAt: null,
    priority: 'medium',
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
    isOverdue: false,
    version: 1,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: null,
    ...overrides,
  }
}

async function renderPage() {
  const { TasksPage } = await import('@/components/tasks/TasksPage')
  return render(createElement(TasksPage))
}

describe('TasksPage: реестр задач и отказы сервера', () => {
  beforeEach(() => {
    listAllTasksMock.mockReset()
    listTeamMock.mockReset()
    completeTaskMock.mockReset()
    reopenTaskMock.mockReset()
    createTaskMock.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('показывает задачи сервера с именами из состава команды', async () => {
    listAllTasksMock.mockResolvedValue({ items: [serverTask()], complete: true })
    listTeamMock.mockResolvedValue(TEAM)

    await renderPage()

    expect((await screen.findAllByText('Настоящая задача с сервера')).length).toBeGreaterThan(0)
    // Имя появляется в карточке задачи — на один рендер позже списка.
    expect((await screen.findAllByText('Анна Первичкина')).length).toBeGreaterThan(0)
  })

  it('при 500 не показывает ни одной задачи и говорит об ошибке', async () => {
    listAllTasksMock.mockRejectedValue({ response: { status: 500 } })
    listTeamMock.mockResolvedValue(TEAM)

    await renderPage()

    expect(await screen.findByText(/Сервер ответил ошибкой 500/)).toBeTruthy()
    expect(screen.queryByText('Настоящая задача с сервера')).toBeNull()
  })

  it('при 401 сообщает про сессию, а не про отсутствие задач', async () => {
    listAllTasksMock.mockRejectedValue({ response: { status: 401 } })
    listTeamMock.mockResolvedValue(TEAM)

    await renderPage()

    expect(await screen.findByText(/Сессия истекла/)).toBeTruthy()
  })

  it('при 403 не утверждает «задач не найдено» — данные не загружены, а не отсутствуют', async () => {
    listAllTasksMock.mockRejectedValue({ response: { status: 403 } })
    listTeamMock.mockResolvedValue(TEAM)

    await renderPage()

    await screen.findByText(/Нет прав на просмотр задач/)
    expect(screen.queryByText('tasks.tasksPage.задач_не_найдено')).toBeNull()
  })

  it('пустой ответ сервера — это именно «задач не найдено»', async () => {
    listAllTasksMock.mockResolvedValue({ items: [], complete: true })
    listTeamMock.mockResolvedValue(TEAM)

    await renderPage()

    expect(await screen.findByText('tasks.tasksPage.задач_не_найдено')).toBeTruthy()
  })

  it('неполный реестр не выдаётся за полный', async () => {
    // Сервер отдал не всё: экран показывает задачи, но говорит, что список
    // неполон. Молчание здесь означало бы «других задач нет» — утверждение,
    // которого никто не проверял.
    listAllTasksMock.mockResolvedValue({ items: [serverTask()], complete: false })
    listTeamMock.mockResolvedValue(TEAM)

    await renderPage()

    expect(await screen.findByText('tasks.tasksPage.показаны_не_все_зада')).toBeTruthy()
  })

  it('полный реестр не показывает предупреждение о неполноте', async () => {
    listAllTasksMock.mockResolvedValue({ items: [serverTask()], complete: true })
    listTeamMock.mockResolvedValue(TEAM)

    await renderPage()

    await screen.findAllByText('Настоящая задача с сервера')
    expect(screen.queryByText('tasks.tasksPage.показаны_не_все_зада')).toBeNull()
  })

  it('отменённые задачи на экран не попадают: такого состояния в интерфейсе нет', async () => {
    listAllTasksMock.mockResolvedValue({ items: [serverTask({ id: 'task-2', title: 'Отменённая', status: 'cancelled' })], complete: true })
    listTeamMock.mockResolvedValue(TEAM)

    await renderPage()

    await screen.findByText('tasks.tasksPage.задач_не_найдено')
    expect(screen.queryByText('Отменённая')).toBeNull()
  })

  it('недоступный состав команды не прячет задачи, но и не молчит', async () => {
    listAllTasksMock.mockResolvedValue({ items: [serverTask()], complete: true })
    listTeamMock.mockRejectedValue(new Error('network'))

    await renderPage()

    expect((await screen.findAllByText('Настоящая задача с сервера')).length).toBeGreaterThan(0)
    await waitFor(() =>
      expect(screen.getByText('tasks.tasksPage.состав_команды_не_за')).toBeTruthy(),
    )
  })
})
