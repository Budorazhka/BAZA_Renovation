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
 * `lead.changeStage` (D-05B) — НОВЫЙ resource.action, отсутствует в
 * permission-matrix.md как отдельная строка (техническое решение, не owner
 * decision, подтверждено владельцем явно в диалоге при реализации D-05B:
 * "конечно менеджер может менять стадию своих лидов"). Раньше PATCH
 * /leads/:id/stage переиспользовал `lead.assign` (только owner/director/
 * rop, organization-wide) — это физически не позволяло manager'у менять
 * стадию даже собственного лида. Новый грант со scope 'own' у manager
 * закрывает это, не добавляя новую роль/fixedRole — только новое действие
 * в уже существующей ролевой модели.
 *
 * Найдено реальным E2E-прогоном (не гипотетически): без этого маппинга ни
 * один PermissionGrant никогда не создаётся ни для одной Position — deny-
 * by-default PolicyEvaluatorService отклоняет ЛЮБОЙ authenticated ERP-запрос
 * даже для только что созданного owner, поскольку grants-таблица пуста.
 *
 * `position.read` (все роли, scope 'organization') — security review
 * 31.08.2026: GET /team-users и POST /team-users/ensure-team не имели
 * НИКАКОГО PermissionGuard (только TenantGuard), возвращая HR-PII
 * (loginEmail/phone/birthDate/department/telegram/whatsapp/vk/instagram/
 * website) всех сотрудников организации без проверки прав вызывающего —
 * технический фикс deny-by-default разрыва, не новое бизнес-решение
 * владельца об ограничении видимости команды: сохраняет текущее поведение
 * (любой залогиненный сотрудник организации видит список команды), просто
 * делает его explicit grant'ом, а не отсутствием guard'а по умолчанию.
 * НЕ бэкфилится для Position, созданных до этого коммита (нет миграционной
 * инфраструктуры в кодовой базе, тот же прецедент, что остальные grants
 * этого файла) — существующие организации получат 403 на список команды,
 * пока их Position не пересоздадут/не получат grant отдельно.
 */
