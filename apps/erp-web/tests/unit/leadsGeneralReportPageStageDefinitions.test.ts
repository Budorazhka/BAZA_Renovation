/** @vitest-environment jsdom */

/**
 * 04.09.2026: LeadsGeneralReportPage переведён с локального мок-каталога
 * (data/leads-mock.ts::LEAD_STAGES/LEAD_STAGE_COLUMN, покрывавшего только
 * продукт `sales`) на реальный каталог GET /leads/stage-definitions (все 4
 * продукта) — лид с productType network/owner/agent теперь показывает
 * русское имя стадии и попадает в правильный статус-фильтр, а не только
 * лиды продукта `sales`.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getStageDefinitionsMock = vi.fn()

vi.mock('@/i18n', () => ({
  useI18n: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}))

vi.mock('@/components/layout/DashboardShell', () => ({
  DashboardShell: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
}))

vi.mock('@/services/leadsApiV2', () => ({
  leadsApiV2: { getStageDefinitions: getStageDefinitionsMock },
}))

function makeLead(overrides: Partial<{ id: string; stageId: string; createdAt: string }> = {}) {
  return {
    id: overrides.id ?? 'lead-1',
    name: 'Клиент',
    phone: '+995500000000',
    source: 'primary' as const,
    stageId: overrides.stageId ?? 'network_new_lead',
    managerId: null,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    channel: 'form' as const,
    hasTask: false,
    commissionUsd: 0,
    status: undefined,
  }
}

vi.mock('@/context/LeadsContext', () => ({
  useLeads: () => ({
    state: {
      leadPool: [makeLead()],
      leadManagers: [],
    },
  }),
}))

describe('LeadsGeneralReportPage — каталог стадий с backend', () => {
  beforeEach(() => {
    getStageDefinitionsMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('показывает русское имя стадии продукта network (не sales-only мок), полученное из GET /leads/stage-definitions', async () => {
    getStageDefinitionsMock.mockResolvedValue({
      sales: [],
      network: [{ id: 'network_new_lead', name: 'Новый лид', order: 1, column: 'in_progress' }],
      owner: [],
      agent: [],
    })

    const { default: LeadsGeneralReportPage } = await import('@/components/leads/LeadsGeneralReportPage')
    render(createElement(LeadsGeneralReportPage))

    await waitFor(() => expect(getStageDefinitionsMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText('Новый лид')).toBeTruthy())
  })

  it('до загрузки каталога (или при её сбое) показывает сырой machine-id, не падает', async () => {
    getStageDefinitionsMock.mockRejectedValue(new Error('503'))

    const { default: LeadsGeneralReportPage } = await import('@/components/leads/LeadsGeneralReportPage')
    render(createElement(LeadsGeneralReportPage))

    await waitFor(() => expect(getStageDefinitionsMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText('network_new_lead')).toBeTruthy())
  })
})
