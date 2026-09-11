/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdminOrganizationListItem } from '../src/types/admin'

/**
 * ИСПРАВЛЕНО 11.09.2026: OrganizationBillingModal раньше держал каталог
 * тарифов (AVAILABLE_PLANS) захардкоженным в компоненте — дублировал
 * DEFAULT_PLANS backend'а. Тот же принцип, что no-mock-data.test.tsx:
 * strictFetcher бросает на любой URL за пределами настоящего admin API —
 * если бы дропдаун плана рисовался из локальных данных без единого
 * обращения к /admin/billing/plans, это осталось бы незамеченным.
 */
const { strictFetcher } = vi.hoisted(() => ({
  strictFetcher: vi.fn(async (url: string | URL | Request) => {
    const href = typeof url === 'string' ? url : url.toString()
    if (href.endsWith('/admin/billing/plans')) {
      return new Response(
        JSON.stringify([
          {
            code: 'developer_trial',
            name: 'Developer Trial',
            targetAudience: 'developer',
            limits: { maxActiveListings: 20, maxTeamPositions: 5, crmAccess: true, chessboardAccess: true, landingAccess: false },
            pricePerMonth: { amountMinorUnits: 0, currency: 'USD' },
            isActive: true,
          },
          {
            code: 'agency_pro',
            name: 'Agency Pro',
            targetAudience: 'agency',
            limits: { maxActiveListings: 150, maxTeamPositions: 25, crmAccess: true, chessboardAccess: true, landingAccess: true },
            pricePerMonth: { amountMinorUnits: 14900, currency: 'USD' },
            isActive: true,
          },
        ]),
        { status: 200 },
      )
    }
    if (href.includes('/billing')) {
      return new Response(
        JSON.stringify({
          subscription: {
            organizationId: 'org-1',
            planCode: 'agency_trial',
            status: 'trial',
            startedAt: '2026-09-01T00:00:00.000Z',
            expiresAt: '2026-09-15T00:00:00.000Z',
            currentUsage: { activeListings: 0, teamPositions: 1 },
          },
          plan: null,
          effectiveLimits: { maxActiveListings: 30, maxTeamPositions: 5, crmAccess: true, chessboardAccess: true, landingAccess: false },
          ledger: [],
        }),
        { status: 200 },
      )
    }
    throw new Error(`Unexpected fetch outside the real admin API client: ${href}`)
  }),
}))

vi.mock('../src/api/admin-api', async () => {
  const actual = await vi.importActual<typeof import('../src/api/admin-api')>('../src/api/admin-api')
  return { ...actual, adminApi: actual.createAdminApi({ baseUrl: 'https://api.example.test/api/v1', fetcher: strictFetcher }) }
})

afterEach(() => {
  cleanup()
  strictFetcher.mockClear()
})

const organization: AdminOrganizationListItem = {
  id: 'org-1',
  name: 'Тестовая организация',
  type: 'agency',
  status: 'active',
  createdAt: '2026-09-01T00:00:00.000Z',
}

describe('OrganizationBillingModal: каталог тарифов приходит с реального сервера, не из захардкоженного списка', () => {
  it('дропдаун плана рисуется из GET /admin/billing/plans, не из локальной копии', async () => {
    const { OrganizationBillingModal } = await import('../src/components/OrganizationBillingModal')

    render(createElement(OrganizationBillingModal, { organization, onClose: vi.fn() }))

    await waitFor(() =>
      expect(strictFetcher).toHaveBeenCalledWith(
        expect.stringContaining('/admin/billing/plans'),
        expect.objectContaining({ credentials: 'include' }),
      ),
    )

    const select = await screen.findByLabelText('Тарифный план')
    await waitFor(() => expect(select.querySelectorAll('option')).toHaveLength(2))
    expect(screen.getByRole('option', { name: 'Developer Trial (Застройщик)' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Agency Pro (Агентство)' })).toBeTruthy()
  })
})
