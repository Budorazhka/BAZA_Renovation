import { ProductType, stageIdsForProduct } from './lead-stage-definitions';

/**
 * `[lead-legacy-migration-tool]`: перевод легаси `sales`-стадий в id стадий
 * нового backend.
 *
 * Найдено чтением кода, НЕ предположением задачи ("номенклатуры совпадают
 * для всех четырёх продуктов" — верно только для network/owner/agent,
 * см. ниже): легаси enum `LeadStage` (`apps/erp-web/.../types.ts`) для
 * `network`/`owner`/`agent` хранит значения, побуквенно совпадающие с id
 * стадий `LEAD_STAGE_DEFINITIONS` этого же продукта (например,
 * `LeadStage.NETWORK_NEW_LEAD === 'network_new_lead'` — тот же id, что
 * `LEAD_STAGE_DEFINITIONS.network[5].id`) — прямое копирование работает.
 *
 * Для `sales` это НЕ так: легаси `sales`-лид хранит `stage` в номенклатуре
 * `REJECTED`/`FIRST_CONTACT`/`NEEDS_ANALYSIS`/... (значения enum —
 * `rejected`/`first_contact`/`needs_analysis`/...), а
 * `LEAD_STAGE_DEFINITIONS.sales` использует СОВСЕМ ДРУГИЕ id
 * (`defective`/`refused`/`new`/...). Связь между ними — не прямое
 * совпадение, а таблица `apps/erp-web/src/lib/crm-poker-adapter.ts::
 * CRM_STAGE_TO_POKER_ID` (и обратная ей `mapPokerIdToCrmStage` для
 * `ProductType.SALES`) — обе функции сверены построчно, они взаимно обратны
 * друг другу и однозначно фиксируют это соответствие. Таблица ниже —
 * ПРЯМОЙ ПЕРЕНОС значений этой таблицы (backend не может импортировать
 * файл `apps/erp-web` — граница модулей, ADR-001), не переизобретение.
 */
export const LEGACY_SALES_STAGE_TO_STAGE_ID: Readonly<Record<string, string>> = {
  needs_analysis: 'new',
  presentation: 'callback',
  proposal: 'presented',
  negotiation: 'country_discussed',
  decision_making: 'need_identified',
  contract_signing: 'need_adjusted',
  onboarding: 'kp_sent',
  needs_analysis1: 'objections',
  presentation1: 'deferred',
  proposal1: 'warmup',
  negotiation1: 'showing',
  decision_making1: 'deposit',
  contract_signing1: 'deal',
  deal_closed: 'golden',
  post_purchase_followup: 'check_in',
  satisfaction_check: 'referral',
  upsell_opportunity: 'new_deals',
  rejected: 'defective',
  first_contact: 'refused',
  qualification: 'no_answer_3',
  rejected1: 'no_answer_2',
  first_contact1: 'no_answer_1',
};

/**
 * Общая ошибка невалидных легаси-данных лида (стадия/productType/
 * realtorStage/curatorStage) — испорченные легаси-данные бывают, вызывающий
 * код (`LeadMigrationService`) обязан поймать её на уровне ОДНОГО лида и
 * записать в отчёт, не уронить весь батч (тот же принцип, что построчный
 * CSV-импорт `lead-import.service.ts`).
 */
export class LegacyLeadValidationError extends Error {}

/**
 * Переводит легаси-значение `stage` (лида или `history[].toStage`) в id
 * стадии нового backend для заданного `productType`.
 *
 * Порядок проверки:
 *  1. Значение уже само по себе валидный id стадии ЭТОГО продукта (прямое
 *     совпадение таксономий — верно для network/owner/agent, см. докстринг
 *     `LEGACY_SALES_STAGE_TO_STAGE_ID` выше) — возвращается как есть.
 *  2. `productType==='sales'` и значение есть в
 *     `LEGACY_SALES_STAGE_TO_STAGE_ID` — переводится по таблице.
 *  3. Иначе — испорченные легаси-данные: бросает `LegacyLeadValidationError`.
 */
export function translateLegacyStage(rawStage: string, productType: ProductType): string {
  const validIds = stageIdsForProduct(productType);
  if (validIds.includes(rawStage)) {
    return rawStage;
  }
  if (productType === 'sales' && Object.hasOwn(LEGACY_SALES_STAGE_TO_STAGE_ID, rawStage)) {
    return LEGACY_SALES_STAGE_TO_STAGE_ID[rawStage]!;
  }
  throw new LegacyLeadValidationError(
    `Неизвестная легаси-стадия "${rawStage}" для продукта "${productType}"`,
  );
}
