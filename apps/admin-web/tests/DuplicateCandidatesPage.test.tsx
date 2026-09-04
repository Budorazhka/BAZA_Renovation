/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

function makeDuplicateCandidate(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'dup1',
    status: 'detected',
    signals: { phoneMatch: true, addressMatch: true, roomsAreaFloorMatch: false },
    detectedAt: '2026-08-20T10:00:00.000Z',
    overrideReason: null,
    overrideAt: null,
    confirmReason: null,
    confirmedAt: null,
    assetA: {
      id: 'assetA1',
      propertyType: 'apartment',
      location: { city: 'batumi', address: 'ул. Руставели 15' },
      characteristics: { area: 55, rooms: 2, floor: 4 },
      representativePhone: '+995555111222',
      publisherScope: { type: 'organization', organizationId: 'org1' },
    },
    assetB: {
      id: 'assetB1',
      propertyType: 'apartment',
      location: { city: 'batumi', address: 'ул. Руставели, д. 15' },
      characteristics: { area: 55, rooms: 2, floor: 4 },
      representativePhone: '+995555111222',
      publisherScope: { type: 'organization', organizationId: 'org2' },
    },
    ...overrides,
  }
}

function mockAdminApi(overrides: {
  listDuplicateCandidates?: (...args: unknown[]) => Promise<unknown>
  confirmDuplicate?: (...args: unknown[]) => Promise<unknown>
}) {
  vi.doMock('../src/api/admin-api', async () => {
    const actual = await vi.importActual<typeof import('../src/api/admin-api')>('../src/api/admin-api')
    return {
      ...actual,
      adminApi: {
        ...actual.adminApi,
        me: () => Promise.resolve({ adminAccountId: 'a1', isSuperAdmin: false, publicationReadScope: 'all' }),
        listDuplicateCandidates:
          overrides.listDuplicateCandidates ?? (() => Promise.resolve({ items: [makeDuplicateCandidate()], nextCursor: null })),
        confirmDuplicate:
          overrides.confirmDuplicate ??
          ((id: string) => Promise.resolve({ id, status: 'confirmed_duplicate' })),
      },
    }
  })
}

async function renderDuplicateCandidatesPage() {
  const { AdminAuthProvider } = await import('../src/hooks/useAdminAuth')
  const { RequireAdmin } = await import('../src/hooks/RequireAdmin')
  const { DuplicateCandidatesPage } = await import('../src/pages/DuplicateCandidatesPage')

  return render(
    <MemoryRouter initialEntries={['/duplicate-candidates']}>
      <AdminAuthProvider>
        <RequireAdmin>
          <DuplicateCandidatesPage />
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

describe('DuplicateCandidatesPage', () => {
  it('loads and displays duplicate candidate pairs and signals in the table', async () => {
    mockAdminApi({})
    await renderDuplicateCandidatesPage()

    await waitFor(() => {
      expect(screen.queryByText(/Руставели 15/)).not.toBeNull()
      expect(screen.queryByText(/Руставели, д\. 15/)).not.toBeNull()
      expect(screen.queryByText('Телефон')).not.toBeNull()
      expect(screen.queryByText('Адрес')).not.toBeNull()
      expect(screen.queryAllByText('Обнаружен системой').length).toBeGreaterThan(0)
    })
  })

  it('filters duplicate candidates by status', async () => {
    const listDuplicateCandidates = vi.fn(() =>
      Promise.resolve({ items: [makeDuplicateCandidate({ status: 'confirmed_duplicate' })], nextCursor: null }),
    )
    mockAdminApi({ listDuplicateCandidates })
    await renderDuplicateCandidatesPage()

    await waitFor(() => expect(listDuplicateCandidates).toHaveBeenCalledTimes(1))

    const select = screen.getByLabelText('Статус')
    fireEvent.change(select, { target: { value: 'confirmed_duplicate' } })
    fireEvent.click(screen.getByRole('button', { name: 'Применить' }))

    await waitFor(() => {
      expect(listDuplicateCandidates).toHaveBeenCalledWith(expect.objectContaining({ status: 'confirmed_duplicate' }))
    })
  })

  it('confirming duplicate requires reason >= 10 chars, sends POST /confirm, and updates row to confirmed_duplicate', async () => {
    const confirmDuplicate = vi.fn((id: string, reason: string) =>
      Promise.resolve({ id, status: 'confirmed_duplicate' }),
    )
    mockAdminApi({ confirmDuplicate })
    await renderDuplicateCandidatesPage()

    await waitFor(() => expect(screen.queryByText('Подтвердить дубль')).not.toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить дубль' }))

    expect(screen.queryByRole('alertdialog')).not.toBeNull()
    expect(screen.queryByText('Подтвердить дубликат?')).not.toBeNull()

    const submitBtn = screen.getAllByRole('button', { name: 'Подтвердить дубль' })[1] as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'коротко' } })
    expect(submitBtn.disabled).toBe(true)

    fireEvent.change(textarea, { target: { value: 'Совпадают все характеристики и контакты' } })
    expect(submitBtn.disabled).toBe(false)

    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(confirmDuplicate).toHaveBeenCalledWith('dup1', 'Совпадают все характеристики и контакты')
      expect(screen.queryByText('Подтверждён администратором')).not.toBeNull()
    })
  })
})
