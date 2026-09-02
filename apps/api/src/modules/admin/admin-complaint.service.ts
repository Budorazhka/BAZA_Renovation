import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import type { ComplaintCategory, ComplaintDocument, ComplaintStatus } from '@baza/property-assets';
import { MarketplacePublicationRepository } from '@baza/publication';
import type { AdminContext } from '../../shared/admin/admin-context';
import { ComplaintService } from '../property-assets/complaint.service';
import { AdminPolicyService } from './admin-policy.service';
import { AdminPublicationService } from './admin-publication.service';
import { PolicyEvaluatorService } from '../authorization/policy-evaluator.service';

export interface AdminComplaintListItem {
  id: string;
  status: ComplaintStatus;
  category: ComplaintCategory;
  details: string | null;
  propertyAssetId: string;
  listingId: string;
  scopeCity: string;
  respondentScope: { type: string; organizationId: string | null };
  createdAt: string;
  resolvedAt: string | null;
  resolutionReason: string | null;
}

/**
 * ADMIN-OPS-001 (permission-matrix.md разд.2.2 «Модератор вторички Батуми»:
 * `complaint.resolve.city(batumi)`; раздел 9 backlog: "Решение имеет reason,
 * scope и audit"). Тот же паттерн, что AdminDuplicateCandidateService:
 * AdminGuard на контроллере — только аутентификация Admin-актора,
 * permission-проверка (resource:'complaint', action:'resolve', scope:'city')
 * выполняется explicit-вызовом здесь.
 *
 * При `decision:'upheld'` резолюция переиспользует УЖЕ существующий D-06
 * admin unpublish-путь (AdminPublicationService.unpublish → PublicationService.
 * unpublish) — не пишет новую логику unpublish. Если у публикации сейчас нет
 * status:'published' (никогда не публиковалась / уже unpublished), unpublish
 * не вызывается вообще — жалоба всё равно резолюцируется upheld, повторное
 * снятие с публикации уже снятого listing не является ошибкой этого сценария.
 */
@Injectable()
export class AdminComplaintService {
  constructor(
    private readonly complaintService: ComplaintService,
    private readonly publicationRepository: MarketplacePublicationRepository,
    private readonly adminPublicationService: AdminPublicationService,
    private readonly adminPolicy: AdminPolicyService,
    private readonly policyEvaluator: PolicyEvaluatorService,
  ) {}

  async list(
    adminContext: AdminContext,
    params: { status?: ComplaintStatus; cursor?: string; limit: number },
  ): Promise<{ items: AdminComplaintListItem[]; nextCursor: string | null }> {
    const cities = await this.resolveResolvableCities(adminContext);
    if (cities !== 'all' && cities.length === 0) {
      // Deny-by-default: ни одного city-гранта на complaint.resolve — пустая
      // очередь, не 403 (тот же принцип, что AdminPublicationService.list).
      return { items: [], nextCursor: null };
    }

    const statuses: ComplaintStatus[] = params.status ? [params.status] : ['pending'];
    // limit+1 паттерн (AdminDuplicateCandidateService/D-04A).
    const complaints = await this.complaintService.listForAdminReview({
      cities,
      statuses,
      cursor: params.cursor ? new Types.ObjectId(params.cursor) : undefined,
      limit: params.limit + 1,
    });
    const hasMore = complaints.length > params.limit;
    const pageItems = hasMore ? complaints.slice(0, params.limit) : complaints;
    const nextCursor = hasMore ? pageItems[pageItems.length - 1]!._id.toString() : null;

    return { items: pageItems.map(toAdminComplaintListItem), nextCursor };
  }

  async resolve(
    adminContext: AdminContext,
    params: { complaintId: Types.ObjectId; decision: 'upheld' | 'dismissed'; reason: string; correlationId: string },
  ): Promise<void> {
    this.adminPolicy.requireReason(params.reason);

    const complaint = await this.complaintService.findById(params.complaintId);
    if (!complaint) {
      throw new NotFoundException('Complaint not found');
    }
    if (complaint.status !== 'pending') {
      throw new ConflictException(`Complaint status is '${complaint.status}', only 'pending' can be resolved`);
    }

    await this.adminPolicy.requireGrant({
      adminContext,
      resource: 'complaint',
      action: 'resolve',
      scopeValue: complaint.scopeCity,
    });

    if (params.decision === 'upheld') {
      const publication = await this.publicationRepository.findBySource('listing', complaint.listingId);
      if (publication && publication.status === 'published') {
        await this.adminPublicationService.unpublish(adminContext, {
          publicationId: publication._id,
          reason: params.reason,
          correlationId: params.correlationId,
        });
      }
    }

    await this.complaintService.resolve({
      complaintId: params.complaintId,
      decision: params.decision,
      reason: params.reason,
      resolvedByAdminId: new Types.ObjectId(adminContext.adminAccountId),
      correlationId: params.correlationId,
    });
  }

  /**
   * super_admin — bypass (тот же принцип, что AdminPolicyService.
   * resolvePublicationReadScope). Обычный admin — агрегирует ВСЕ его
   * city-грантами на `complaint.resolve` (не `listing.moderate` — намеренно
   * разные grants, «Модератор вторички Батуми» держит оба одновременно, но
   * список ЖАЛОБ фильтруется правом именно РЕЗОЛЮЦИИ жалоб, не модерации
   * листингов).
   */
  private async resolveResolvableCities(adminContext: AdminContext): Promise<string[] | 'all'> {
    if (adminContext.isSuperAdmin) {
      return 'all';
    }
    const scope = await this.policyEvaluator.resolveListScope({
      subjectType: 'admin_account',
      subjectId: new Types.ObjectId(adminContext.adminAccountId),
      resource: 'complaint',
      action: 'resolve',
    });
    if (scope.global) {
      return 'all';
    }
    return scope.scopeValues;
  }
}

function toAdminComplaintListItem(complaint: ComplaintDocument): AdminComplaintListItem {
  return {
    id: complaint._id.toString(),
    status: complaint.status,
    category: complaint.category,
    details: complaint.details ?? null,
    propertyAssetId: complaint.propertyAssetId.toString(),
    listingId: complaint.listingId.toString(),
    scopeCity: complaint.scopeCity,
    respondentScope: {
      type: complaint.respondentScope.type,
      organizationId:
        complaint.respondentScope.type === 'organization' ? complaint.respondentScope.organizationId.toString() : null,
    },
    createdAt: complaint.createdAt.toISOString(),
    resolvedAt: complaint.resolvedAt ? complaint.resolvedAt.toISOString() : null,
    resolutionReason: complaint.resolutionReason ?? null,
  };
}
