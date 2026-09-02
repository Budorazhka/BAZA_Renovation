/** @vitest-environment jsdom */

/**
 * Действия над задачей в карточке: взять в работу, отметить подзадачу, сменить
 * исполнителя. Все три сервер умел давно, а экран не давал — сервер был богаче
 * интерфейса.
 *
 * Проверяется главное свойство: экран не подкручивает состояние у себя. Он
 * показывает то, что вернул сервер, и при отказе остаётся как был — иначе
 * галочка стояла бы до перезагрузки, а после неё исчезала без объяснений.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const listAllTasksMock = vi.fn()
const completeTaskMock = vi.fn()
const setStatusMock = vi.fn()
const setSubtasksMock = vi.fn()
const reassignMock = vi.fn()
const createTaskMock = vi.fn()
const listTeamMock = vi.fn()
const toastErrorMock = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/dashboard/tasks' }),
}))

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

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: toastErrorMock } }))

vi.mock('@/services/tasksApiV2', () => ({
  tasksApiV2: {
    listAll: listAllTasksMock,
    complete: completeTaskMock,
    setStatus: setStatusMock,
    setSubtasks: setSubtasksMock,
    reassign: reassignMock,
    create: createTaskMock,
  },
  newIdempotencyKey: () => 'key-1',
}))

vi.mock('@/services/teamApi', () => ({
  teamApi: { list: listTeamMock },
}))

const TEAM = [
  { id: 'u1', positionId: 'pos-1', name: 'Анна Первичкина' },
  { id: 'u2', positionId: 'pos-2', name: 'Дмитрий Коваль' },
]

function serverTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    organizationId: 'org-1',
    title: 'Собрать документы',
    description: null,
    status: 'open',
    dueAt: '2026-09-10T09:00:00.000Z',
    startAt: null,
    priority: 'medium',
    taskCategory: 'work',
    colorHex: null,
    reminderOffsetsMinutes: [],
    subtasks: [
      { id: 'st-1', title: 'Паспорт', done: false },
      { id: 'st-2', title: 'Выписка ЕГРН', done: true },
    ],
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
    version: 3,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: null,
    ...overrides,
  }
}

async function renderPage(task = serverTask()) {
  listAllTasksMock.mockResolvedValue({ items: [task], complete: true })
  listTeamMock.mockResolvedValue(TEAM)
  const { TasksPage } = await import('@/components/tasks/TasksPage')
  const result = render(createElement(TasksPage))
  await screen.findByText('tasks.tasksPage.взять_в_работу')
  return result
}

describe('TasksPage: действия над задачей', () => {
  beforeEach(() => {
    listAllTasksMock.mockReset()
    listTeamMock.mockReset()
    completeTaskMock.mockReset()
    setStatusMock.mockReset()
    setSubtasksMock.mockReset()
    reassignMock.mockReset()
    createTaskMock.mockReset()
    toastErrorMock.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('«Взять в работу» переводит задачу в in_progress с прочитанной версией', async () => {
    setStatusMock.mockResolvedValue(serverTask({ status: 'in_progress', version: 4 }))

    await renderPage()
    fireEvent.click(screen.getByText('tasks.tasksPage.взять_в_работу'))

    await waitFor(() => expect(setStatusMock).toHaveBeenCalledWith('task-1', 3, 'in_progress'))
    // Кнопка сменилась, потому что сервер вернул новый статус, а не потому
    // что экран решил так сам.
    expect(await screen.findByText('tasks.tasksPage.вернуть_в_новые')).toBeTruthy()
  })

  it('у взятой в работу задачи кнопка возвращает её в новые', async () => {
    setStatusMock.mockResolvedValue(serverTask({ status: 'open', version: 4 }))

    listAllTasksMock.mockResolvedValue({ items: [serverTask({ status: 'in_progress' })], complete: true })
    listTeamMock.mockResolvedValue(TEAM)
    const { TasksPage } = await import('@/components/tasks/TasksPage')
    render(createElement(TasksPage))

    fireEvent.click(await screen.findByText('tasks.tasksPage.вернуть_в_новые'))

    await waitFor(() => expect(setStatusMock).toHaveBeenCalledWith('task-1', 3, 'open'))
  })

  it('отказ сервера не меняет состояние на экране', async () => {
    setStatusMock.mockRejectedValue({ response: { status: 403 } })

    await renderPage()
    fireEvent.click(screen.getByText('tasks.tasksPage.взять_в_работу'))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Нет прав на это действие.'))
    // Кнопка осталась прежней: задача не «взята в работу» ни на сервере, ни на экране.
    expect(screen.getByText('tasks.tasksPage.взять_в_работу')).toBeTruthy()
    expect(screen.queryByText('tasks.tasksPage.вернуть_в_новые')).toBeNull()
  })

  it('при 409 реестр перечитывается, а не настаивает на своей версии', async () => {
    setStatusMock.mockRejectedValue({ response: { status: 409 } })

    await renderPage()
    expect(listAllTasksMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByText('tasks.tasksPage.взять_в_работу'))

    await waitFor(() => expect(listAllTasksMock).toHaveBeenCalledTimes(2))
  })

  it('отметка подзадачи отправляет весь список с перевёрнутым флагом', async () => {
    setSubtasksMock.mockResolvedValue(serverTask({ version: 4 }))

    await renderPage()
    fireEvent.click(screen.getByLabelText('Паспорт'))

    await waitFor(() =>
      expect(setSubtasksMock).toHaveBeenCalledWith('task-1', 3, [
        { id: 'st-1', title: 'Паспорт', done: true },
        { id: 'st-2', title: 'Выписка ЕГРН', done: true },
      ]),
    )
  })

  it('смена исполнителя уходит в reassign с позицией, а не с id человека', async () => {
    reassignMock.mockResolvedValue(serverTask({ assignedPositionId: 'pos-2', version: 4 }))

    await renderPage()
    fireEvent.change(screen.getByLabelText('tasks.tasksPage.исполнитель'), {
      target: { value: 'pos-2' },
    })

    await waitFor(() => expect(reassignMock).toHaveBeenCalledWith('task-1', 3, 'pos-2'))
  })

  it('у выполненной задачи кнопки смены статуса нет', async () => {
    listAllTasksMock.mockResolvedValue({ items: [serverTask({ status: 'completed', completedAt: '2026-09-02T10:00:00.000Z' })], complete: true })
    listTeamMock.mockResolvedValue(TEAM)
    const { TasksPage } = await import('@/components/tasks/TasksPage')
    render(createElement(TasksPage))

    // Архив: выполненная задача видна там, и в её карточке «Взять в работу» нет.
    fireEvent.click(await screen.findByText('Архив'))

    await screen.findAllByText('Собрать документы')
    expect(screen.queryByText('tasks.tasksPage.взять_в_работу')).toBeNull()
  })
})
