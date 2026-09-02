/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { leadsApiV2, type LeadV2 } from '@/services/leadsApiV2'
import { teamApi } from '@/services/teamApi'
import type { TeamUser } from '@/types/team'
import LeadsInboxV2Page from '@/pages/leads/LeadsInboxV2Page'

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        'leadsInbox.title': 'Входящие лиды v2',
        'leadsInbox.subtitle': 'Входящие обращения из нового бэкенда BAZA',
        'leadsInbox.refresh': 'Обновить',
        'leadsInbox.total': 'Всего лидов',
        'leadsInbox.loading': 'Загрузка лидов…',
        'leadsInbox.empty': 'Лидов не найдено',
        'leadsInbox.emptyFiltered': 'По выбранному фильтру лидов не найдено',
        'leadsInbox.errorTitle': 'Ошибка загрузки лидов',
        'leadsInbox.retry': 'Попробовать снова',
        'leadsInbox.allStages': 'Все стадии',
        'leadsInbox.stages.new': 'Новый',
        'leadsInbox.stages.contacted': 'Связались',
        'leadsInbox.stages.qualified': 'Квалифицирован',
        'leadsInbox.stages.converted': 'Сконвертирован',
        'leadsInbox.stages.lost': 'Проигран',
        'leadsInbox.columns.contact': 'Контакт',
        'leadsInbox.columns.phone': 'Телефон',
        'leadsInbox.columns.email': 'Email',
        'leadsInbox.columns.stage': 'Стадия',
        'leadsInbox.columns.createdAt': 'Дата создания',
        'leadsInbox.columns.source': 'Источник / Route',
        'leadsInbox.card.title': 'Карточка лида',
        'leadsInbox.card.leadId': 'ID лида',
        'leadsInbox.card.organizationId': 'Организация',
        'leadsInbox.card.ownerPositionId': 'Ответственная позиция',
        'leadsInbox.card.stage': 'Стадия',
        'leadsInbox.card.createdAt': 'Создан',
        'leadsInbox.card.contactInfo': 'Контактные данные',
        'leadsInbox.card.name': 'Имя',
        'leadsInbox.card.phone': 'Телефон',
        'leadsInbox.card.email': 'Email',
        'leadsInbox.card.contactId': 'ID контакта',
        'leadsInbox.card.noContact': 'Контакт не указан',
        'leadsInbox.card.sourceInfo': 'Информация об источнике',
        'leadsInbox.card.route': 'Маршрут (Route)',
        'leadsInbox.card.publicationId': 'ID публикации',
        'leadsInbox.card.referrer': 'Реферер',
        'leadsInbox.card.utm': 'UTM-метки',
        'leadsInbox.card.noUtm': 'UTM-метки отсутствуют',
        'leadsInbox.card.close': 'Закрыть',
        'leadsInbox.card.readOnlyNotice': 'Карточка лида BAZA',
        'leadsInbox.card.changeStage': 'Изменить стадию',
        'leadsInbox.card.changingStage': 'Сохранение…',
        'leadsInbox.card.changeStageSuccess': 'Стадия успешно обновлена',
        'leadsInbox.card.changeStageError': 'Ошибка обновления стадии',
        'leadsInbox.card.selectStage': 'Выберите стадию',
        'leadsInbox.card.assignError': 'Ошибка назначения',
        'leadsInbox.card.assignErrorForbidden': 'Недостаточно прав для назначения лида',
        'leadsInbox.card.assignErrorNotFound': 'Лид или позиция не найдены',
        'leadsInbox.card.assignErrorConflict': 'Позиция закрыта и не может быть назначена',
        'leadsInbox.card.assignErrorBadRequest': 'Некорректный запрос назначения',
        'leadsInbox.card.assignSuccess': 'Лид успешно назначен',
        'leadsInbox.card.assignSubmit': 'Назначить',
        'leadsInbox.card.selectPosition': 'Выберите ответственного',
        'leadsInbox.card.vacant': 'вакантна',
      }
      return dict[key] || key
    },
  }),
}))

vi.mock('@/services/leadsApiV2', () => ({
  leadsApiV2: {
    list: vi.fn(),
    getById: vi.fn(),
    changeStage: vi.fn(),
    assign: vi.fn(),
  },
}))

vi.mock('@/services/teamApi', () => ({
  teamApi: {
    list: vi.fn(),
  },
}))

