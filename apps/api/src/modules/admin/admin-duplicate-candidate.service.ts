import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import type { DuplicateCandidateStatus, PropertyAssetDocument } from '@baza/property-assets';
import type { AdminContext } from '../../shared/admin/admin-context';
import { DedupeService } from '../property-assets/dedupe.service';
import { AdminPolicyService } from './admin-policy.service';

export interface AdminDuplicateCandidateAssetSummary {
  id: string;
  propertyType: string;
  location: { city: string; address: string };
  characteristics: { area: number; rooms: number | null; floor: number | null };
  representativePhone: string;
  publisherScope: { type: string; organizationId: string | null };
}

export interface AdminDuplicateCandidateListItem {
  id: string;
  status: DuplicateCandidateStatus;
  signals: { phoneMatch: boolean; addressMatch: boolean; roomsAreaFloorMatch: boolean };
  detectedAt: string;
  overrideReason: string | null;
  overrideAt: string | null;
  confirmReason: string | null;
  confirmedAt: string | null;
  assetA: AdminDuplicateCandidateAssetSummary | null;
  assetB: AdminDuplicateCandidateAssetSummary | null;
}

const REVIEW_STATUSES: DuplicateCandidateStatus[] = ['detected', 'override_not_duplicate'];

/**
 * Admin review queue поверх DEDUPE-001 (master plan разд.2.3: "Автор может
 * заявить, что это не дубль; такое исключение логируется и попадает в
 * административную проверку") — до этого прохода `DuplicateCandidateRepository.
 * listForReview`/`markConfirmedDuplicate` существовали в @baza/property-assets,
 * но не были подключены НИ К ОДНОМУ HTTP-пути ни на owner-, ни на admin-
 * стороне: честный gap, найденный чтением кода, не документа.
 *
 * Тот же паттерн, что AdminPublicationService: AdminGuard на контроллере —
 * только аутентификация Admin-актора, permission-проверка (resource=
 * 'duplicate_candidate', global scope — пара может involve organizations
 * из разных городов, city-scoping здесь структурно не подходит, в отличие
 * от publication) выполняется explicit-вызовом здесь, в service-слое.
 */
@Injectable()
export class AdminDuplicateCandidateService {
  constructor(
    private readonly dedupeService: DedupeService,
    private readonly adminPolicy: AdminPolicyService,
  ) {}

  async list(
    adminContext: AdminContext,
    params: { status?: DuplicateCandidateStatus; cursor?: string; limit: number },
  ): Promise<{ items: AdminDuplicateCandidateListItem[]; nextCursor: string | null }> {
    await this.adminPolicy.requireGrant({ adminContext, resource: 'duplicate_candidate', action: 'read' });

    const statuses = params.status ? [params.status] : REVIEW_STATUSES;
    // limit+1 паттерн (D-04A/AdminPublicationService.list) — запрашиваем на
    // одну запись больше, чтобы определить nextCursor без двусмысленности
    // items.length===limit.
    const reviewItems = await this.dedupeService.listForAdminReview({
      statuses,
      cursor: params.cursor ? new Types.ObjectId(params.cursor) : undefined,
      limit: params.limit + 1,
    });
    const hasMore = reviewItems.length > params.limit;
    const pageItems = hasMore ? reviewItems.slice(0, params.limit) : reviewItems;
    const nextCursor = hasMore ? pageItems[pageItems.length - 1]!.candidate._id.toString() : null;

    return {
      items: pageItems.map((item) => ({
        id: item.candidate._id.toString(),
        status: item.candidate.status,
        signals: item.candidate.signals,
        detectedAt: item.candidate.detectedAt.toISOString(),
        overrideReason: item.candidate.overrideReason ?? null,
        overrideAt: item.candidate.overrideAt?.toISOString() ?? null,
        confirmReason: item.candidate.confirmReason ?? null,
        confirmedAt: item.candidate.confirmedAt?.toISOString() ?? null,
        assetA: toAssetSummary(item.assetA),
        assetB: toAssetSummary(item.assetB),
      })),
      nextCursor,
    };
  }

  async confirm(
    adminContext: AdminContext,
    params: { duplicateCandidateId: Types.ObjectId; reason: string; correlationId: string },
  ): Promise<void> {
    this.adminPolicy.requireReason(params.reason);
    await this.adminPolicy.requireGrant({ adminContext, resource: 'duplicate_candidate', action: 'confirm' });

    await this.dedupeService.confirmDuplicate({
      duplicateCandidateId: params.duplicateCandidateId,
      confirmByAdminAccountId: new Types.ObjectId(adminContext.adminAccountId),
      reason: params.reason,
      correlationId: params.correlationId,
    });
  }
}

function toAssetSummary(asset: PropertyAssetDocument | null): AdminDuplicateCandidateAssetSummary | null {
  if (!asset) return null;
  return {
    id: asset._id.toString(),
    propertyType: asset.propertyType,
    location: { city: asset.location.city, address: asset.location.address },
    characteristics: {
      area: asset.characteristics.area,
      rooms: asset.characteristics.rooms ?? null,
      floor: asset.characteristics.floor ?? null,
    },
    representativePhone: asset.representativePhone,
    publisherScope: {
      type: asset.publisherScope.type,
      organizationId:
        asset.publisherScope.type === 'organization' ? asset.publisherScope.organizationId.toString() : null,
    },
  };
}
