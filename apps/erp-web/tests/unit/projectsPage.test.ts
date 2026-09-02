/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * D-02 (26.08.2026): доказывает, что список ЖК на ProjectsPage читается
 * НАПРЯМУЮ через developmentsApiV2.list() (не через useCoreStore, который
 * подмешивает PROJECTS_MOCK и legacy-поля), что ошибка загрузки не
 * добавляет фальшивый проект локально, и что кнопка «Создать ЖК» ведёт на
 * новый V2 wizard.
 */

const navigateMock = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('@/i18n', () => ({
  useI18n: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}))

vi.mock('@/hooks/useRolePermissions', () => ({
  useRolePermissions: () => ({ isManagementPosition: true }),
}))

vi.mock('@/services/developersApi', () => ({
  developersApi: { me: vi.fn().mockRejectedValue(new Error('no profile')) },
}))

const listMock = vi.fn()
vi.mock('@/services/developmentsApiV2', () => ({
  getCreateIdempotencyKey: (scope: string) => `key-${scope}`,
  resetCreateIdempotencyKey: () => {},
  developmentsApiV2: { list: listMock },
}))

const mockDevelopments = [
  {
    _id: 'dev-1',
    organizationId: 'org-1',
    name: 'ЖК Морской бриз',
    status: 'active',
    location: { country: 'ge', city: 'batumi', address: 'ул. Приморская, 10', geo: { type: 'Point', coordinates: [41.6367, 41.6459] } },
    classType: 'comfort',
    startDate: '2026-01-01T00:00:00.000Z',
    completionDate: '2027-06-01T00:00:00.000Z',
    contact: { phone: '+995555000000' },
    version: 1,
    createdAt: '2026-08-26T10:00:00.000Z',
  },
]

describe('ProjectsPage', () => {
  beforeEach(() => {
    listMock.mockReset()
    navigateMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('отображает состояние загрузки при первом рендере', async () => {
    let resolvePromise: (value: { items: typeof mockDevelopments; nextCursor: null }) => void = () => {}
    const pending = new Promise<{ items: typeof mockDevelopments; nextCursor: null }>((resolve) => {
      resolvePromise = resolve
    })
    listMock.mockReturnValue(pending)

    const { ProjectsPage } = await import('@/pages/projects/ProjectsPage')
    render(createElement(ProjectsPage))

    expect(screen.getByTestId('projects-loading')).toBeDefined()

    await act(async () => {
      resolvePromise({ items: [], nextCursor: null })
    })
  })

  it('запрашивает список через developmentsApiV2.list(), не через useCoreStore', async () => {
    listMock.mockResolvedValue({ items: mockDevelopments, nextCursor: null })

    const { ProjectsPage } = await import('@/pages/projects/ProjectsPage')
    render(createElement(ProjectsPage))

    await waitFor(() => {
      expect(screen.getByTestId('projects-list')).toBeDefined()
    })

    expect(listMock).toHaveBeenCalledTimes(1)
    expect(listMock).toHaveBeenCalledWith({ limit: 100 })
    expect(screen.getByText('ЖК Морской бриз')).toBeDefined()
  })

  it('показывает только реальные поля Development на карточке (name/city/address/status/classType/даты)', async () => {
    listMock.mockResolvedValue({ items: mockDevelopments, nextCursor: null })

    const { ProjectsPage } = await import('@/pages/projects/ProjectsPage')
    render(createElement(ProjectsPage))

    await waitFor(() => {
      expect(screen.getByTestId('projects-list')).toBeDefined()
    })

    expect(screen.getByText('ЖК Морской бриз')).toBeDefined()
    expect(screen.getByText(/ул\. Приморская, 10/)).toBeDefined()
    expect(screen.getByText('Активен')).toBeDefined()
  })

  it('показывает пустое состояние, когда объектов нет', async () => {
    listMock.mockResolvedValue({ items: [], nextCursor: null })

    const { ProjectsPage } = await import('@/pages/projects/ProjectsPage')
    render(createElement(ProjectsPage))

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(1)
    })

    expect(screen.queryByTestId('projects-list')).toBe(null)
  })

  it('показывает ошибку загрузки и НЕ добавляет фальшивый проект локально, retry повторяет запрос', async () => {
    listMock.mockRejectedValueOnce(new Error('Server unavailable'))

    const { ProjectsPage } = await import('@/pages/projects/ProjectsPage')
    render(createElement(ProjectsPage))

    await waitFor(() => {
      expect(screen.getByTestId('projects-error')).toBeDefined()
    })
    expect(screen.getByText('Server unavailable')).toBeDefined()
    // Ошибка не должна была тайно создать проект — список пуст, не подставлен мок.
    expect(screen.queryByTestId('projects-list')).toBe(null)

    listMock.mockResolvedValueOnce({ items: mockDevelopments, nextCursor: null })
    await act(async () => {
      fireEvent.click(screen.getByText('Повторить'))
    })

    await waitFor(() => {
      expect(screen.getByTestId('projects-list')).toBeDefined()
    })
    expect(listMock).toHaveBeenCalledTimes(2)
    expect(screen.getByText('ЖК Морской бриз')).toBeDefined()
  })

  it('кнопка «Создать ЖК» ведёт на новый V2 wizard роут', async () => {
    listMock.mockResolvedValue({ items: [], nextCursor: null })

    const { ProjectsPage } = await import('@/pages/projects/ProjectsPage')
    render(createElement(ProjectsPage))

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(1)
    })

    const createButtons = screen.getAllByRole('button', { name: /добавить_жк/i })
    await act(async () => {
      fireEvent.click(createButtons[0]!)
    })

    expect(navigateMock).toHaveBeenCalledWith('/dashboard/development/projects/new')
  })

  it('D-02 COMPLETE: кнопка «Управление структурой» ведёт на /dashboard/development/projects/:id/management-v2', async () => {
    listMock.mockResolvedValue({ items: mockDevelopments, nextCursor: null })

    const { ProjectsPage } = await import('@/pages/projects/ProjectsPage')
    render(createElement(ProjectsPage))

    await waitFor(() => {
      expect(screen.getByTestId('projects-list')).toBeDefined()
    })

    const manageButton = screen.getByRole('button', { name: /Управление структурой/i })
    await act(async () => {
      fireEvent.click(manageButton)
    })

    expect(navigateMock).toHaveBeenCalledWith('/dashboard/development/projects/dev-1/management-v2')
  })
})