const mockLeads: LeadV2[] = [
  {
    id: 'lead-1',
    organizationId: 'org-1',
    ownerPositionId: 'pos-1',
    stage: 'new',
    version: 0,
    source: {
      route: 'landing_page',
      publicationId: 'pub-100',
      utm: { source: 'google', campaign: 'spring_2026' },
      referrer: 'https://google.com',
    },
    createdAt: '2026-08-26T10:00:00.000Z',
    contact: {
      id: 'contact-1',
      name: 'Константин Иванов',
      phone: '+995599112233',
      email: 'konstantin@example.com',
    },
  },
  {
    id: 'lead-2',
    organizationId: 'org-1',
    ownerPositionId: null,
    stage: 'qualified',
    version: 0,
    source: {
      route: 'telegram_bot',
    },
    createdAt: '2026-08-26T11:00:00.000Z',
    contact: null,
  },
]

const mockPositions: TeamUser[] = [
  {
    id: 'pos-manager-1',
    platformUserId: 'user-1',
    teamId: 'team-1',
    name: 'Мария Менеджер',
    role: 'manager',
    position: 'Менеджер по продажам',
    managerId: null,
    loginEmail: 'maria@example.com',
    email: 'maria@example.com',
    status: 'active',
    skills: [],
    permissionOverrides: {},
    positionId: 'pos-manager-1',
    vacant: false,
  },
  {
    id: 'pos-vacant-1',
    platformUserId: '',
    teamId: 'team-1',
    name: '',
    role: 'manager',
    position: 'Свободная позиция',
    managerId: null,
    loginEmail: '',
    email: '',
    status: 'active',
    skills: [],
    permissionOverrides: {},
    positionId: 'pos-vacant-1',
    vacant: true,
  },
]

