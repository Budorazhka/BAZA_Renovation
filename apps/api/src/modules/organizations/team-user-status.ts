/**
 * apps/erp-web/src/types/team.ts::TeamUserStatus — буквальный union literal
 * (не indexed-access через runtime-массив), та же decorator-metadata
 * дисциплина, что LeadStage/lead-stage.ts, хотя это НЕ Mongoose enum поле
 * (TeamUserStatus не хранится нигде на backend напрямую — вычисляется из
 * Identity.status в TeamService.mapIdentityStatus), просто единый источник
 * истины для DTO-валидации и сигнатур сервиса.
 */
export const TEAM_USER_STATUSES = ['active', 'blocked', 'invited'] as const;
export type TeamUserStatus = 'active' | 'blocked' | 'invited';
