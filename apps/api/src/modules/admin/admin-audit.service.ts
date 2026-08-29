import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { MarketplacePublicationRepository } from '@baza/publication';
import type { AdminContext } from '../../shared/admin/admin-context';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { AuditService } from '../audit/audit.service';
import { toAdminAuditEventView, type AdminAuditEventView } from '../audit/admin-audit-projection';
import { AdminPolicyService, type PublicationReadScope } from './admin-policy.service';

type PublicationSourceType = 'unit' | 'development' | 'listing';
const PUBLICATION_RESOURCES: readonly PublicationSourceType[] = ['development', 'unit', 'listing'];

/** Resource-значения, доступные ТОЛЬКО super_admin (accounts/grants/sessions — permission-matrix.md разд.4 non-disclosure). */
const SUPER_ADMIN_ONLY_RESOURCES = new Set(['admin_account']);

export interface ListAuditEventsParams {
  resource?: string;
  action?: string;
  resourceId?: Types.ObjectId;
  publicationId?: Types.ObjectId;
  actorId?: Types.ObjectId;
  from?: string;
  to?: string;
  cursor?: Types.ObjectId;
  limit: number;
}

/**
 * D-07/read-only audit trail: единственная точка сборки Mongo-фильтра для
 * admin audit feed. Переиспользует AdminPolicyService.resolvePublicationReadScope
 * (тот же метод, что GET /admin/publications) — НЕ дублирует scope-
 * резолвинг, чтобы правило "scoped admin видит только publication-события
 * своего scope" оставалось определено в одном месте. Само построение
 * Mongo-фильтра из уже резолвленного scope — отдельная реализация
 * (buildAuditScopeFilter ниже), не buildPublicationScopeFilter, т.к.
 * audit_events — другая коллекция с другими полями (см. buildAuditScopeFilter).
 *
 * Non-disclosure: scope всегда входит в САМ Mongo-запрос (AND-объединение
 * через $and, тот же паттерн, что AdminPublicationService.list — client
 * filter не может расширить уже резолвленный scope), никогда не
 * постфильтрация уже прочитанных документов. Явный resourceId/publicationId
 * вне scope не 404 — он просто никогда не попадёт в $or/clause фильтра,
 * поэтому запрос вернёт пустой список, не раскрывая, существует ли
 * событие вообще.
 */
@Injectable()
export class AdminAuditService {
  constructor(
    private readonly auditService: AuditService,
    private readonly adminPolicy: AdminPolicyService,
    private readonly publicationRepository: MarketplacePublicationRepository,
  ) {}

  async list(
    adminContext: AdminContext,
    params: ListAuditEventsParams,
  ): Promise<{ items: AdminAuditEventView[]; nextCursor: string | null }> {
    const scopeFilter = await this.resolveScopeFilter(adminContext, params.resource);
    if (!scopeFilter) {
      return { items: [], nextCursor: null };
    }

    const clientFilter = await this.buildClientFilter(params);
    if (clientFilter === 'empty') {
      return { items: [], nextCursor: null };
    }

    const combinedFilter: Record<string, unknown> =
      Object.keys(clientFilter).length > 0 ? { $and: [scopeFilter, clientFilter] } : scopeFilter;

    // limit+1 паттерн (D-04A/D-06) — на одну запись больше для однозначного nextCursor.
    const rows = await this.auditService.listForAdmin({
      scopeFilter: combinedFilter,
      cursor: params.cursor,
      limit: params.limit + 1,
    });
    const hasMore = rows.length > params.limit;
    const pageRows = hasMore ? rows.slice(0, params.limit) : rows;
    const nextCursor = hasMore ? pageRows[pageRows.length - 1]!._id.toString() : null;

    return { items: pageRows.map(toAdminAuditEventView), nextCursor };
  }

  /**
   * GET /admin/publications/:publicationId/audit — переиспользует list()
   * целиком (тот же service/repository/whitelist, задача явно запрещает
   * дублировать бизнес-логику), только предзаполняет publicationId и не
   * принимает resource/resourceId/actorId — эндпоинт узко про ОДНУ
   * publication, остальные фильтры (action/from/to/cursor/limit) остаются
   * доступны для detail-страницы (например, "показать только unpublish").
   */
  async listForPublication(
    adminContext: AdminContext,
    publicationId: Types.ObjectId,
    params: { action?: string; from?: string; to?: string; cursor?: Types.ObjectId; limit: number },
  ): Promise<{ items: AdminAuditEventView[]; nextCursor: string | null }> {
    return this.list(adminContext, { ...params, publicationId });
  }

