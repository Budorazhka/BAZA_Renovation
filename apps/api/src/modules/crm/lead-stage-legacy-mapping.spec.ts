import { translateLegacyStage, LegacyLeadValidationError, LEGACY_SALES_STAGE_TO_STAGE_ID } from './lead-stage-legacy-mapping';
import { stageIdsForProduct } from './lead-stage-definitions';

describe('translateLegacyStage', () => {
  it('sales: переводит легаси-номенклатуру (REJECTED/...) в id стадии нового backend по таблице', () => {
    expect(translateLegacyStage('rejected', 'sales')).toBe('defective');
    expect(translateLegacyStage('needs_analysis', 'sales')).toBe('new');
    expect(translateLegacyStage('deal_closed', 'sales')).toBe('golden');
  });

  it('network/owner/agent: значение уже совпадает с id нового backend — прямое копирование', () => {
    expect(translateLegacyStage('network_new_lead', 'network')).toBe('network_new_lead');
    expect(translateLegacyStage('owner_agreed', 'owner')).toBe('owner_agreed');
    expect(translateLegacyStage('agent_active', 'agent')).toBe('agent_active');
  });

  it('таблица перевода sales покрывает ровно все 22 sales-стадии нового backend', () => {
    const translated = new Set(Object.values(LEGACY_SALES_STAGE_TO_STAGE_ID));
    const expected = new Set(stageIdsForProduct('sales'));
    expect(translated).toEqual(expected);
  });

  it('неизвестное значение — LegacyLeadValidationError, не молчаливый null', () => {
    expect(() => translateLegacyStage('totally-invalid', 'sales')).toThrow(LegacyLeadValidationError);
    expect(() => translateLegacyStage('rejected', 'network')).toThrow(LegacyLeadValidationError);
  });
});
