import { describe, expect, it } from 'vitest'

import { compareLeadListOrder, type LeadSortItem } from '@/features/crm/components/crm/leadSorting'

function sort(items: LeadSortItem[], pinnedLeadId: string | null = null) {
  return [...items].sort((a, b) => compareLeadListOrder(a, b, pinnedLeadId)).map((item) => item.id)
}

describe('compareLeadListOrder', () => {
  it('ставит закреплённый лид первым', () => {
    const items: LeadSortItem[] = [
      { id: 'lead-1', updatedAt: '2026-07-02T10:00:00.000Z', backendIndex: 0 },
      { id: 'lead-2', updatedAt: '2026-07-02T12:00:00.000Z', backendIndex: 1 },
    ]

    expect(sort(items, 'lead-1')).toEqual(['lead-1', 'lead-2'])
  })

  it('сортирует по последней активности, а не по дате создания', () => {
    const items: LeadSortItem[] = [
      {
        id: 'older-created-but-active',
        createdAt: '2026-06-01T09:00:00.000Z',
        updatedAt: '2026-07-02T15:01:00.000Z',
        backendIndex: 0,
      },
      {
        id: 'newer-created-but-silent',
        createdAt: '2026-07-01T09:00:00.000Z',
        updatedAt: '2026-07-02T13:55:00.000Z',
        backendIndex: 1,
      },
    ]

    expect(sort(items)).toEqual(['older-created-but-active', 'newer-created-but-silent'])
  })

  it('использует порядок бэкенда как tie-breaker при равной активности', () => {
    const items: LeadSortItem[] = [
      { id: 'lead-2', updatedAt: '2026-07-02T13:55:00.000Z', backendIndex: 1 },
      { id: 'lead-1', updatedAt: '2026-07-02T13:55:00.000Z', backendIndex: 0 },
    ]

    expect(sort(items)).toEqual(['lead-1', 'lead-2'])
  })

  it('падает обратно на createdAt, если updatedAt нет', () => {
    const items: LeadSortItem[] = [
      { id: 'lead-1', createdAt: '2026-07-02T12:00:00.000Z', backendIndex: 0 },
      { id: 'lead-2', createdAt: '2026-07-02T14:00:00.000Z', backendIndex: 1 },
    ]

    expect(sort(items)).toEqual(['lead-2', 'lead-1'])
  })
})
