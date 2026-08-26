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
