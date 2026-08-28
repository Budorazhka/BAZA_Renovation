import type { PublicationReadScope } from './admin-policy.service';

type PublicationSourceType = 'unit' | 'development' | 'listing';

/**
 * D-06: превращает уже резолвленный per-sourceType read-scope
 * (AdminPolicyService.resolvePublicationReadScope) в Mongo-фильтр для
 * MarketplacePublicationRepository.listForAdmin. Чистая функция — не знает
 * про AdminContext/PermissionGrant/Mongo-соединение, только про форму
 * входа/выхода, поэтому тестируется без единого мока.
 *
 * null — ни одного readable sourceType (deny-by-default результат) —
 * вызывающий код обязан вернуть пустой список БЕЗ похода в Mongo, не
 * передавать null дальше как валидный фильтр (пустой $or матчил бы
 * "ничего", но лишний round-trip не нужен, когда это уже известно здесь).
 */
export function buildPublicationScopeFilter(
  scope: Map<PublicationSourceType, PublicationReadScope> | 'all',
): Record<string, unknown> | null {
  if (scope === 'all') {
    return {};
  }

  const clauses: Record<string, unknown>[] = [];
  for (const [sourceType, { global, cities }] of scope) {
    if (global) {
      clauses.push({ sourceType });
    } else if (cities.length > 0) {
      clauses.push({ sourceType, 'searchProjection.city': { $in: cities } });
    }
  }

  if (clauses.length === 0) return null;
  if (clauses.length === 1) return clauses[0]!;
  return { $or: clauses };
}
