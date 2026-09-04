import { describe, expect, it } from 'vitest'
import {
  buildFunnelBoardsFromStageCounts,
  STAGE_NAME_TO_LEAD_STAGE_V2,
} from '@/features/crm/pages/crm/funnelTemplates'

describe('buildFunnelBoardsFromStageCounts + STAGE_NAME_TO_LEAD_STAGE_V2 (GET /crm/reports/lead-funnel)', () => {
  it('стадия sales нового backend (например "defective") корректно попадает в колонку rejection воронки "Продажи"', () => {
    const boards = buildFunnelBoardsFromStageCounts(
      [{ stage: 'defective', count: 5 }],
      STAGE_NAME_TO_LEAD_STAGE_V2,
    )

    const salesBoard = boards.find((b) => b.id === 'sales')!
    const rejectionColumn = salesBoard.columns.find((c) => c.id === 'rejection')!
    expect(rejectionColumn.count).toBe(5)
    expect(salesBoard.rejectionCount).toBe(5)
  })

  it('легаси LeadStage-значение ("rejected") НЕ матчится в V2-карте — sales-числа нулевые', () => {
    const boards = buildFunnelBoardsFromStageCounts(
      [{ stage: 'rejected', count: 5 }],
      STAGE_NAME_TO_LEAD_STAGE_V2,
    )

    const salesBoard = boards.find((b) => b.id === 'sales')!
    expect(salesBoard.totalCount).toBe(0)
  })

  it('network/owner/agent используют те же machine-id, что и легаси карта — "network_new_lead" считается в "В работе"', () => {
    const boards = buildFunnelBoardsFromStageCounts(
      [{ stage: 'network_new_lead', count: 2 }],
      STAGE_NAME_TO_LEAD_STAGE_V2,
    )

    const networkBoard = boards.find((b) => b.id === 'network')!
    const inProgress = networkBoard.columns.find((c) => c.id === 'in_progress')!
    expect(inProgress.count).toBe(2)
  })

  it('без явной карты (легаси-путь для stageCountsByProductToArray-потребителей) продолжает резолвить старый LeadStage enum', () => {
    const boards = buildFunnelBoardsFromStageCounts([{ stage: 'rejected', count: 7 }])

    const salesBoard = boards.find((b) => b.id === 'sales')!
    expect(salesBoard.rejectionCount).toBe(7)
  })
})
