import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import type { OwnerScope } from '@baza/tenant-scope';
import { ComplaintDocument, type ComplaintCategory, type ComplaintStatus } from '../schemas/complaint.schema';

export interface CreateComplaintInput {
  propertyAssetId: Types.ObjectId;
  listingId: Types.ObjectId;
  respondentScope: OwnerScope;
  scopeCity: string;
  category: ComplaintCategory;
  details?: string;
  reporterName?: string;
  reporterPhone?: string;
  reporterEmail?: string;
}

/**
 * Единственная точка доступа к коллекции complaints (ADR-002 требование 2).
 * AdminModule не импортирует этот repository напрямую (тот же принцип, что
 * DuplicateCandidateRepository — test/architecture/module-boundaries.test.ts
 * и докстринг DedupeService.listForAdminReview) — только через ComplaintService.
 */
@Injectable()
export class ComplaintRepository {
  constructor(@InjectModel(ComplaintDocument.name) private readonly model: Model<ComplaintDocument>) {}

  async create(params: CreateComplaintInput): Promise<ComplaintDocument> {
    const [doc] = await this.model.create([{ ...params, status: 'pending' }]);
    return doc!;
  }

  async findById(id: Types.ObjectId): Promise<ComplaintDocument | null> {
    return this.model.findOne({ _id: id }).exec();
  }

  /**
   * Admin-очередь — `cities: 'all'` для super_admin/global-грантов
   * (тот же union-контракт, что AdminPolicyService.resolvePublicationReadScope
   * возвращает вызывающему коду), иначе сужение по массиву городов, на
   * которые у admin есть grant `complaint.resolve.city(X)`.
   */
  async listForReview(params: {
    cities: string[] | 'all';
    statuses: ComplaintStatus[];
    cursor?: Types.ObjectId;
    limit: number;
  }): Promise<ComplaintDocument[]> {
    const filter: Record<string, unknown> = { status: { $in: params.statuses } };
    if (params.cities !== 'all') {
      filter.scopeCity = { $in: params.cities };
    }
    if (params.cursor) {
      filter._id = { $gt: params.cursor };
    }
    return this.model.find(filter).sort({ _id: 1 }).limit(params.limit).exec();
  }

  /** CAS на status:'pending' — только необработанная жалоба может быть резолюцирована. */
  async resolve(
    id: Types.ObjectId,
    params: { status: 'resolved_upheld' | 'resolved_dismissed'; resolvedByAdminId: Types.ObjectId; resolutionReason: string },
    session?: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne(
        { _id: id, status: 'pending' },
        {
          $set: {
            status: params.status,
            resolvedAt: new Date(),
            resolvedByAdminId: params.resolvedByAdminId,
            resolutionReason: params.resolutionReason,
          },
        },
        { session },
      )
      .exec();
    return { modifiedCount: result.modifiedCount };
  }
}
