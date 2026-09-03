import { LEAD_STAGE_DEFINITIONS } from './lead-stage-definitions';

/**
 * `[technical decision — 25.08.2026]`, НЕ owner decision: domain-model.md
 * не специфицирует конкретный enum значений stage для Lead (в отличие от
 * Deal, где явно зафиксировано "заменяющие испорченные legacy slug-
 * значения" — тот же принцип применён здесь по аналогии, но список стадий
 * — техническая номенклатура, требующая подтверждения владельца при
 * первом реальном использовании CRM-модуля, не блокирующая техническую
 * реализацию Lead-сущности).
 *
 * Единственный источник истины для runtime enum-массива (используется в
 * @Prop({enum: LEAD_STAGES}) в обеих схемах, где stage встречается —
 * LeadDocument И LeadEventDocument). TypeScript-тип LeadStage НАМЕРЕННО
 * НЕ экспортируется отдельно и НЕ импортируется в файлы схем через
 * `import type` — каждый файл схемы объявляет `type LeadStage = ...`
 * литералом ЛОКАЛЬНО (см. lead.schema.ts/lead-event.schema.ts). Причина:
 * TypeScript emitDecoratorMetadata эмитит design:type корректно как
 * String для union из строковых литералов, только если сам union виден
 * компилятору в момент компиляции класса в ЭТОМ файле — импортированный
 * через `import type` union стирается на этапе компиляции, design:type
 * получает Object fallback, что валит @Prop() reflection с "union/
 * intersection/ambiguous type was used". Найдено смок-тестом (тот же
 * класс бага, что AuditActorSchema/OwnerScopeSchema/MediaBucket/GeoPoint —
 * см. их комментарии), не гипотетически.
 */
export const LEAD_STAGES = ['new', 'contacted', 'qualified', 'converted', 'lost'] as const;

/**
 * `[technical decision — 03.09.2026]`, продуктовые воронки лида: полный
 * runtime-список валидных значений `stage` — generic 5 (LEAD_STAGES) плюс
 * ВСЕ per-product стадии из `lead-stage-definitions.ts` (sales/network/
 * owner/agent). Используется как coarse-грaница ("это вообще известная
 * стадия хоть какого-то продукта, не опечатка") в @Prop({enum:...}) обеих
 * схем (LeadDocument/LeadEventDocument) и в ChangeLeadStageDto — точная
 * проверка "эта стадия принадлежит ИМЕННО productType этого лида" остаётся
 * бизнес-логикой CrmService.changeLeadStage/createLead, не может быть
 * статическим enum'ом: допустимое множество зависит от значения соседнего
 * поля productType, а не фиксировано для всех лидов сразу.
 */
export const ALL_LEAD_STAGE_VALUES: readonly string[] = [
  ...LEAD_STAGES,
  ...Object.values(LEAD_STAGE_DEFINITIONS).flatMap((stages) => stages.map((stage) => stage.id)),
];

/**
 * `[owner decision — 04.09.2026]`: `realtorStage`/`curatorStage` сохраняют
 * ровно легаси-таксономию — два независимых 6-шаговых указателя прогресса,
 * СВОЯ собственная номенклатура, не входящая ни в `LEAD_STAGES`, ни в
 * `LEAD_STAGE_DEFINITIONS` (см. `lead.schema.ts` докстринг у этих полей).
 * До этого решения оба поля временно валидировались общим справочником
 * стадии продукта — временное расхождение снято этим коммитом.
 */
export const REALTOR_STAGE_VALUES = [
  'realtor_1',
  'realtor_2',
  'realtor_3',
  'realtor_4',
  'realtor_5',
  'realtor_6',
] as const;

export const CURATOR_STAGE_VALUES = [
  'curator_1',
  'curator_2',
  'curator_3',
  'curator_4',
  'curator_5',
  'curator_6',
] as const;
