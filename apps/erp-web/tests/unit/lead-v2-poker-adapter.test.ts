/**
 * Адаптер LeadV2 → PokerLead (карточный стол). Проверяется маппинг
 * source↔productType, poker-id↔backend-stage-id по всем 4 продуктам и
 * честные дефолты для полей, которых нет на новом backend (commissionUsd,
 * taskOverdue) — см. докстринг lib/lead-v2-poker-adapter.ts.
 */

import { describe, expect, it } from 'vitest'
import {
  mapLeadStageV2ToPokerId,
  mapLeadV2ToPoker,
  mapPokerIdToLeadStageV2,
  POKER_SOURCE_TO_PRODUCT_V2,
  PRODUCT_V2_TO_POKER_SOURCE,
} from '@/lib/lead-v2-poker-adapter'
import type { LeadV2 } from '@/types/leadsV2'

function makeLead(overrides: Partial<LeadV2> = {}): LeadV2 {
  return {
    id: 'lead-1',
    organizationId: 'org-1',
    ownerPositionId: null,
    productType: null,
    stage: 'new',
    version: 0,
    source: { route: 'manual' },
    createdAt: '2026-09-01T00:00:00.000Z',
    contact: null,
    hasOpenNextAction: false,
    stalled: false,
    ...overrides,
  }
}

describe('lead-v2-poker-adapter', () => {
  it('source↔productType — та же таксономия, что в crm-poker-adapter.ts (sales/network/owner/agent)', () => {
    expect(POKER_SOURCE_TO_PRODUCT_V2.primary).toBe('sales')
    expect(POKER_SOURCE_TO_PRODUCT_V2.secondary).toBe('network')
    expect(POKER_SOURCE_TO_PRODUCT_V2.rent).toBe('owner')
    expect(POKER_SOURCE_TO_PRODUCT_V2.ad_campaigns).toBe('agent')
    expect(PRODUCT_V2_TO_POKER_SOURCE.sales).toBe('primary')
    expect(PRODUCT_V2_TO_POKER_SOURCE.network).toBe('secondary')
    expect(PRODUCT_V2_TO_POKER_SOURCE.owner).toBe('rent')
    expect(PRODUCT_V2_TO_POKER_SOURCE.agent).toBe('ad_campaigns')
  })

  it('sales: poker-id совпадает с backend id буквально (общий источник — leads-mock.ts)', () => {
    expect(mapPokerIdToLeadStageV2('new', 'sales')).toBe('new')
    expect(mapPokerIdToLeadStageV2('golden', 'sales')).toBe('golden')
    expect(mapLeadStageV2ToPokerId('deal', 'sales')).toBe('deal')
  })

  it('network/owner/agent: poker-id транслируется в префиксованный backend id и обратно', () => {
    expect(mapPokerIdToLeadStageV2('new', 'network')).toBe('network_new_lead')
    expect(mapLeadStageV2ToPokerId('network_new_lead', 'network')).toBe('new')

    expect(mapPokerIdToLeadStageV2('showing', 'owner')).toBe('owner_new_object_inquiry')
    expect(mapLeadStageV2ToPokerId('owner_new_object_inquiry', 'owner')).toBe('showing')

    expect(mapPokerIdToLeadStageV2('kp_sent', 'agent')).toBe('agent_active')
    expect(mapLeadStageV2ToPokerId('agent_active', 'agent')).toBe('kp_sent')
  })

  it('poker-id вне воронки продукта (короче, чем sales) — mapPokerIdToLeadStageV2 возвращает null', () => {
    expect(mapPokerIdToLeadStageV2('golden', 'network')).toBeNull()
    expect(mapPokerIdToLeadStageV2('deal', 'agent')).toBeNull()
  })

  it('mapLeadV2ToPoker: маппит productType→source, stage→stageId, ownerPositionId→managerId', () => {
    const lead = makeLead({
      id: 'lead-42',
      ownerPositionId: 'pos-7',
      productType: 'network',
      stage: 'network_call_later',
      contact: { id: 'c-1', name: 'Иван Иванов', phone: '+79990000000' },
      hasOpenNextAction: true,
    })

    const poker = mapLeadV2ToPoker(lead)

    expect(poker.id).toBe('lead-42')
    expect(poker.source).toBe('secondary')
    expect(poker.stageId).toBe('callback')
    expect(poker.managerId).toBe('pos-7')
    expect(poker.ownerPositionId).toBe('pos-7')
    expect(poker.name).toBe('Иван Иванов')
    expect(poker.phone).toBe('+79990000000')
    expect(poker.hasTask).toBe(true)
  })

  it('честные пробелы: commissionUsd и taskOverdue — дефолты 0/false для любого V2-лида', () => {
    const poker = mapLeadV2ToPoker(makeLead({ hasOpenNextAction: false }))
    expect(poker.commissionUsd).toBe(0)
    expect(poker.taskOverdue).toBe(false)
  })

  it('лид без productType — фоллбэк source:"primary", stageId проходит как есть (не поддерживается покер-столом, но не падает)', () => {
    const poker = mapLeadV2ToPoker(makeLead({ productType: null, stage: 'qualified' }))
    expect(poker.source).toBe('primary')
    expect(poker.stageId).toBe('qualified')
  })

  it('ownerPositionId:null → managerId:null, ownerPositionId в PokerLead не проставляется', () => {
    const poker = mapLeadV2ToPoker(makeLead({ ownerPositionId: null }))
    expect(poker.managerId).toBeNull()
    expect(poker.ownerPositionId).toBeUndefined()
  })
})
