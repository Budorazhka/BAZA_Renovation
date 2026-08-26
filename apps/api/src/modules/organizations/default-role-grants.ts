import type { FixedRole } from './schemas/position.schema';
import type { PermissionScope } from '../authorization/schemas/permission-grant.schema';

export interface DefaultGrant {
  resource: string;
  action: string;
  scope: PermissionScope;
}

/**
 * permission-matrix.md разд.1 "Роль на Position задаёт СТАРТОВЫЙ набор
 * grants при создании позиции" — единственный источник истины для того,
 * какие PermissionGrant документы создаются автоматически при создании
 * Position с данным fixedRole.
 *
 * resource/action здесь — БУКВАЛЬНО те же строки, что используются в
 * @RequirePermission(...) декораторах контроллеров (не permission-matrix.md
 * `resource.action.scope` нотация целиком — там `.own`/`.team`/
 * `.organization` суффикс на action кодирует scope текстом для читаемости
 * документа, но реальный PolicyEvaluatorService.evaluate() сравнивает
 * action СТРОГО буквально с тем, что стоит в декораторе на HTTP-методе,
 * scope — отдельное поле grant'а, не часть action-строки). Например
 * permission-matrix.md `lead.read.organization` → здесь
 * {resource:'lead', action:'read', scope:'organization'}, ПОТОМУ ЧТО
 * реальный контроллер (когда появится) будет объявлен как
 * @RequirePermission('lead', 'read'), не ('lead', 'read.organization').
 * Уже подтверждено сверкой со всеми существующими @RequirePermission
 * вызовами в кодовой базе (development/edit, development/read, unit/
 * price.update, unit/status.update, lead/assign, position/assign_occupant
 * — везде action БЕЗ scope-суффикса).
 *
 * Несколько разных scope на один и тот же resource.action (например
 * lead.read у own/team/organization) физически не могут сосуществовать
 * как отдельные grant-записи с одинаковым action — deny-by-default
 * evaluate() ищет ПЕРВОЕ совпадение resource+action и проверяет scope
 * этого гранта, не "любой из нескольких". Взят САМЫЙ ШИРОКИЙ scope,
 * доступный роли (например owner: 'lead read' - берём 'organization',
 * не 'own', поскольку 'organization' scope покрывает `own`/`team` case
 * тоже на уровне бизнес-логики: как только сервис возвращает ORG-wide
 * список, эта запись включает подмножество "свои" автоматически). Для
 * manager (только own, без organization/team) — берём именно 'own'.
 *
 * `⚙`-помеченные в матрице права (unit.price.update для manager,
 * position.*.organization для administrator) НАМЕРЕННО НЕ включены —
 * explicit per-position toggle (owner decision xlsx #53/#24), не default.
 * `crm.stages.configure` намеренно отсутствует у всех ролей (xlsx #108).
 *
 * Найдено реальным E2E-прогоном (не гипотетически): без этого маппинга ни
 * один PermissionGrant никогда не создаётся ни для одной Position — deny-
 * by-default PolicyEvaluatorService отклоняет ЛЮБОЙ authenticated ERP-запрос
 * даже для только что созданного owner, поскольку grants-таблица пуста.
 */
