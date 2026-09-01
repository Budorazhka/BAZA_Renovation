/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * D-02 (26.08.2026): доказывает, что новый V2 wizard шлёт POST /developments
 * ровно с контрактом CreateDevelopmentDto (name/location/contact/…), а не
 * legacy-полями старого визарда, что координаты уходят как [longitude,
 * latitude] (ADR-007, не [lat, lng] — частая ошибка), что успех ведёт к
 * списку проектов, и что ошибка API не создаёт фальшивый проект локально
 * (developmentsApiV2.create вызывается ровно один раз, никакого
 * localStorage/mock-сохранения при провале).
 */

const navigateMock = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useParams: () => ({}),
}))

vi.mock('@/i18n', () => ({
  useI18n: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}))

const createMock = vi.fn()
vi.mock('@/services/developmentsApiV2', () => ({
  getCreateIdempotencyKey: (scope: string) => `key-${scope}`,
  resetCreateIdempotencyKey: () => {},
  developmentsApiV2: { create: createMock, getById: vi.fn(), update: vi.fn() },
}))

async function fillMinimalValidForm() {
  fireEvent.change(screen.getByLabelText(/Название ЖК/i), { target: { value: 'ЖК Морской бриз' } })
  fireEvent.change(screen.getByLabelText(/^Страна/i), { target: { value: 'ge' } })
  await waitFor(() => {
    expect((screen.getByLabelText(/^Город/i) as HTMLSelectElement).disabled).toBe(false)
  })
  fireEvent.change(screen.getByLabelText(/^Город/i), { target: { value: 'batumi' } })
  fireEvent.change(screen.getByLabelText(/Долгота/i), { target: { value: '41.6367' } })
  fireEvent.change(screen.getByLabelText(/Широта/i), { target: { value: '41.6459' } })
  fireEvent.change(screen.getByLabelText(/Телефон/i), { target: { value: '+995555000000' } })
}

