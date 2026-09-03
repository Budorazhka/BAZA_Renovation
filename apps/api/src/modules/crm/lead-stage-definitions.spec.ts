import {
  LEAD_STAGE_DEFINITIONS,
  PRODUCT_TYPES,
  firstStageIdForProduct,
  stageIdsForProduct,
} from './lead-stage-definitions';

/**
 * D-05B продуктовые воронки лида (03.09.2026, owner decision): полная
 * бизнес-таксономия legacy CRM (apps/erp-web/src/data/leads-mock.ts +
 * apps/erp-web/src/features/crm/services/api/types.ts +
 * apps/erp-web/src/lib/crm-poker-adapter.ts) обязана сохраниться без
 * потерь — эти тесты сверяют точные числа стадий на продукт и монотонность
 * order, найденные построчным подсчётом источников.
 */
describe('lead-stage-definitions', () => {
  it('ровно 4 продукта: sales/network/owner/agent', () => {
    expect(PRODUCT_TYPES).toEqual(['sales', 'network', 'owner', 'agent']);
    expect(Object.keys(LEAD_STAGE_DEFINITIONS).sort()).toEqual(['agent', 'network', 'owner', 'sales']);
  });

  it.each([
    ['sales', 22],
    ['network', 17],
    ['owner', 16],
    ['agent', 12],
  ] as const)('%s — ровно %i стадий (сверено с leads-mock.ts/types.ts/crm-poker-adapter.ts)', (product, count) => {
    expect(LEAD_STAGE_DEFINITIONS[product]).toHaveLength(count);
  });

  it.each(PRODUCT_TYPES)('%s — order монотонно возрастает с 1 без пропусков и дублей', (product) => {
    const orders = LEAD_STAGE_DEFINITIONS[product].map((stage) => stage.order);
    expect(orders).toEqual(orders.map((_, index) => index + 1));
  });

  it.each(PRODUCT_TYPES)('%s — все id уникальны внутри продукта', (product) => {
    const ids = LEAD_STAGE_DEFINITIONS[product].map((stage) => stage.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(PRODUCT_TYPES)('%s — все id глобально уникальны между всеми продуктами (нет коллизий stage-значений)', (product) => {
    const ownIds = new Set(LEAD_STAGE_DEFINITIONS[product].map((stage) => stage.id));
    const otherIds = PRODUCT_TYPES.filter((p) => p !== product).flatMap((p) =>
      LEAD_STAGE_DEFINITIONS[p].map((stage) => stage.id),
    );
    for (const id of otherIds) {
      expect(ownIds.has(id)).toBe(false);
    }
  });

  it.each(PRODUCT_TYPES)('%s — каждая стадия имеет непустое русское имя и валидную column', (product) => {
    for (const stage of LEAD_STAGE_DEFINITIONS[product]) {
      expect(stage.name.length).toBeGreaterThan(0);
      expect(['rejection', 'in_progress', 'success']).toContain(stage.column);
    }
  });

  it('sales — первые 5 стадий rejection, единственный продукт с колонкой success', () => {
    const rejectionIds = LEAD_STAGE_DEFINITIONS.sales.filter((s) => s.column === 'rejection').map((s) => s.id);
    expect(rejectionIds).toEqual(['defective', 'refused', 'no_answer_3', 'no_answer_2', 'no_answer_1']);
    const successIds = LEAD_STAGE_DEFINITIONS.sales.filter((s) => s.column === 'success').map((s) => s.id);
    expect(successIds).toEqual(['golden', 'check_in', 'referral', 'new_deals']);

    for (const product of ['network', 'owner', 'agent'] as const) {
      expect(LEAD_STAGE_DEFINITIONS[product].some((s) => s.column === 'success')).toBe(false);
    }
  });

  describe('stageIdsForProduct', () => {
    it('возвращает id в порядке order', () => {
      expect(stageIdsForProduct('agent')).toEqual([
        'agent_rejected_defective',
        'agent_rejected',
        'agent_no_call_3',
        'agent_no_call_2',
        'agent_no_call_1',
        'agent_new_agent',
        'agent_call_later',
        'agent_company_presented',
        'agent_format',
        'agent_objections',
        'agent_agreed',
        'agent_active',
      ]);
    });
  });

  describe('firstStageIdForProduct', () => {
    it.each([
      ['sales', 'defective'],
      ['network', 'network_rejected_defective'],
      ['owner', 'owner_rejected_defective'],
      ['agent', 'agent_rejected_defective'],
    ] as const)('%s — %s (order:1)', (product, expectedFirstId) => {
      expect(firstStageIdForProduct(product)).toBe(expectedFirstId);
    });
  });
});
