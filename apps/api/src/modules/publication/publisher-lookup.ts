import { Types } from 'mongoose';
import type { OwnerScope } from '@baza/tenant-scope';
import type { OrganizationsService } from '../organizations/organizations.service';

/**
 * Публикатор объекта в публичном контуре: застройщик или агентство.
 *
 * Решение владельца от 04.09.2026: отдельных публичных страниц застройщика и
 * агентства не будет. Клик по названию ведёт в каталог, отфильтрованный по
 * этому публикатору, как на действующем baza.sale. Поэтому в карточке нужен
 * `id` (для ссылки-фильтра) и `name` (чтобы было что показать).
 */
export interface PublicPublisher {
  id: string;
  name: string;
  type: string;
}

/**
 * Имена организаций-публикаторов для одной страницы каталога, одним запросом.
 *
 * Читается на каждый запрос, а не денормализуется в проекцию публикации:
 * публикации пересобираются при изменении объекта, а не организации, поэтому
 * денормализованное имя пережило бы переименование агентства, и каталог
 * показывал бы старое название до следующей публикации каждого объекта.
 *
 * Публикации частных собственников (`marketplace_account`) сюда не попадают:
 * у них нет организации, и `publisher` в карточке остаётся пустым. Это не
 * пробел, а честное отражение того, что у объекта нет компании-публикатора.
 */
export async function resolvePublishers(
  organizationsService: OrganizationsService,
  items: Array<{ publisherScope?: OwnerScope }>,
): Promise<Map<string, PublicPublisher>> {
  const ids = new Map<string, Types.ObjectId>();
  for (const item of items) {
    const scope = item.publisherScope;
    if (scope?.type === 'organization') {
      ids.set(scope.organizationId.toString(), scope.organizationId);
    }
  }
  if (ids.size === 0) return new Map();

  const organizations = await organizationsService.listPublicOrganizations([...ids.values()]);
  return new Map(
    organizations.map((organization) => [
      organization.id.toString(),
      { id: organization.id.toString(), name: organization.name, type: organization.type },
    ]),
  );
}

/** Публикатор конкретной публикации из уже загруженной карты имён. */
export function publisherOf(
  publisherScope: OwnerScope | undefined,
  publishers: Map<string, PublicPublisher> | undefined,
): PublicPublisher | undefined {
  if (publisherScope?.type !== 'organization') return undefined;
  return publishers?.get(publisherScope.organizationId.toString());
}
