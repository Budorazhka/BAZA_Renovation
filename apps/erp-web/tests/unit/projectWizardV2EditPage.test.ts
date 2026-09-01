/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const navigateMock = vi.fn()
const paramsMock = vi.fn()
const getByIdMock = vi.fn()
const updateMock = vi.fn()

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useParams: () => paramsMock(),
}))

vi.mock('@/i18n', () => ({
  useI18n: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}))

vi.mock('@/services/developmentsApiV2', () => ({
  getCreateIdempotencyKey: (scope: string) => `key-${scope}`,
  resetCreateIdempotencyKey: () => {},
  developmentsApiV2: {
    getById: getByIdMock,
    update: updateMock,
  },
}))

const development = {
  _id: 'dev-42',
  organizationId: 'org-1',
  name: 'ЖК Старый город',
  status: 'draft',
  location: {
    country: 'ge',
    city: 'batumi',
    address: 'ул. Руставели, 7',
    geo: { type: 'Point' as const, coordinates: [41.6367, 41.6459] as [number, number] },
  },
  contact: { phone: '+995555000000', whatsapp: '+995555000001', telegram: '@baza' },
  classType: 'business',
  startDate: '2025-01-01',
  completionDate: '2027-06-30',
  description: 'Первая очередь',
  version: 7,
  createdAt: '2026-08-26T10:00:00.000Z',
}

describe('ProjectWizardV2Page — edit', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    paramsMock.mockReturnValue({ id: 'dev-42' })
    getByIdMock.mockReset()
    updateMock.mockReset()
  })

  afterEach(() => cleanup())

  it('загружает существующий ЖК по id и заполняет V2-форму', async () => {
    getByIdMock.mockResolvedValueOnce(development)
    const { ProjectWizardV2Page } = await import('@/pages/projects/ProjectWizardV2Page')

    render(createElement(ProjectWizardV2Page))

    await waitFor(() => expect(getByIdMock).toHaveBeenCalledWith('dev-42'))
    expect((screen.getByLabelText(/Название ЖК/i) as HTMLInputElement).value).toBe('ЖК Старый город')
    expect((screen.getByLabelText(/^Город/i) as HTMLSelectElement).value).toBe('batumi')
    expect((screen.getByLabelText(/Долгота/i) as HTMLInputElement).value).toBe('41.6367')
    expect((screen.getByLabelText(/Телефон/i) as HTMLInputElement).value).toBe('+995555000000')
    expect(screen.getByRole('button', { name: /Сохранить изменения/i })).toBeDefined()
  })

  it('сохраняет через update с версией загруженного ЖК, а не через create', async () => {
    getByIdMock.mockResolvedValueOnce(development)
    updateMock.mockResolvedValueOnce({ ...development, name: 'ЖК Новый город', version: 8 })
    const { ProjectWizardV2Page } = await import('@/pages/projects/ProjectWizardV2Page')

    render(createElement(ProjectWizardV2Page))
    await waitFor(() => expect(getByIdMock).toHaveBeenCalledWith('dev-42'))
    fireEvent.change(screen.getByLabelText(/Название ЖК/i), { target: { value: 'ЖК Новый город' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Сохранить изменения/i }))
    })

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith('dev-42', {
        name: 'ЖК Новый город',
        location: {
          country: 'ge',
          city: 'batumi',
          address: 'ул. Руставели, 7',
          geo: { type: 'Point', coordinates: [41.6367, 41.6459] },
        },
        contact: { phone: '+995555000000', whatsapp: '+995555000001', telegram: '@baza' },
        classType: 'business',
        startDate: '2025-01-01',
        completionDate: '2027-06-30',
        description: 'Первая очередь',
        expectedVersion: 7,
      })
    })
    expect(navigateMock).toHaveBeenCalledWith(
      '/dashboard/development/projects',
      expect.objectContaining({ state: expect.objectContaining({ updatedDevelopmentId: 'dev-42' }) }),
    )
  })

  it('не переходит к списку и показывает ошибку, если обновление отклонено сервером', async () => {
    getByIdMock.mockResolvedValueOnce(development)
    updateMock.mockRejectedValueOnce({
      response: { status: 409, data: { error: { message: 'Версия ЖК устарела' } } },
    })
    const { ProjectWizardV2Page } = await import('@/pages/projects/ProjectWizardV2Page')

    render(createElement(ProjectWizardV2Page))
    await waitFor(() => expect(getByIdMock).toHaveBeenCalledWith('dev-42'))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Сохранить изменения/i }))
    })

    await waitFor(() => expect(screen.getByTestId('wizard-api-error-banner')).toBeDefined())
    expect(screen.getByText('Версия ЖК устарела')).toBeDefined()
    expect(navigateMock).not.toHaveBeenCalled()
  })
})