export const DEFAULT_ROLE_GRANTS: Record<FixedRole, DefaultGrant[]> = {
  owner: [
    { resource: 'position', action: 'read', scope: 'organization' },
    { resource: 'lead', action: 'read', scope: 'organization' },
    { resource: 'lead', action: 'create', scope: 'organization' },
    { resource: 'lead', action: 'assign', scope: 'organization' },
    { resource: 'lead', action: 'changeStage', scope: 'organization' },
    { resource: 'contact', action: 'read', scope: 'organization' },
    { resource: 'task', action: 'read', scope: 'organization' },
    { resource: 'task', action: 'create', scope: 'organization' },
    { resource: 'task', action: 'edit', scope: 'organization' },
    { resource: 'task', action: 'complete', scope: 'organization' },
    { resource: 'deal', action: 'read', scope: 'organization' },
    { resource: 'deal', action: 'create', scope: 'organization' },
    { resource: 'deal', action: 'edit', scope: 'organization' },
    { resource: 'deal', action: 'changeStage', scope: 'organization' },
    { resource: 'task', action: 'reassign', scope: 'organization' },
    { resource: 'client', action: 'reassign', scope: 'organization' },
    { resource: 'development', action: 'read', scope: 'organization' },
    { resource: 'development', action: 'edit', scope: 'organization' },
    { resource: 'property_asset', action: 'read', scope: 'organization' },
    { resource: 'property_asset', action: 'create', scope: 'organization' },
    { resource: 'property_asset', action: 'edit', scope: 'organization' },
    { resource: 'listing', action: 'read', scope: 'organization' },
    { resource: 'listing', action: 'create', scope: 'organization' },
    { resource: 'listing', action: 'edit', scope: 'organization' },
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
    { resource: 'position', action: 'read', scope: 'organization' },
    { resource: 'lead', action: 'read', scope: 'organization' },
    { resource: 'lead', action: 'create', scope: 'organization' },
    { resource: 'lead', action: 'assign', scope: 'organization' },
    { resource: 'lead', action: 'changeStage', scope: 'organization' },
    { resource: 'lead', action: 'reassign', scope: 'organization' },
    { resource: 'contact', action: 'read', scope: 'organization' },
    { resource: 'task', action: 'read', scope: 'organization' },
    { resource: 'task', action: 'create', scope: 'organization' },
    { resource: 'task', action: 'edit', scope: 'organization' },
    { resource: 'task', action: 'complete', scope: 'organization' },
    { resource: 'deal', action: 'read', scope: 'organization' },
    { resource: 'deal', action: 'create', scope: 'organization' },
    { resource: 'deal', action: 'edit', scope: 'organization' },
    { resource: 'deal', action: 'changeStage', scope: 'organization' },
    { resource: 'task', action: 'reassign', scope: 'organization' },
    { resource: 'client', action: 'reassign', scope: 'organization' },
    { resource: 'development', action: 'read', scope: 'organization' },
    { resource: 'development', action: 'edit', scope: 'organization' },
    { resource: 'property_asset', action: 'read', scope: 'organization' },
    { resource: 'property_asset', action: 'create', scope: 'organization' },
    { resource: 'property_asset', action: 'edit', scope: 'organization' },
    { resource: 'listing', action: 'read', scope: 'organization' },
    { resource: 'listing', action: 'create', scope: 'organization' },
    { resource: 'listing', action: 'edit', scope: 'organization' },
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
    { resource: 'position', action: 'read', scope: 'organization' },
    { resource: 'lead', action: 'read', scope: 'organization' },
    { resource: 'lead', action: 'create', scope: 'organization' },
    { resource: 'lead', action: 'assign', scope: 'organization' },
    { resource: 'lead', action: 'changeStage', scope: 'organization' },
    { resource: 'lead', action: 'reassign', scope: 'team' },
    { resource: 'contact', action: 'read', scope: 'organization' },
    { resource: 'task', action: 'read', scope: 'organization' },
    { resource: 'task', action: 'create', scope: 'organization' },
    { resource: 'task', action: 'edit', scope: 'organization' },
    { resource: 'task', action: 'complete', scope: 'organization' },
    { resource: 'deal', action: 'read', scope: 'organization' },
    { resource: 'deal', action: 'create', scope: 'organization' },
    { resource: 'deal', action: 'edit', scope: 'organization' },
    { resource: 'deal', action: 'changeStage', scope: 'organization' },
    // rop.task.reassign — 'organization', не 'team': PermissionScope 'team'
    // существует в enum, но не имеет реальной реализации сужения нигде в
    // кодовой базе (нет модели подчинённости/иерархии Position) — тот же
    // выбор, что уже сделан для lead.reassign у rop НЕ применяется здесь
    // буквально (там team ИСПОЛЬЗУЕТСЯ, хоть и без реального сужения);
    // для task.reassign явно взят organization по решению владельца
    // (30.08.2026) — team для task отложен до появления модели команды.
    { resource: 'task', action: 'reassign', scope: 'organization' },
    { resource: 'client', action: 'reassign', scope: 'organization' },
    { resource: 'development', action: 'read', scope: 'organization' },
    { resource: 'property_asset', action: 'read', scope: 'organization' },
    { resource: 'property_asset', action: 'create', scope: 'organization' },
    { resource: 'property_asset', action: 'edit', scope: 'organization' },
    { resource: 'listing', action: 'read', scope: 'organization' },
    { resource: 'listing', action: 'create', scope: 'organization' },
    { resource: 'listing', action: 'edit', scope: 'organization' },
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
    { resource: 'position', action: 'read', scope: 'organization' },
    { resource: 'lead', action: 'read', scope: 'own' },
    { resource: 'lead', action: 'create', scope: 'organization' },
    // D-05B: manager ведёт своих лидов по воронке — очевидная возможность,
    // scope 'own' сужает до лидов, где ownerPositionId === своя Position
    // (ownerFilterForAction в LeadController, не автоматически — deny-by-
    // default guard проверяет только наличие гранта, не scope).
    { resource: 'lead', action: 'changeStage', scope: 'own' },
    { resource: 'contact', action: 'read', scope: 'own' },
    { resource: 'task', action: 'read', scope: 'own' },
    { resource: 'task', action: 'create', scope: 'organization' },
    { resource: 'task', action: 'edit', scope: 'own' },
    { resource: 'task', action: 'complete', scope: 'own' },
    { resource: 'deal', action: 'read', scope: 'own' },
    { resource: 'deal', action: 'create', scope: 'organization' },
    { resource: 'deal', action: 'edit', scope: 'own' },
    { resource: 'deal', action: 'changeStage', scope: 'own' },
    { resource: 'development', action: 'read', scope: 'organization' },
    { resource: 'property_asset', action: 'read', scope: 'organization' },
    { resource: 'property_asset', action: 'create', scope: 'organization' },
    { resource: 'property_asset', action: 'edit', scope: 'organization' },
    { resource: 'listing', action: 'read', scope: 'organization' },
    { resource: 'listing', action: 'create', scope: 'organization' },
    { resource: 'listing', action: 'edit', scope: 'organization' },
    { resource: 'booking', action: 'create', scope: 'own' },
    { resource: 'booking', action: 'confirm', scope: 'own' },
  ],
  administrator: [
    { resource: 'position', action: 'read', scope: 'organization' },
    { resource: 'lead', action: 'read', scope: 'organization' },
    { resource: 'lead', action: 'create', scope: 'organization' },
    { resource: 'contact', action: 'read', scope: 'organization' },
    { resource: 'task', action: 'read', scope: 'organization' },
    { resource: 'task', action: 'create', scope: 'organization' },
    { resource: 'task', action: 'complete', scope: 'organization' },
    { resource: 'development', action: 'read', scope: 'organization' },
    { resource: 'unit', action: 'price.update', scope: 'organization' },
    { resource: 'unit', action: 'status.update', scope: 'organization' },
    { resource: 'chessboard', action: 'export', scope: 'organization' },
    { resource: 'export', action: 'run', scope: 'organization' },
  ],
  marketer: [
    { resource: 'position', action: 'read', scope: 'organization' },
    { resource: 'development', action: 'read', scope: 'organization' },
    { resource: 'chessboard', action: 'export', scope: 'organization' },
  ],
  // 27.08.2026 (владелец подтвердил, D-07 vertical E2E): developer-организация
  // публикует свои ЖК на marketplace и получает лиды через reveal-contact на
  // собственные публикации (MarketplaceService создаёт Lead с ownerPositionId
  // = организация публикации) — lead.read/assign/changeStage нужны, чтобы
  // owner+команда developer-организации видели и вели эти лиды в своём ERP,
  // тот же набор, что у agency owner.
  developer: [
    { resource: 'position', action: 'read', scope: 'organization' },
    { resource: 'lead', action: 'read', scope: 'organization' },
    { resource: 'lead', action: 'create', scope: 'organization' },
    { resource: 'lead', action: 'assign', scope: 'organization' },
    { resource: 'lead', action: 'changeStage', scope: 'organization' },
    { resource: 'contact', action: 'read', scope: 'organization' },
    { resource: 'task', action: 'read', scope: 'organization' },
    { resource: 'task', action: 'create', scope: 'organization' },
    { resource: 'task', action: 'edit', scope: 'organization' },
    { resource: 'task', action: 'complete', scope: 'organization' },
    { resource: 'deal', action: 'read', scope: 'organization' },
    { resource: 'deal', action: 'create', scope: 'organization' },
    { resource: 'deal', action: 'edit', scope: 'organization' },
    { resource: 'deal', action: 'changeStage', scope: 'organization' },
    { resource: 'task', action: 'reassign', scope: 'organization' },
    { resource: 'development', action: 'read', scope: 'organization' },
    { resource: 'development', action: 'edit', scope: 'organization' },
    { resource: 'property_asset', action: 'read', scope: 'organization' },
    { resource: 'property_asset', action: 'create', scope: 'organization' },
    { resource: 'property_asset', action: 'edit', scope: 'organization' },
    { resource: 'listing', action: 'read', scope: 'organization' },
    { resource: 'listing', action: 'create', scope: 'organization' },
    { resource: 'listing', action: 'edit', scope: 'organization' },
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
};
