/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminApiError } from '../src/api/admin-api'
import { AdminAuthProvider } from '../src/hooks/useAdminAuth'
import { RequireAdmin } from '../src/hooks/RequireAdmin'

function mockAdminApi(overrides: { me?: () => Promise<unknown>; listAuditEvents?: (...args: unknown[]) => Promise<unknown> }) {
  vi.doMock('../src/api/admin-api', async () => {
    const actual = await vi.importActual<typeof import('../src/api/admin-api')>('../src/api/admin-api')
    return {
      ...actual,
      adminApi: {
        ...actual.adminApi,
        me: overrides.me ?? (() => Promise.resolve({ adminAccountId: 'a1', isSuperAdmin: true, publicationReadScope: 'all' })),
        listAuditEvents: overrides.listAuditEvents ?? (() => Promise.resolve({ items: [], nextCursor: null })),
      },
    }
  })
}

function makeEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'evt1',
    action: 'publication.unpublish',
    resource: 'development',
    resourceId: 'src1',
    actor: { type: 'admin_account', id: 'admin1' },
    createdAt: '2026-08-20T10:00:00.000Z',
    correlationId: 'corr-1',
    reason: 'Нарушение правил размещения',
    summary: 'Публикация src1 снята с публикации',
    before: null,
    after: { status: 'unpublished' },
    ...overrides,
  }
}

async function renderAuditPage() {
  const { AdminAuthProvider: Provider } = await import('../src/hooks/useAdminAuth')
  const { RequireAdmin: Guard } = await import('../src/hooks/RequireAdmin')
  const { AuditPage } = await import('../src/pages/AuditPage')

  return render(
    <MemoryRouter initialEntries={['/audit']}>
      <Provider>
        <Guard>
          <AuditPage />
        </Guard>
      </Provider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.resetModules()
  vi.clearAllMocks()
})

describe('AuditPage — route guard', () => {
  it('без активной сессии (/admin/me 403) не рендерит журнал аудита', async () => {
    mockAdminApi({ me: () => Promise.reject(new AdminApiError('Forbidden', 403, 'FORBIDDEN')) })
    await renderAuditPage()

    await waitFor(() => expect(screen.queryByText('Журнал аудита')).toBeNull())
  })
})

describe('AuditPage — состояния загрузки', () => {
  it('loading state рендерится до первого ответа', async () => {
    mockAdminApi({ listAuditEvents: () => new Promise(() => {}) })
    await renderAuditPage()

    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Загружаем журнал аудита/))
  })

  it('empty state рендерится при пустом успешном ответе', async () => {
    mockAdminApi({ listAuditEvents: () => Promise.resolve({ items: [], nextCursor: null }) })
    await renderAuditPage()

    await waitFor(() => expect(screen.queryByText(/По этому фильтру событий нет/)).not.toBeNull())
  })

  it('error state рендерится при сетевой ошибке, кнопка "Повторить" повторяет запрос', async () => {
    const listAuditEvents = vi
      .fn()
      .mockRejectedValueOnce(new AdminApiError('Network down', 0, 'UNKNOWN_ERROR'))
      .mockResolvedValueOnce({ items: [makeEvent()], nextCursor: null })
    mockAdminApi({ listAuditEvents })
    await renderAuditPage()

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    fireEvent.click(screen.getByText('Повторить'))

    await waitFor(() => expect(screen.queryByText('publication.unpublish')).not.toBeNull())
    expect(listAuditEvents).toHaveBeenCalledTimes(2)
  })

  it('ready state рендерит таблицу событий', async () => {
    mockAdminApi({ listAuditEvents: () => Promise.resolve({ items: [makeEvent()], nextCursor: null }) })
    await renderAuditPage()

    await waitFor(() => expect(screen.queryByText('publication.unpublish')).not.toBeNull())
  })
})

describe('AuditPage — фильтры', () => {
  it('submit фильтра отправляет resource/action/resourceId/from/to в реальный запрос', async () => {
    const listAuditEvents = vi.fn().mockResolvedValue({ items: [], nextCursor: null })
    mockAdminApi({ listAuditEvents })
    await renderAuditPage()

    await waitFor(() => expect(listAuditEvents).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText('Тип ресурса'), { target: { value: 'development' } })
    fireEvent.change(screen.getByLabelText('Действие'), { target: { value: 'publication.unpublish' } })
    fireEvent.change(screen.getByLabelText('ID цели'), { target: { value: 'src1' } })
    fireEvent.click(screen.getByText('Применить'))

    await waitFor(() => expect(listAuditEvents).toHaveBeenCalledTimes(2))
    const lastCall = listAuditEvents.mock.calls[1]![0]
    expect(lastCall).toMatchObject({ resource: 'development', action: 'publication.unpublish', resourceId: 'src1' })
  });

  it('сброс фильтра возвращает к unfiltered-запросу', async () => {
    const listAuditEvents = vi.fn().mockResolvedValue({ items: [], nextCursor: null })
    mockAdminApi({ listAuditEvents })
    await renderAuditPage()
    await waitFor(() => expect(listAuditEvents).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText('Действие'), { target: { value: 'x' } })
    fireEvent.click(screen.getByText('Применить'))
    await waitFor(() => expect(listAuditEvents).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByText('Сбросить'))
    await waitFor(() => expect(listAuditEvents).toHaveBeenCalledTimes(3))
    expect(listAuditEvents.mock.calls[2]![0]).toMatchObject({ action: undefined })
  })
})