describe('LeadsInboxV2Page', () => {
  beforeEach(() => {
    vi.mocked(leadsApiV2.list).mockReset()
    vi.mocked(leadsApiV2.getById).mockReset()
    vi.mocked(leadsApiV2.changeStage).mockReset()
    vi.mocked(leadsApiV2.assign).mockReset()
    vi.mocked(teamApi.list).mockReset()
    vi.mocked(teamApi.list).mockResolvedValue(mockPositions)
  })

  afterEach(() => {
    cleanup()
  })

  it('отображает состояние загрузки при первом рендере', async () => {
    let resolvePromise: (value: { items: LeadV2[] }) => void = () => {}
    const pendingPromise = new Promise<{ items: LeadV2[] }>((resolve) => {
      resolvePromise = resolve
    })
    vi.mocked(leadsApiV2.list).mockReturnValue(pendingPromise)

    render(createElement(LeadsInboxV2Page))

    expect(screen.getByTestId('leads-loading')).toBeDefined()
    expect(screen.getByText('Загрузка лидов…')).toBeDefined()

    await act(async () => {
      resolvePromise({ items: [] })
    })
  })

  it('отображает список лидов и корректные данные таблицы', async () => {
    vi.mocked(leadsApiV2.list).mockResolvedValue({ items: mockLeads })

    render(createElement(LeadsInboxV2Page))

    await waitFor(() => {
      expect(screen.getByTestId('leads-table')).toBeDefined()
    })

    expect(screen.getByText('Константин Иванов')).toBeDefined()
    expect(screen.getByText('+995599112233')).toBeDefined()
    expect(screen.getByText('konstantin@example.com')).toBeDefined()
    expect(screen.getByText('landing_page')).toBeDefined()
    expect(screen.getByText('(pub: pub-100)')).toBeDefined()
    expect(screen.getByText('telegram_bot')).toBeDefined()
  })

  it('отображает состояние пустого списка при отсутствии лидов', async () => {
    vi.mocked(leadsApiV2.list).mockResolvedValue({ items: [] })

    render(createElement(LeadsInboxV2Page))

    await waitFor(() => {
      expect(screen.getByTestId('leads-empty')).toBeDefined()
    })

    expect(screen.getByText('Лидов не найдено')).toBeDefined()
  })

  it('отображает ошибку API и даёт возможность повторить запрос', async () => {
    vi.mocked(leadsApiV2.list).mockRejectedValueOnce(new Error('Server unavailable'))

    render(createElement(LeadsInboxV2Page))

    await waitFor(() => {
      expect(screen.getByTestId('leads-error')).toBeDefined()
    })

    expect(screen.getByText('Server unavailable')).toBeDefined()

    vi.mocked(leadsApiV2.list).mockResolvedValue({ items: mockLeads })

    await act(async () => {
      fireEvent.click(screen.getByText('Попробовать снова'))
    })

    await waitFor(() => {
      expect(screen.getByTestId('leads-table')).toBeDefined()
    })
    expect(screen.getByText('Константин Иванов')).toBeDefined()
  })

  it('фильтрует лиды по стадиям при клике на вкладку фильтра', async () => {
    vi.mocked(leadsApiV2.list).mockResolvedValue({ items: mockLeads })

    render(createElement(LeadsInboxV2Page))

    await waitFor(() => {
      expect(screen.getByTestId('leads-table')).toBeDefined()
    })

    expect(leadsApiV2.list).toHaveBeenCalledWith({})

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /Квалифицирован/i }))
    })

    expect(leadsApiV2.list).toHaveBeenCalledWith({ stage: 'qualified' })
  })

  it('открывает карточку лида по клику на строку и позволяет успешно сменить стадию через PATCH', async () => {
    vi.mocked(leadsApiV2.list).mockResolvedValue({ items: mockLeads })
    // Новый API намеренно возвращает результат команды, а не полную
    // read-модель LeadV2. Карточка не должна потерять контакт/дату из-за
    // такого ответа.
    const updatedLead = {
      id: 'lead-1',
      organizationId: 'org-1',
      contactId: 'contact-1',
      ownerPositionId: 'pos-1',
      stage: 'contacted',
      version: 1,
      source: { route: 'landing_page' },
    }
    vi.mocked(leadsApiV2.changeStage).mockResolvedValueOnce(updatedLead)

    render(createElement(LeadsInboxV2Page))

    await waitFor(() => {
      expect(screen.getByText('Константин Иванов')).toBeDefined()
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Константин Иванов'))
    })

    expect(screen.getByText('Карточка лида')).toBeDefined()
    expect(screen.getByText('lead-1')).toBeDefined()
    expect(screen.getByText('org-1')).toBeDefined()
    expect(screen.getByText('pos-1')).toBeDefined()
    expect(screen.getByText('https://google.com')).toBeDefined()

    // Кликаем по кнопке смены стадии на "Связались"
    const contactedButtons = screen.getAllByRole('button', { name: /Связались/i })
    // Вторая кнопка — в модалке (первая — вкладка фильтра)
    const modalStageButton = contactedButtons[contactedButtons.length - 1]!

    await act(async () => {
      fireEvent.click(modalStageButton)
    })

    expect(leadsApiV2.changeStage).toHaveBeenCalledWith('lead-1', 'contacted', 0)

    await waitFor(() => {
      expect(screen.getByTestId('stage-success-banner')).toBeDefined()
      expect(screen.getByText('Стадия успешно обновлена')).toBeDefined()
    })

    // Email до изменения виден в строке и в карточке. После ответа команды
    // он должен остаться в карточке, а не быть затёрт частичным payload.
    expect(screen.getAllByText('konstantin@example.com')).toHaveLength(2)
  })

  it('отображает понятное сообщение об ошибке при сбое смены стадии (403 Forbidden)', async () => {
    vi.mocked(leadsApiV2.list).mockResolvedValue({ items: mockLeads })
    const error403 = {
      response: {
        status: 403,
        data: { message: 'Forbidden' },
      },
    }
    vi.mocked(leadsApiV2.changeStage).mockRejectedValueOnce(error403)

    render(createElement(LeadsInboxV2Page))

    await waitFor(() => {
      expect(screen.getByText('Константин Иванов')).toBeDefined()
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Константин Иванов'))
    })

    const contactedButtons = screen.getAllByRole('button', { name: /Связались/i })
    const modalStageButton = contactedButtons[contactedButtons.length - 1]!

    await act(async () => {
      fireEvent.click(modalStageButton)
    })

    await waitFor(() => {
      expect(screen.getByTestId('stage-error-banner')).toBeDefined()
      expect(screen.getByText(/403 Forbidden/i)).toBeDefined()
    })
  })

  describe('D-05B: назначение лида на Position', () => {
    async function openLeadCard() {
      vi.mocked(leadsApiV2.list).mockResolvedValue({ items: mockLeads })
      render(createElement(LeadsInboxV2Page))
      await waitFor(() => {
        expect(screen.getByText('Константин Иванов')).toBeDefined()
      })
      await act(async () => {
        fireEvent.click(screen.getByText('Константин Иванов'))
      })
      await waitFor(() => {
        expect(teamApi.list).toHaveBeenCalledTimes(1)
      })
    }

    it('список Position загружается через teamApi при открытии карточки, вакантные помечены', async () => {
      await openLeadCard()

      const select = screen.getByDisplayValue('Выберите ответственного') as HTMLSelectElement
      const optionLabels = Array.from(select.options).map((o) => o.textContent)
      expect(optionLabels).toContain('Менеджер по продажам')
      expect(optionLabels).toContain('Свободная позиция (вакантна)')
    })

    it('успешное назначение вызывает POST /assign и обновляет карточку без потери contact/source/stage', async () => {
      // source отражает то же самое, что реально хранится в Lead-документе
      // (backend возвращает lead.source целиком, не урезанную версию) —
      // referrer/publicationId/utm не должны теряться после assign.
      const assignResult = {
        id: 'lead-1',
        organizationId: 'org-1',
        contactId: 'contact-1',
        ownerPositionId: 'pos-manager-1',
        stage: 'new',
        source: mockLeads[0]!.source,
      }
      vi.mocked(leadsApiV2.assign).mockResolvedValueOnce(assignResult)

      await openLeadCard()

      const select = screen.getByDisplayValue('Выберите ответственного') as HTMLSelectElement
      fireEvent.change(select, { target: { value: 'pos-manager-1' } })

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Назначить/i }))
      })

      expect(leadsApiV2.assign).toHaveBeenCalledWith('lead-1', 'pos-manager-1')

      await waitFor(() => {
        expect(screen.getByTestId('assign-success-banner')).toBeDefined()
      })

      // stage/contact/source из уже загруженной read-модели не должны
      // потеряться после частичного ответа команды assign.
      expect(screen.getByText('https://google.com')).toBeDefined()
      expect(screen.getAllByText('konstantin@example.com')).toHaveLength(2)
    })

    it('403/404/409/400 при назначении показывают понятные сообщения пользователю', async () => {
      await openLeadCard()
      const select = screen.getByDisplayValue('Выберите ответственного') as HTMLSelectElement
      const submitButton = () => screen.getByRole('button', { name: /Назначить/i })

      const cases: Array<[number, string]> = [
        [403, 'Недостаточно прав для назначения лида'],
        [404, 'Лид или позиция не найдены'],
        [409, 'Позиция закрыта и не может быть назначена'],
        [400, 'Некорректный запрос назначения'],
      ]

      for (const [status, expectedMessage] of cases) {
        vi.mocked(leadsApiV2.assign).mockRejectedValueOnce({ response: { status, data: {} } })
        fireEvent.change(select, { target: { value: 'pos-manager-1' } })

        await act(async () => {
          fireEvent.click(submitButton())
        })

        await waitFor(() => {
          expect(screen.getByTestId('assign-error-banner')).toBeDefined()
          expect(screen.getByText(expectedMessage)).toBeDefined()
        })
      }
    })

    it('повторный клик по кнопке Назначить синхронно (до resolve первого) вызывает assign только один раз', async () => {
      let resolveAssign: (value: typeof mockAssignResult) => void = () => {}
      const mockAssignResult = {
        id: 'lead-1',
        organizationId: 'org-1',
        contactId: 'contact-1',
        ownerPositionId: 'pos-manager-1',
        stage: 'new',
        source: { route: 'landing_page' },
      }
      const pending = new Promise<typeof mockAssignResult>((resolve) => {
        resolveAssign = resolve
      })
      vi.mocked(leadsApiV2.assign).mockReturnValueOnce(pending)

      await openLeadCard()
      const select = screen.getByDisplayValue('Выберите ответственного') as HTMLSelectElement
      fireEvent.change(select, { target: { value: 'pos-manager-1' } })

      const submitButton = screen.getByRole('button', { name: /Назначить/i })
      await act(async () => {
        fireEvent.click(submitButton)
        fireEvent.click(submitButton)
      })

      await act(async () => {
        resolveAssign(mockAssignResult)
      })

      expect(leadsApiV2.assign).toHaveBeenCalledTimes(1)
    })
  })
})