  /**
   * super_admin → 'all' (bypass, тот же принцип, что resolvePublicationReadScope)
   * либо явный `{ resource }` при resource-фильтре.
   *
   * Обычный admin:
   *  - явный resource='admin_account' → ADMIN_SCOPE_INSUFFICIENT (403) —
   *    единственное место в этом сервисе, где "нет доступа" раскрывается
   *    ошибкой, а не пустым списком: сам факт СУЩЕСТВОВАНИЯ resource
   *    'admin_account' не секрет (это публично документированный enum в
   *    OpenAPI), в отличие от существования конкретной publication/grant
   *    записи — non-disclosure здесь про записи, не про taxonomy ресурсов.
   *  - resource∈{development,unit,listing} → resolvePublicationReadScope,
   *    затем buildAuditScopeFilter (НЕ buildPublicationScopeFilter —
   *    audit_events не marketplace_publications, разные поля, см. ниже).
   *  - без resource-фильтра → тот же buildAuditScopeFilter, ограниченный
   *    resource∈{development,unit,listing} (deny-by-default: 'admin_account'
   *    никогда не появляется в unfiltered feed обычного admin).
   */
  private async resolveScopeFilter(
    adminContext: AdminContext,
    resourceFilter: string | undefined,
  ): Promise<Record<string, unknown> | null> {
    if (adminContext.isSuperAdmin) {
      return resourceFilter ? { resource: resourceFilter } : {};
    }

    if (resourceFilter && SUPER_ADMIN_ONLY_RESOURCES.has(resourceFilter)) {
      throw new AppException(
        ErrorCode.ADMIN_SCOPE_INSUFFICIENT,
        'Раздел audit-событий admin-аккаунтов доступен только super_admin',
      );
    }

    const readScope = await this.adminPolicy.resolvePublicationReadScope(adminContext);
    const resourceTypes = resourceFilter ? [resourceFilter as PublicationSourceType] : PUBLICATION_RESOURCES;
    return this.buildAuditScopeFilter(readScope, resourceTypes);
  }

  /**
   * AdminPublicationService переиспользует buildPublicationScopeFilter,
   * т.к. фильтрует marketplace_publications — та коллекция физически имеет
   * поля `sourceType`/`searchProjection.city`. audit_events — ДРУГАЯ
   * коллекция: поле называется `resource` (не sourceType), и city там нет
   * вообще (audit event не денормализует город публикации). Поэтому этот
   * метод — намеренно ОТДЕЛЬНАЯ реализация, не обёртка над
   * buildPublicationScopeFilter: для global-грантов матчит по `resource`
   * напрямую; для city-scoped грантов сперва резолвит МНОЖЕСТВО sourceId
   * публикаций, попадающих в scope (MarketplacePublicationRepository —
   * единственный источник знания "какие sourceId соответствуют городу"),
   * затем матчит audit_events по `resourceId: {$in: [...]}`. Найдено этим
   * же проходом (integration-тест) — buildPublicationScopeFilter,
   * применённый напрямую к audit_events, молча возвращал 0 строк для
   * ЛЮБОГО city-scoped admin, т.к. `searchProjection.city` не существует
   * на audit_events документах (Mongo не матчит несуществующее поле, не
   * ошибка, просто пустой результат — тихий баг без этого теста).
   */
  private async buildAuditScopeFilter(
    readScope: Map<PublicationSourceType, PublicationReadScope> | 'all',
    resourceTypes: readonly PublicationSourceType[],
  ): Promise<Record<string, unknown> | null> {
    if (readScope === 'all') {
      return { resource: { $in: resourceTypes } };
    }

    const clauses: Record<string, unknown>[] = [];
    for (const sourceType of resourceTypes) {
      const scope = readScope.get(sourceType);
      if (!scope) continue;

      if (scope.global) {
        clauses.push({ resource: sourceType });
        continue;
      }
      if (scope.cities.length === 0) continue;

      const publicationScopeFilter = { sourceType, 'searchProjection.city': { $in: scope.cities } };
      const rows = await this.publicationRepository.listSourceIdsByScopeFilter(publicationScopeFilter);
      if (rows.length === 0) continue;
      clauses.push({ resource: sourceType, resourceId: { $in: rows.map((row) => row.sourceId) } });
    }

    if (clauses.length === 0) return null;
    if (clauses.length === 1) return clauses[0]!;
    return { $or: clauses };
  }

  /**
   * 'empty' — явный сигнал "запрошенный publicationId вне текущего
   * набора" (permission checked already inside resolveScopeFilter/scope
   * AND) — вызывающий код должен вернуть пустой список без похода в audit
   * коллекцию, publicationId сам по себе не Mongo-фильтр audit_events
   * (audit_events.resourceId — sourceId публикации, не id самой publication
   * записи маркетплейса).
   */
  private async buildClientFilter(
    params: ListAuditEventsParams,
  ): Promise<Record<string, unknown> | 'empty'> {
    const filter: Record<string, unknown> = {};

    if (params.publicationId) {
      const publication = await this.publicationRepository.findById(params.publicationId);
      if (!publication) {
        throw new NotFoundException('Publication not found');
      }
      filter.resource = publication.sourceType;
      filter.resourceId = publication.sourceId;
    }

    if (params.resourceId) {
      if (filter.resourceId && !(filter.resourceId as Types.ObjectId).equals(params.resourceId)) {
        return 'empty';
      }
      filter.resourceId = params.resourceId;
    }

    if (params.action) {
      filter.action = params.action;
    }

    if (params.actorId) {
      filter['actor.id'] = params.actorId;
    }

    if (params.from || params.to) {
      const createdAt: Record<string, Date> = {};
      if (params.from) createdAt.$gte = new Date(params.from);
      if (params.to) createdAt.$lte = new Date(params.to);
      filter.createdAt = createdAt;
    }

    return filter;
  }
}