describe('ProjectWizardV2Page', () => {
  beforeEach(() => {
    createMock.mockReset()
    navigateMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('блокирует отправку и показывает ошибки валидации на русском при пустой форме', async () => {
    const { ProjectWizardV2Page } = await import('@/pages/projects/ProjectWizardV2Page')
    render(createElement(ProjectWizardV2Page))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Создать ЖК/i }))
    })

    expect(screen.getByText('Укажите название ЖК')).toBeDefined()
    expect(screen.getByText('Страна обязательна для заполнения')).toBeDefined()
    expect(screen.getByText('Город обязателен для заполнения')).toBeDefined()
    expect(screen.getByText('Укажите долготу (longitude)')).toBeDefined()
    expect(screen.getByText('Укажите широту (latitude)')).toBeDefined()
    expect(screen.getByText('Укажите телефон для связи')).toBeDefined()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('отправляет POST только с новым DTO, coordinates строго [longitude, latitude]', async () => {
    createMock.mockResolvedValueOnce({
      _id: 'dev-1',
      organizationId: 'org-1',
      name: 'ЖК Морской бриз',
      status: 'draft',
      location: { country: 'ge', city: 'batumi', geo: { type: 'Point', coordinates: [41.6367, 41.6459] } },
      contact: { phone: '+995555000000' },
      version: 1,
      createdAt: '2026-08-26T10:00:00.000Z',
    })

    const { ProjectWizardV2Page } = await import('@/pages/projects/ProjectWizardV2Page')
    render(createElement(ProjectWizardV2Page))

    await fillMinimalValidForm()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Создать ЖК/i }))
    })

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledTimes(1)
    })

    const payload = createMock.mock.calls[0]![0]
    expect(payload).toEqual({
      name: 'ЖК Морской бриз',
      location: {
        country: 'ge',
        city: 'batumi',
        address: undefined,
        geo: { type: 'Point', coordinates: [41.6367, 41.6459] },
      },
      contact: { phone: '+995555000000', whatsapp: undefined, telegram: undefined },
      classType: undefined,
      startDate: undefined,
      completionDate: undefined,
      description: undefined,
    })
    // Явная проверка порядка ADR-007: coordinates[0] === longitude, [1] === latitude.
    expect(payload.location.geo.coordinates).toEqual([41.6367, 41.6459])

    // Никаких лишних маркетинговых/legacy-полей в теле запроса.
    expect(Object.keys(payload).sort()).toEqual(
      ['classType', 'completionDate', 'contact', 'description', 'location', 'name', 'startDate'].sort(),
    )
  })

  it('после успеха переходит к списку проектов', async () => {
    createMock.mockResolvedValueOnce({
      _id: 'dev-2',
      organizationId: 'org-1',
      name: 'X',
      status: 'draft',
      location: { country: 'ge', city: 'batumi', geo: { type: 'Point', coordinates: [41.6367, 41.6459] } },
      contact: { phone: '+995555000000' },
      version: 1,
      createdAt: '2026-08-26T10:00:00.000Z',
    })

    const { ProjectWizardV2Page } = await import('@/pages/projects/ProjectWizardV2Page')
    render(createElement(ProjectWizardV2Page))

    await fillMinimalValidForm()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Создать ЖК/i }))
    })

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(
        '/dashboard/development/projects',
        expect.objectContaining({ state: expect.objectContaining({ createdDevelopmentId: 'dev-2' }) }),
      )
    })
  })

  it('показывает ошибку API и НЕ переходит к списку — ошибка не создаёт фальшивый проект локально', async () => {
    createMock.mockRejectedValueOnce(new Error('Server unavailable'))

    const { ProjectWizardV2Page } = await import('@/pages/projects/ProjectWizardV2Page')
    render(createElement(ProjectWizardV2Page))

    await fillMinimalValidForm()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Создать ЖК/i }))
    })

    await waitFor(() => {
      expect(screen.getByTestId('wizard-api-error-banner')).toBeDefined()
    })
    expect(screen.getByText('Server unavailable')).toBeDefined()
    expect(navigateMock).not.toHaveBeenCalled()
    expect(createMock).toHaveBeenCalledTimes(1)
  })

  it('показывает состояние forbidden при 403 от бэкенда', async () => {
    createMock.mockRejectedValueOnce({
      response: { status: 403, data: { error: { code: 'FORBIDDEN', message: 'Недостаточно прав' } } },
    })

    const { ProjectWizardV2Page } = await import('@/pages/projects/ProjectWizardV2Page')
    render(createElement(ProjectWizardV2Page))

    await fillMinimalValidForm()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Создать ЖК/i }))
    })

    await waitFor(() => {
      expect(screen.getByTestId('wizard-forbidden-banner')).toBeDefined()
    })
    expect(screen.getByText('Недостаточно прав')).toBeDefined()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('показывает индикатор загрузки во время отправки и блокирует повторный клик', async () => {
    let resolveCreate: (value: unknown) => void = () => {}
    const pending = new Promise((resolve) => {
      resolveCreate = resolve
    })
    createMock.mockReturnValueOnce(pending)

    const { ProjectWizardV2Page } = await import('@/pages/projects/ProjectWizardV2Page')
    render(createElement(ProjectWizardV2Page))

    await fillMinimalValidForm()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Создать ЖК/i }))
    })

    expect((screen.getByRole('button', { name: /Создание…/i }) as HTMLButtonElement).disabled).toBe(true)

    await act(async () => {
      resolveCreate({
        _id: 'dev-3',
        organizationId: 'org-1',
        name: 'X',
        status: 'draft',
        location: { country: 'ge', city: 'batumi', geo: { type: 'Point', coordinates: [41.6367, 41.6459] } },
        contact: { phone: '+995555000000' },
        version: 1,
        createdAt: '2026-08-26T10:00:00.000Z',
      })
    })

    expect(createMock).toHaveBeenCalledTimes(1)
  })
})
