import type { AuditEventDocument } from './schemas/audit-event.schema';

export interface AdminAuditEventView {
  id: string;
  action: string;
  resource: string;
  resourceId: string;
  actor: { type: string; id: string | null };
  createdAt: string;
  correlationId: string;
  reason: string | null;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

/**
 * Explicit per-action whitelist для before/after — ЕДИНСТВЕННЫЙ источник
 * истины о том, какие поля payload'а безопасно показать в Admin UI.
 * `AuditService.assertNoSecrets` (audit.service.ts) уже гарантирует, что
 * password/token/secret никогда не попадают в саму запись — но это не
 * значит, что ВСЁ остальное безопасно раскрывать (organization internals,
 * request-derived поля, storage keys, произвольные будущие поля, которые
 * кто-то добавит в `after` для другого resource и не подумает об admin
 * audit UI). Whitelist, не blacklist: неизвестный action → пустой
 * before/after (safe default), не "показать всё кроме запрещённого".
 */
const FIELD_WHITELIST: Record<string, readonly string[]> = {
  'publication.unpublish': [],
  'admin_account.create': ['identityId', 'isSuperAdmin'],
  'admin_account.grant_permission': ['resource', 'action', 'scope', 'scopeValue'],
  'admin_account.revoke_permission': ['resource', 'action', 'scope', 'scopeValue'],
  'admin_account.deactivate': ['status'],
  'admin_account.reactivate': ['status'],
};

function pickWhitelisted(
  action: string,
  payload: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (!payload) return null;
  const allowedKeys = FIELD_WHITELIST[action];
  if (!allowedKeys || allowedKeys.length === 0) return null;

  const picked: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (key in payload) {
      picked[key] = payload[key];
    }
  }
  return Object.keys(picked).length > 0 ? picked : null;
}

const SUMMARY_BUILDERS: Record<string, (event: AuditEventDocument) => string> = {
  'publication.unpublish': (event) => `Публикация ${event.resourceId.toString()} снята с публикации`,
  'admin_account.create': (event) => `Создан admin-аккаунт ${event.resourceId.toString()}`,
  'admin_account.grant_permission': (event) => `Выдано разрешение аккаунту ${event.resourceId.toString()}`,
  'admin_account.revoke_permission': (event) => `Отозвано разрешение у аккаунта ${event.resourceId.toString()}`,
  'admin_account.deactivate': (event) => `Аккаунт ${event.resourceId.toString()} деактивирован`,
  'admin_account.reactivate': (event) => `Аккаунт ${event.resourceId.toString()} реактивирован`,
  'auth.logout': (event) => `Выход из системы (${event.resourceId.toString()})`,
};

function buildSummary(event: AuditEventDocument): string {
  const builder = SUMMARY_BUILDERS[event.action];
  if (builder) return builder(event);
  return `${event.action} · ${event.resource}`;
}

/**
 * Единственная точка, которая превращает AuditEventDocument в то, что
 * когда-либо уходит по HTTP из admin audit endpoint'ов. before/after
 * проходят через FIELD_WHITELIST (per-action allow-list, см. выше) —
 * redaction на backend, не на frontend (задача явно требует этого).
 */
export function toAdminAuditEventView(event: AuditEventDocument): AdminAuditEventView {
  return {
    id: event._id.toString(),
    action: event.action,
    resource: event.resource,
    resourceId: event.resourceId.toString(),
    actor: {
      type: event.actor.type,
      id: event.actor.id ? event.actor.id.toString() : null,
    },
    createdAt: event.createdAt.toISOString(),
    correlationId: event.correlationId,
    reason: event.reason ?? null,
    summary: buildSummary(event),
    before: pickWhitelisted(event.action, event.before),
    after: pickWhitelisted(event.action, event.after),
  };
}
