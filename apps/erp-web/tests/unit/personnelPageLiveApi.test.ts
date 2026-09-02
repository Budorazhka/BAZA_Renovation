/** @vitest-environment jsdom */

/**
 * Реестр команды (`PersonnelPage`) читает состав через `teamApi.ts` →
 * Platform API. Тест мокает не сам `teamApi`, а слой ниже — HTTP-клиент
 * (`axios.create`), чтобы закрепить границу целиком: экран → teamApi →
 * реальный HTTP-запрос, без подстановки мок-массива `MOCK_EMPLOYEES` или
 * записи/чтения `localStorage` как источника состава команды.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()
const postMock = vi.fn()

vi.mock('axios', () => ({
  default: {
    create: () => ({ get: getMock, post: postMock, patch: vi.fn(), delete: vi.fn() }),
  },
}))

vi.mock('@/i18n', () => ({
  useI18n: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: { id: 'pos-owner', role: 'owner', teamRole: 'owner', companyId: 'org-1' },
    updateProfile: vi.fn(),
  }),
}))

const SERVER_POSITION = {
  id: 'pos-owner',
  platformUserId: 'ident-1',
  teamId: 'org-1',
  name: 'Настоящий Сотрудник С Сервера',
  role: 'owner',
  position: 'Собственник',
  managerId: null,
  loginEmail: 'owner@example.com',
  email: 'owner@example.com',
  status: 'active',
  skills: [],
  permissionOverrides: {},
  positionId: 'pos-owner',
  parentPositionId: null,
  vacant: false,
  occupancyHistory: [],
}

async function renderPage() {
  const { PersonnelPage } = await import('@/components/personnel/PersonnelPage')
  return render(createElement(PersonnelPage))
}

describe('PersonnelPage: реестр команды идёт через HTTP-клиент, не через мок', () => {
  beforeEach(() => {
    getMock.mockReset()
    postMock.mockReset()
    vi.resetModules()
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('запрашивает состав команды по GET /api/v1/team-users и рисует имя с сервера', async () => {
    postMock.mockResolvedValue({ data: { success: true, data: null } }) // ensure-self
    getMock.mockResolvedValue({ data: { success: true, data: [SERVER_POSITION] } })

    await renderPage()

    expect((await screen.findAllByText('Настоящий Сотрудник С Сервера')).length).toBeGreaterThan(0)
    expect(getMock).toHaveBeenCalledWith('/api/v1/team-users')
  })

  it('при отказе сервера не подставляет ни одного вымышленного сотрудника', async () => {
    postMock.mockResolvedValue({ data: { success: true, data: null } })
    getMock.mockRejectedValue({ response: { status: 500 } })

    await renderPage()

    await waitFor(() => expect(screen.queryByText(/Не удалось загрузить команду/)).toBeTruthy())
    // Имена из старого MOCK_EMPLOYEES/mockSeed не должны появиться ни при каком отказе.
    expect(screen.queryByText('Артём Власов')).toBeNull()
    expect(screen.queryByText('Анна Первичкина')).toBeNull()
  })

  it('не читает состав команды из localStorage', async () => {
    localStorage.setItem(
      'mock_team_accounts_v2',
      JSON.stringify([{ id: 'leftover', name: 'Мусор Из Старого Мока', role: 'manager', position: 'Менеджер', managerId: null }]),
    )
    postMock.mockResolvedValue({ data: { success: true, data: null } })
    getMock.mockResolvedValue({ data: { success: true, data: [SERVER_POSITION] } })

    await renderPage()

    await screen.findAllByText('Настоящий Сотрудник С Сервера')
    expect(screen.queryByText('Мусор Из Старого Мока')).toBeNull()
  })
})
