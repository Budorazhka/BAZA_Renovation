/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

function makeComplaint(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'comp1',
    status: 'pending',
    category: 'wrong_info',
    details: 'Неверно указана цена объекта',
    propertyAssetId: 'asset1',
    listingId: 'listing1',
    scopeCity: 'batumi',
    respondentScope: { type: 'organization', organizationId: 'org1' },
    createdAt: '2026-08-20T10:00:00.000Z',
    resolvedAt: null,
    resolutionReason: null,
    ...overrides,
  }
}

function mockAdminApi(overrides: {
  listComplaints?: (...args: unknown[]) => Promise<unknown>
  resolveComplaint?: (...args: unknown[]) => Promise<unknown>
}) {
  vi.doMock('../src/api/admin-api', async () => {
    const actual = await vi.importActual<typeof import('../src/api/admin-api')>('../src/api/admin-api')
    return {
      ...actual,
      adminApi: {
        ...actual.adminApi,
        me: () => Promise.resolve({ adminAccountId: 'a1', isSuperAdmin: false, publicationReadScope: 'all' }),
        listComplaints: overrides.listComplaints ?? (() => Promise.resolve({ items: [makeComplaint()], nextCursor: null })),
        resolveComplaint: overrides.resolveComplaint ?? ((id: string, params: { decision: string }) =>
          Promise.resolve({ id, status: params.decision === 'upheld' ? 'resolved_upheld' : 'resolved_dismissed' })),
      },
    }
  })
}

async function renderComplaintsPage() {
  const { AdminAuthProvider } = await import('../src/hooks/useAdminAuth')
  const { RequireAdmin } = await import('../src/hooks/RequireAdmin')
  const { ComplaintsPage } = await import('../src/pages/ComplaintsPage')

  return render(
    <MemoryRouter initialEntries={['/complaints']}>
      <AdminAuthProvider>
        <RequireAdmin>
          <ComplaintsPage />
        </RequireAdmin>
      </AdminAuthProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.resetModules()
  vi.clearAllMocks()
})

describe('ComplaintsPage', () => {
  it('loads and displays complaints in the table', async () => {
    mockAdminApi({})
    await renderComplaintsPage()

    await waitFor(() => {
      expect(screen.queryByText('Недостоверная информация')).not.toBeNull()
      expect(screen.queryByText('batumi')).not.toBeNull()
      expect(screen.queryByText('Неверно указана цена объекта')).not.toBeNull()
      expect(screen.queryByText('listing1')).not.toBeNull()
      expect(screen.queryAllByText('Ожидает проверки').length).toBeGreaterThan(0)
    })
  })

  it('filters complaints by status', async () => {
    const listComplaints = vi.fn(() => Promise.resolve({ items: [makeComplaint({ status: 'resolved_upheld' })], nextCursor: null }))
    mockAdminApi({ listComplaints })
    await renderComplaintsPage()

    await waitFor(() => expect(listComplaints).toHaveBeenCalledTimes(1))

    const select = screen.getByLabelText('Статус')
    fireEvent.change(select, { target: { value: 'resolved_upheld' } })
    fireEvent.click(screen.getByRole('button', { name: 'Применить' }))

    await waitFor(() => {
      expect(listComplaints).toHaveBeenCalledWith(expect.objectContaining({ status: 'resolved_upheld' }))
    })
  })

  it('resolving complaint as upheld requires reason >= 10 chars, sends POST /resolve, and updates row', async () => {
    const resolveComplaint = vi.fn((id: string, params: { decision: string; reason: string }) =>
      Promise.resolve({ id, status: 'resolved_upheld' }),
    )
    mockAdminApi({ resolveComplaint })
    await renderComplaintsPage()

    await waitFor(() => expect(screen.queryByText('Удовлетворить')).not.toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Удовлетворить' }))

    expect(screen.queryByRole('alertdialog')).not.toBeNull()
    expect(screen.queryByText('Удовлетворить жалобу?')).not.toBeNull()

    const submitBtn = screen.getAllByRole('button', { name: 'Удовлетворить' })[1] as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'коротко' } })
    expect(submitBtn.disabled).toBe(true)

    fireEvent.change(textarea, { target: { value: 'Нарушение подтверждено модератором' } })
    expect(submitBtn.disabled).toBe(false)

    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(resolveComplaint).toHaveBeenCalledWith('comp1', {
        decision: 'upheld',
        reason: 'Нарушение подтверждено модератором',
      })
      expect(screen.queryByText('Удовлетворена (снято)')).not.toBeNull()
    })
  })

  it('resolving complaint as dismissed requires reason >= 10 chars and sends POST /resolve with dismissed', async () => {
    const resolveComplaint = vi.fn((id: string, params: { decision: string; reason: string }) =>
      Promise.resolve({ id, status: 'resolved_dismissed' }),
    )
    mockAdminApi({ resolveComplaint })
    await renderComplaintsPage()

    await waitFor(() => expect(screen.queryByText('Отклонить')).not.toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Отклонить' }))

    expect(screen.queryByRole('alertdialog')).not.toBeNull()
    expect(screen.queryByText('Отклонить жалобу?')).not.toBeNull()

    const submitBtn = screen.getAllByRole('button', { name: 'Отклонить' })[1] as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Информация проверена, нарушений нет' } })
    expect(submitBtn.disabled).toBe(false)

    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(resolveComplaint).toHaveBeenCalledWith('comp1', {
        decision: 'dismissed',
        reason: 'Информация проверена, нарушений нет',
      })
      expect(screen.queryByText('Отклонена')).not.toBeNull()
    })
  })
})
