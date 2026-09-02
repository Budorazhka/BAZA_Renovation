import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import {
  PropertyAssetRepository,
  ListingRepository,
  ComplaintRepository,
  type ComplaintCategory,
  type ComplaintDocument,
  type ComplaintStatus,
} from '@baza/property-assets';
import { runInTransaction } from '../../shared/transactions/run-in-transaction';
import { AuditService } from '../audit/audit.service';

/**
 * ADMIN-OPS-001 (master plan разд.6.3 "Dedupe & Moderation", раздел 9
 * backlog: "Решение имеет reason, scope и audit"). Отдельный сервис, не
 * метод PropertyAssetsService — тот же принцип разделения, что DedupeService
 * (публичная подача жалобы и admin-резолюция не tenant-scoped операции над
 * СВОИМ listing, а операции над независимой moderation-очередью).
 *
 * Domain invariant (master plan разд.6.3 "Не должен делать": "Считать
 * жалобу доказанным нарушением"): submit() только создаёт запись со
 * status:'pending' — НИГДЕ в этом сервисе жалоба сама по себе не меняет
 * состояние Listing/PropertyAsset. Только AdminComplaintService.resolve()
 * (admin-модуль, после permission-проверки и обязательного reason) может
 * перевести жалобу в resolved_upheld/resolved_dismissed и, при upheld,
 * инициировать unpublish через уже существующий admin unpublish-путь.
 */
@Injectable()
export class ComplaintService {
  constructor(
    private readonly complaintRepository: ComplaintRepository,
    private readonly listingRepository: ListingRepository,
    private readonly propertyAssetRepository: PropertyAssetRepository,
    private readonly auditService: AuditService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  /**
   * Публичный, БЕЗ TenantContext — жалобщик может быть анонимным посетителем
   * (см. schemas/complaint.schema.ts докстринг). listingId резолвится
   * вызывающим контроллером (по публичному slug через
   * MarketplacePublicationRepository), сюда приходит уже как ObjectId.
   * `findById` без tenant-фильтра (worker-side принцип, тот же, что
   * PropertyAssetRepository.findById/ListingRepository.findById) — жалоба
   * подаётся на ЧУЖОЙ (не текущего вызывающего) listing по построению.
   */
  async submit(params: {
    listingId: Types.ObjectId;
    category: ComplaintCategory;
    details?: string;
    reporterName?: string;
    reporterPhone?: string;
    reporterEmail?: string;
  }): Promise<{ id: Types.ObjectId }> {
    const listing = await this.listingRepository.findById(params.listingId);
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }
    const asset = await this.propertyAssetRepository.findById(listing.propertyAssetId);
    if (!asset) {
      throw new NotFoundException('Property asset not found');
    }

    const created = await this.complaintRepository.create({
      propertyAssetId: asset._id,
      listingId: listing._id,
      respondentScope: asset.publisherScope,
      scopeCity: asset.location.city,
      category: params.category,
      details: params.details,
      reporterName: params.reporterName,
      reporterPhone: params.reporterPhone,
      reporterEmail: params.reporterEmail,
    });

    return { id: created._id };
  }

  async findById(id: Types.ObjectId): Promise<ComplaintDocument | null> {
    return this.complaintRepository.findById(id);
  }

  /**
   * Admin-очередь (AdminComplaintService — единственный вызывающий код,
   * тот же module-boundary принцип, что DedupeService.listForAdminReview:
   * AdminModule не импортирует ComplaintRepository напрямую).
   */
  async listForAdminReview(params: {
    cities: string[] | 'all';
    statuses?: ComplaintStatus[];
    cursor?: Types.ObjectId;
    limit: number;
  }): Promise<ComplaintDocument[]> {
    return this.complaintRepository.listForReview({
      cities: params.cities,
      statuses: params.statuses ?? ['pending'],
      cursor: params.cursor,
      limit: params.limit,
    });
  }

  /**
   * CAS на status:'pending' + audit в ТОЙ ЖЕ транзакции — тот же паттерн,
   * что DedupeService.confirmDuplicate. Permission-проверка (`complaint.
   * resolve.city(X)`) и обязательный reason (@MinLength(10)) — ответственность
   * AdminComplaintService (этот сервис не HTTP-специфичен и не знает про
   * AdminContext/AdminPolicyService, тот же принцип, что DedupeService).
   */
  async resolve(params: {
    complaintId: Types.ObjectId;
    decision: 'upheld' | 'dismissed';
    reason: string;
    resolvedByAdminId: Types.ObjectId;
    correlationId: string;
  }): Promise<void> {
    await runInTransaction(this.connection, async (session) => {
      const complaint = await this.complaintRepository.findById(params.complaintId);
      if (!complaint) {
        throw new NotFoundException('Complaint not found');
      }

      const status: ComplaintStatus = params.decision === 'upheld' ? 'resolved_upheld' : 'resolved_dismissed';
      const { modifiedCount } = await this.complaintRepository.resolve(
        params.complaintId,
        { status, resolvedByAdminId: params.resolvedByAdminId, resolutionReason: params.reason },
        session,
      );
      if (modifiedCount === 0) {
        throw new ConflictException(`Complaint status is '${complaint.status}', only 'pending' can be resolved`);
      }

      await this.auditService.append(
        {
          actor: { type: 'admin_account', id: params.resolvedByAdminId },
          action: 'complaint.resolve',
          resource: 'complaint',
          resourceId: params.complaintId,
          reason: params.reason,
          after: { status, decision: params.decision },
          correlationId: params.correlationId,
        },
        session,
      );
    });
  }
}
