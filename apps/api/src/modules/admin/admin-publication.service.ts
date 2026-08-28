import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { MarketplacePublicationRepository } from '@baza/publication';
import { runInTransaction } from '../../shared/transactions/run-in-transaction';
import type { AdminContext } from '../../shared/admin/admin-context';
import { PublicationService } from '../publication/publication.service';
import { AdminPolicyService } from './admin-policy.service';
import { buildPublicationScopeFilter } from './admin-publication-scope-filter';

export interface AdminPublicationListItem {
  id: string;
  sourceType: string;
  sourceId: string;
  organizationId: string | null;
  status: string;
  slug: string | null;
  publishedAt: string | null;
  unpublishedAt: string | null;
  unpublishReason: string | null;
  city: string | null;
}

/**
 * D-06/OpenAPI `adminUnpublish`: первый реальный Admin critical action.
 * PublicationService.unpublish (command-слой) уже был написан generic по
 * sourceType в D-03 и уже принимает actorType:'admin_account' — этот
 * сервис не дублирует его логику, только добавляет Admin-специфичный слой
 * поверх (permission-проверка по динамическому resource/scope + reason).
 */
@Injectable()
export class AdminPublicationService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly publicationRepository: MarketplacePublicationRepository,
    private readonly publicationService: PublicationService,
    private readonly adminPolicy: AdminPolicyService,
  ) {}

  async unpublish(
    adminContext: AdminContext,
    params: { publicationId: Types.ObjectId; reason: string; correlationId: string },
  ): Promise<{
    id: string;
    sourceType: string;
    sourceId: string;
    status: string;
    slug: string | null;
    unpublishReason: string | null;
  }> {
    this.adminPolicy.requireReason(params.reason);

    const publication = await this.publicationRepository.findById(params.publicationId);
    if (!publication) {
      throw new NotFoundException('Publication not found');
    }

    /**
     * `[technical decision — 25.08.2026]`, не owner decision: resource =
     * publication.sourceType (`development`/`unit`/`listing`), action =
     * 'unpublish' — по аналогии с permission-matrix.md разд.2.2 примерами
     * (`listing.moderate.city`, `unit.price.override.domain`: resource.action.scope
     * тройка, scope — свойство САМОГО гранта, не статичный параметр запроса).
     * permission-matrix.md разд.4 иллюстрирует этот критичный action только
     * одним примером ("Listing unpublish (Admin)", grant `listing.unpublish.*`)
     * — здесь обобщено на все три sourceType, а не буквально ограничено
     * listing, потому что PublicationService/MarketplacePublication
     * архитектурно generic по всем трём с ADR-005: грант, выданный
     * конкретно на `listing.unpublish`, НЕ должен означать право снимать
     * публикации новостроек — это разные домены модерации по духу тех же
     * примеров composition раздела 2.2 ("Модератор вторички" vs "Админ
     * новостроек" — явно разные, не пересекающиеся наборы grants).
     * Требует подтверждения владельца при первом реальном использовании
     * Admin UI, не финализировано как единственно верное толкование.
     */
    const scopeValue = (publication.searchProjection as { city?: string } | undefined)?.city;

    await this.adminPolicy.requireGrant({
      adminContext,
      resource: publication.sourceType,
      action: 'unpublish',
      scopeValue,
    });

    await runInTransaction(this.connection, async (session) => {
      await this.publicationService.unpublish(
        {
          sourceType: publication.sourceType,
          sourceId: publication.sourceId,
          reason: params.reason,
          actorType: 'admin_account',
          actorId: new Types.ObjectId(adminContext.adminAccountId),
          correlationId: params.correlationId,
        },
        session,
      );
    });

    const updated = await this.publicationRepository.findById(params.publicationId);
    return {
      id: updated!._id.toString(),
      sourceType: updated!.sourceType,
      sourceId: updated!.sourceId.toString(),
      status: updated!.status,
      slug: updated!.slug ?? null,
      unpublishReason: updated!.unpublishReason ?? null,
    };
  }

  /**
   * D-06: "Admin может найти publication только в разрешённом scope"
   * (мастер-план) — до этого прохода единственным способом узнать ID
   * publication было получить его извне (unpublish адресует по уже
   * известному ID). scopeFilter уже кодирует deny-by-default: пустой
   * result из buildPublicationScopeFilter (ни одного readable sourceType)
   * возвращает пустой список БЕЗ похода в Mongo — не 403/500, тот же
   * "пустой список, не ошибка" паттерн, что уже принят в ERP/public list
   * эндпоинтах этого прохода (D-04A/D-05B) для deny-by-default listing.
   *
   * sourceType/city из query — ДОПОЛНИТЕЛЬНОЕ клиентское сужение (AND)
   * поверх уже разрешённого scope, не способ его расширить: если admin не
   * имеет read-гранта на 'unit' вообще, запрос ?sourceType=unit просто не
   * попадёт в itogovый $or/clause (сам buildPublicationScopeFilter не
   * добавил unit в фильтр), а не бросит ошибку — тот же принцип, что
   * "чужой scope не раскрывает существование".
   */
  async list(
    adminContext: AdminContext,
    params: { sourceType?: string; city?: string; cursor?: string; limit: number },
  ): Promise<{ items: AdminPublicationListItem[]; nextCursor: string | null }> {
    const readScope = await this.adminPolicy.resolvePublicationReadScope(adminContext);
    const scopeFilter = buildPublicationScopeFilter(readScope);
    if (!scopeFilter) {
      return { items: [], nextCursor: null };
    }

    // $and-обёртка, НЕ прямая перезапись ключей scopeFilter — scopeFilter
    // может уже содержать sourceType (single-clause форма из
    // buildPublicationScopeFilter, когда admin имеет grant ровно на один
    // sourceType) — {...scopeFilter, sourceType: params.sourceType} тихо
    // ЗАМЕНИЛ БЫ уже разрешённое значение на клиентское, позволяя запросить
    // ?sourceType=unit в обход отсутствующего grant на unit (реальный баг,
    // найденный integration-тестом на этом самом сценарии). $and гарантирует
    // AND-сужение независимо от внутренней структуры scopeFilter ($or/single-clause).
    const clientFilter: Record<string, unknown> = {};
    if (params.sourceType) {
      clientFilter.sourceType = params.sourceType;
    }
    if (params.city) {
      clientFilter['searchProjection.city'] = params.city;
    }
    const combinedFilter: Record<string, unknown> =
      Object.keys(clientFilter).length > 0 ? { $and: [scopeFilter, clientFilter] } : scopeFilter;

    // limit+1 паттерн (D-04A) — запрашиваем на одну запись больше, чтобы
    // корректно определить nextCursor без двусмысленного items.length===limit.
    const rows = await this.publicationRepository.listForAdmin({
      scopeFilter: combinedFilter,
      cursor: params.cursor ? new Types.ObjectId(params.cursor) : undefined,
      limit: params.limit + 1,
    });
    const hasMore = rows.length > params.limit;
    const pageRows = hasMore ? rows.slice(0, params.limit) : rows;
    const nextCursor = hasMore ? pageRows[pageRows.length - 1]!._id.toString() : null;

    return { items: pageRows.map(toAdminPublicationListItem), nextCursor };
  }
}

function toAdminPublicationListItem(publication: {
  _id: Types.ObjectId;
  sourceType: string;
  sourceId: Types.ObjectId;
  publisherScope: { type: string; organizationId?: Types.ObjectId };
  status: string;
  slug?: string;
  publishedAt?: Date;
  unpublishedAt?: Date;
  unpublishReason?: string;
  searchProjection: Record<string, unknown>;
}): AdminPublicationListItem {
  return {
    id: publication._id.toString(),
    sourceType: publication.sourceType,
    sourceId: publication.sourceId.toString(),
    organizationId:
      publication.publisherScope.type === 'organization' && publication.publisherScope.organizationId
        ? publication.publisherScope.organizationId.toString()
        : null,
    status: publication.status,
    slug: publication.slug ?? null,
    publishedAt: publication.publishedAt?.toISOString() ?? null,
    unpublishedAt: publication.unpublishedAt?.toISOString() ?? null,
    unpublishReason: publication.unpublishReason ?? null,
    city: (publication.searchProjection as { city?: string } | undefined)?.city ?? null,
  };
}