export const DEFAULT_ROLE_GRANTS: Record<FixedRole, DefaultGrant[]> = {
  owner: [
    { resource: 'lead', action: 'read', scope: 'organization' },
    { resource: 'lead', action: 'create', scope: 'organization' },
    { resource: 'lead', action: 'assign', scope: 'organization' },
    { resource: 'contact', action: 'read', scope: 'organization' },
    { resource: 'client', action: 'reassign', scope: 'organization' },
    { resource: 'development', action: 'read', scope: 'organization' },
    { resource: 'development', action: 'edit', scope: 'organization' },
    { resource: 'unit', action: 'price.update', scope: 'organization' },
    { resource: 'unit', action: 'status.update', scope: 'organization' },
    { resource: 'chessboard', action: 'export', scope: 'organization' },
    { resource: 'booking', action: 'create', scope: 'own' },
    { resource: 'booking', action: 'confirm', scope: 'own' },
    { resource: 'booking', action: 'cancel', scope: 'organization' },
    { resource: 'booking', action: 'extend', scope: 'organization' },
    { resource: 'position', action: 'create', scope: 'organization' },
    { resource: 'position', action: 'assign_occupant', scope: 'organization' },
    { resource: 'position', action: 'vacate', scope: 'organization' },
    { resource: 'personal_access', action: 'grant', scope: 'position' },
    { resource: 'finance', action: 'read', scope: 'organization' },
    { resource: 'manual_ledger', action: 'read', scope: 'organization' },
    { resource: 'export', action: 'run', scope: 'organization' },
  ],
  director: [
    { resource: 'lead', action: 'read', scope: 'organization' },
    { resource: 'lead', action: 'create', scope: 'organization' },
    { resource: 'lead', action: 'assign', scope: 'organization' },
    { resource: 'lead', action: 'reassign', scope: 'organization' },
    { resource: 'contact', action: 'read', scope: 'organization' },
    { resource: 'client', action: 'reassign', scope: 'organization' },
    { resource: 'development', action: 'read', scope: 'organization' },
    { resource: 'development', action: 'edit', scope: 'organization' },
    { resource: 'unit', action: 'price.update', scope: 'organization' },
    { resource: 'unit', action: 'status.update', scope: 'organization' },
    { resource: 'chessboard', action: 'export', scope: 'organization' },
    { resource: 'booking', action: 'create', scope: 'own' },
    { resource: 'booking', action: 'confirm', scope: 'own' },
    { resource: 'booking', action: 'cancel', scope: 'organization' },
    { resource: 'booking', action: 'extend', scope: 'organization' },
    { resource: 'position', action: 'create', scope: 'organization' },
    { resource: 'position', action: 'assign_occupant', scope: 'organization' },
    { resource: 'position', action: 'vacate', scope: 'organization' },
    { resource: 'personal_access', action: 'grant', scope: 'position' },
    { resource: 'finance', action: 'read', scope: 'organization' },
    { resource: 'export', action: 'run', scope: 'organization' },
  ],
  rop: [
    { resource: 'lead', action: 'read', scope: 'organization' },
    { resource: 'lead', action: 'create', scope: 'organization' },
    { resource: 'lead', action: 'assign', scope: 'organization' },
    { resource: 'lead', action: 'reassign', scope: 'team' },
    { resource: 'contact', action: 'read', scope: 'organization' },
    { resource: 'client', action: 'reassign', scope: 'organization' },
    { resource: 'development', action: 'read', scope: 'organization' },
    { resource: 'unit', action: 'price.update', scope: 'organization' },
    { resource: 'unit', action: 'status.update', scope: 'organization' },
    { resource: 'chessboard', action: 'export', scope: 'organization' },
    { resource: 'booking', action: 'create', scope: 'own' },
    { resource: 'booking', action: 'confirm', scope: 'own' },
    { resource: 'booking', action: 'cancel', scope: 'organization' },
    { resource: 'booking', action: 'extend', scope: 'organization' },
    { resource: 'export', action: 'run', scope: 'organization' },
  ],
  manager: [
    { resource: 'lead', action: 'read', scope: 'own' },
    { resource: 'lead', action: 'create', scope: 'organization' },
    { resource: 'contact', action: 'read', scope: 'own' },
    { resource: 'development', action: 'read', scope: 'organization' },
    { resource: 'booking', action: 'create', scope: 'own' },
    { resource: 'booking', action: 'confirm', scope: 'own' },
  ],
  administrator: [
    { resource: 'lead', action: 'read', scope: 'organization' },
    { resource: 'lead', action: 'create', scope: 'organization' },
    { resource: 'contact', action: 'read', scope: 'organization' },
    { resource: 'development', action: 'read', scope: 'organization' },
    { resource: 'unit', action: 'price.update', scope: 'organization' },
    { resource: 'unit', action: 'status.update', scope: 'organization' },
    { resource: 'chessboard', action: 'export', scope: 'organization' },
    { resource: 'export', action: 'run', scope: 'organization' },
  ],
  marketer: [
    { resource: 'development', action: 'read', scope: 'organization' },
    { resource: 'chessboard', action: 'export', scope: 'organization' },
  ],
};