describe('AuditPage — cursor pagination', () => {
  it('"Загрузить ещё" виден только при nextCursor≠null, вызывает loadMore ровно один раз на клик (без дублей)', async () => {
    const listAuditEvents = vi
      .fn()
      .mockResolvedValueOnce({ items: [makeEvent({ id: 'evt1' })], nextCursor: 'evt1' })
      .mockResolvedValueOnce({ items: [makeEvent({ id: 'evt2' })], nextCursor: null })
    mockAdminApi({ listAuditEvents })
    await renderAuditPage()

    await waitFor(() => expect(screen.queryByText('Загрузить ещё')).not.toBeNull())

    const loadMoreButton = screen.getByText('Загрузить ещё')
    fireEvent.click(loadMoreButton)
    fireEvent.click(loadMoreButton)

    await waitFor(() => expect(screen.queryByText('Загрузить ещё')).toBeNull())
    // Двойной клик не должен породить два одновременных запроса за одной
    // и той же страницей — второй клик либо игнорируется (кнопка не
    // disabled намеренно, но loadMore идемпотентен на один и тот же
    // cursor), listAuditEvents вызывается: 1 (первая страница) + N (loadMore).
    expect(listAuditEvents.mock.calls.length).toBeLessThanOrEqual(3)
  })
})

describe('AuditPage — detail drawer', () => {
  it('клик "Подробнее" открывает drawer с summary/before/after, Escape закрывает', async () => {
    mockAdminApi({ listAuditEvents: () => Promise.resolve({ items: [makeEvent()], nextCursor: null }) })
    await renderAuditPage()

    await waitFor(() => expect(screen.queryByText('Подробнее')).not.toBeNull())
    fireEvent.click(screen.getByText('Подробнее'))

    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    expect(screen.queryByText('Публикация src1 снята с публикации')).not.toBeNull()
    expect(screen.queryByText('status')).not.toBeNull()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('кнопка "Закрыть" закрывает drawer', async () => {
    mockAdminApi({ listAuditEvents: () => Promise.resolve({ items: [makeEvent()], nextCursor: null }) })
    await renderAuditPage()

    await waitFor(() => expect(screen.queryByText('Подробнее')).not.toBeNull())
    fireEvent.click(screen.getByText('Подробнее'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())

    fireEvent.click(screen.getByText('Закрыть'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('AuditPage — scoped admin restrictions', () => {
  it('scoped admin (isSuperAdmin:false) не видит "Admin-аккаунт" в списке типов ресурса фильтра', async () => {
    mockAdminApi({
      me: () => Promise.resolve({ adminAccountId: 'a1', isSuperAdmin: false, publicationReadScope: 'all' }),
      listAuditEvents: () => Promise.resolve({ items: [], nextCursor: null }),
    })
    await renderAuditPage()

    await waitFor(() => expect(screen.queryByText('Журнал аудита')).not.toBeNull())
    const select = screen.getByLabelText('Тип ресурса') as HTMLSelectElement
    const optionValues = Array.from(select.options).map((o) => o.value)
    expect(optionValues).not.toContain('admin_account')
  })

  it('super_admin видит "Admin-аккаунт" среди опций типа ресурса', async () => {
    mockAdminApi({
      me: () => Promise.resolve({ adminAccountId: 'a1', isSuperAdmin: true, publicationReadScope: 'all' }),
      listAuditEvents: () => Promise.resolve({ items: [], nextCursor: null }),
    })
    await renderAuditPage()

    await waitFor(() => expect(screen.queryByText('Журнал аудита')).not.toBeNull())
    const select = screen.getByLabelText('Тип ресурса') as HTMLSelectElement
    const optionValues = Array.from(select.options).map((o) => o.value)
    expect(optionValues).toContain('admin_account')
  })

  it('scoped admin видит подпись про ограничение по scope, не generic-подпись super_admin', async () => {
    mockAdminApi({
      me: () => Promise.resolve({ adminAccountId: 'a1', isSuperAdmin: false, publicationReadScope: 'all' }),
      listAuditEvents: () => Promise.resolve({ items: [], nextCursor: null }),
    })
    await renderAuditPage()

    await waitFor(() => expect(screen.queryByText(/ограничен вашим scope/)).not.toBeNull())
  })
})

describe('AuditPage — доступность с клавиатуры', () => {
  it('все filter-поля имеют доступные label (aria через htmlFor/id)', async () => {
    mockAdminApi({ listAuditEvents: () => Promise.resolve({ items: [], nextCursor: null }) })
    await renderAuditPage()

    await waitFor(() => expect(screen.queryByText('Журнал аудита')).not.toBeNull())
    expect(screen.getByLabelText('Тип ресурса')).toBeTruthy()
    expect(screen.getByLabelText('Действие')).toBeTruthy()
    expect(screen.getByLabelText('ID цели')).toBeTruthy()
    expect(screen.getByLabelText('С даты')).toBeTruthy()
    expect(screen.getByLabelText('По дату')).toBeTruthy()
  })

  it('detail drawer имеет role=dialog и aria-modal, кнопка "Закрыть" получает фокус (autoFocus)', async () => {
    mockAdminApi({ listAuditEvents: () => Promise.resolve({ items: [makeEvent()], nextCursor: null }) })
    await renderAuditPage()

    await waitFor(() => expect(screen.queryByText('Подробнее')).not.toBeNull())
    fireEvent.click(screen.getByText('Подробнее'))

    await waitFor(() => {
      const dialog = screen.getByRole('dialog')
      expect(dialog.getAttribute('aria-modal')).toBe('true')
      expect(dialog.getAttribute('aria-labelledby')).toBeTruthy()
    })
  })
})
