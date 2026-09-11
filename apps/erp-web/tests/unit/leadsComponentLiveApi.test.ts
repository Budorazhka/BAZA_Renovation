/** @vitest-environment jsdom */

/**
 * LeadsComponent (apps/erp-web/src/features/crm/components/LeadsComponent.tsx)
 * переведён на leadsApiV2 (apps/api, /api/v1/leads/*) — легаси
 * api-crm.baza.sale (apiService) здесь больше не читается.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const listAllMock = vi.fn()
const createMock = vi.fn()
const updateMock = vi.fn()
const assignMock = vi.fn()
const changeStageMock = vi.fn()
const removeMock = vi.fn()

vi.mock('@/services/leadsApiV2', () => ({
  leadsApiV2: {
    listAll: listAllMock,
    create: createMock,
    update: updateMock,
    assign: assignMock,
    changeStage: changeStageMock,
    remove: removeMock,
  },
  newIdempotencyKey: () => 'test-idempotency-key',
}))

vi.mock('@/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@/features/crm/utils/leadDuplicateHelper', () => ({
  resolveDuplicateLeadForUser: vi.fn().mockResolvedValue({ assignedToCurrentUser: false }),
}))

function makeLeadV2(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    organizationId: 'org-1',
    ownerPositionId: null,
    productType: 'sales',
    stage: 'new',
    version: 5,
    source: { route: 'manual' },
    createdAt: '2026-09-01T00:00:00.000Z',
    contact: { id: 'c-1', name: 'Клиент Один', phone: '+79990000000' },
    hasOpenNextAction: false,
    stalled: false,
    ...overrides,
  }
}

async function renderComponent() {
  const { LeadsComponent } = await import('@/features/crm/components/LeadsComponent')
  return render(createElement(LeadsComponent, {}))
}

describe('LeadsComponent — лиды на leadsApiV2', () => {
  beforeEach(() => {
    listAllMock.mockReset().mockResolvedValue({ items: [], complete: true })
    createMock.mockReset()
    updateMock.mockReset()
    assignMock.mockReset()
    changeStageMock.mockReset()
    removeMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('загружает лиды через leadsApiV2.listAll, не через легаси apiService.getLeads', async () => {
    listAllMock.mockResolvedValueOnce({ items: [makeLeadV2()], complete: true })
    await renderComponent()

    await waitFor(() => expect(screen.getByText('Клиент Один')).toBeTruthy())
    expect(listAllMock).toHaveBeenCalledTimes(1)
  })

  it('создание лида с полным набором полей идёт через create+update(+assign), не через легаси createLead', async () => {
    createMock.mockResolvedValueOnce(makeLeadV2({ id: 'lead-new', version: 0 }))
    updateMock.mockResolvedValueOnce(makeLeadV2({ id: 'lead-new', version: 0 }))
    assignMock.mockResolvedValueOnce(makeLeadV2({ id: 'lead-new', version: 0 }))

    await renderComponent()
    await waitFor(() => expect(listAllMock).toHaveBeenCalledTimes(1))

    // listAllMock резолвится пустым списком — нет "Клиент Один", на который
    // можно опереться как на сигнал готовности рендера (как в остальных
    // тестах файла), поэтому синхронный getByText сразу после waitFor по
    // моку — гонка: промис резолвится раньше, чем React перерисует состояние
    // с "загрузка" на форму. findByText сам дожидается кнопки в DOM.
    fireEvent.click(await screen.findByText('crm.leadsComponent.создать_лида', {}, { timeout: 5000 }))

    fireEvent.change(screen.getByPlaceholderText('crm.leadsComponent.введите_имя_лида'), {
      target: { value: 'Иван Иванов' },
    })
    fireEvent.change(screen.getByPlaceholderText('+7 (999) 123-45-67'), {
      target: { value: '+79995554433' },
    })
    fireEvent.change(screen.getByPlaceholderText('crm.leadsComponent.дополнительная_инфор'), {
      target: { value: 'звонить вечером' },
    })
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '15000' } })

    fireEvent.click(screen.getByText('crm.leadsComponent.создать'))

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    // POST /leads принимает только requesterName/requesterPhone/productType
    // (CreateLeadV2Payload) — не легаси-набор (email/source/notes/dealValue/...).
    expect(createMock).toHaveBeenCalledWith(
      { requesterName: 'Иван Иванов', requesterPhone: '+79995554433', productType: 'sales' },
      'test-idempotency-key',
    )
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith(
        'lead-new',
        expect.objectContaining({ notes: 'звонить вечером', dealValue: 15000 }),
      ),
    )
    // assignedTo из формы (дефолт компонента) применяется отдельным assign после создания.
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith('lead-new', expect.any(String)))
  })

  it('смена стадии лида идёт через leadsApiV2.changeStage с CAS (expectedVersion)', async () => {
    listAllMock.mockResolvedValueOnce({ items: [makeLeadV2({ stage: 'new', version: 5 })], complete: true })
    changeStageMock.mockResolvedValueOnce({
      id: 'lead-1',
      organizationId: 'org-1',
      contactId: 'c-1',
      ownerPositionId: null,
      stage: 'new',
      version: 6,
      source: { route: 'manual' },
    })

    await renderComponent()
    await waitFor(() => expect(screen.getByText('Клиент Один')).toBeTruthy())

    fireEvent.click(screen.getByText('crm.leadsComponent.этап'))
    fireEvent.click(screen.getByText('crm.leadsComponent.сохранить'))

    await waitFor(() =>
      expect(changeStageMock).toHaveBeenCalledWith('lead-1', 'new', 5, 'test-idempotency-key', ''),
    )
  })

  it('удаление лида идёт через leadsApiV2.remove', async () => {
    listAllMock.mockResolvedValueOnce({ items: [makeLeadV2()], complete: true })
    removeMock.mockResolvedValueOnce({ deleted: true })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    await renderComponent()
    await waitFor(() => expect(screen.getByText('Клиент Один')).toBeTruthy())

    fireEvent.click(screen.getByText('crm.leadsComponent.удалить'))

    await waitFor(() => expect(removeMock).toHaveBeenCalledWith('lead-1'))
  })
})
