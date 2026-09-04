import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  InstallmentPlanDocument,
  InstallmentApplyTo,
  InstallmentDownPaymentType,
  InstallmentPaymentFrequency,
  InstallmentTermType,
} from '../schemas/installment-plan.schema';

export interface CreateInstallmentPlanParams {
  organizationId: Types.ObjectId;
  developmentId: Types.ObjectId;
  unitId?: Types.ObjectId;
  title: string;
  isActive?: boolean;
  applyTo?: InstallmentApplyTo;
  downPaymentType: InstallmentDownPaymentType;
  downPaymentValue: number;
  termType: InstallmentTermType;
  termMonths?: number;
  endDate?: string;
  paymentFrequency: InstallmentPaymentFrequency;
  useDiscount?: boolean;
  discountFromDownPayment?: boolean;
  discountPercent?: number;
  description?: string;
  sortOrder?: number;
}

export interface UpdateInstallmentPlanPatch {
  title?: string;
  isActive?: boolean;
  applyTo?: InstallmentApplyTo;
  unitId?: Types.ObjectId;
  downPaymentType?: InstallmentDownPaymentType;
  downPaymentValue?: number;
  termType?: InstallmentTermType;
  termMonths?: number;
  endDate?: string;
  paymentFrequency?: InstallmentPaymentFrequency;
  useDiscount?: boolean;
  discountFromDownPayment?: boolean;
  discountPercent?: number;
  description?: string;
  sortOrder?: number;
}

/**
 * Единственная точка доступа к коллекции installment_plans.
 */
@Injectable()
export class InstallmentPlanRepository {
  constructor(
    @InjectModel(InstallmentPlanDocument.name)
    private readonly model: Model<InstallmentPlanDocument>,
  ) {}

  async create(params: CreateInstallmentPlanParams, session?: ClientSession): Promise<InstallmentPlanDocument> {
    const [doc] = await this.model.create(
      [
        {
          ...params,
          isActive: params.isActive ?? true,
          applyTo: params.applyTo ?? 'project',
          useDiscount: params.useDiscount ?? false,
          sortOrder: params.sortOrder ?? 0,
          version: 0,
        },
      ],
      { session },
    );
    return doc!;
  }

  async findByIdForOrganization(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
  ): Promise<InstallmentPlanDocument | null> {
    return this.model.findOne({ _id: id, organizationId }).exec();
  }

  async listForDevelopment(
    developmentId: Types.ObjectId,
    organizationId: Types.ObjectId,
    filter: { unitId?: Types.ObjectId } = {},
  ): Promise<InstallmentPlanDocument[]> {
    const query: Record<string, unknown> = {
      developmentId,
      organizationId,
    };
    if (filter.unitId) {
      query.unitId = filter.unitId;
    }
    return this.model.find(query).sort({ sortOrder: 1, createdAt: 1 }).exec();
  }

  /**
   * Optimistic concurrency check (version === expectedVersion).
   * Increments version on success. Returns updated document, or null if conflict/not found.
   */
  async updateWithVersionCheck(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
    expectedVersion: number,
    patch: UpdateInstallmentPlanPatch,
    session?: ClientSession,
  ): Promise<InstallmentPlanDocument | null> {
    return this.model
      .findOneAndUpdate(
        { _id: id, organizationId, version: expectedVersion },
        { $set: patch, $inc: { version: 1 } },
        { new: true, session },
      )
      .exec();
  }

  /**
   * Optimistic concurrency check on deletion.
   */
  async deleteWithVersionCheck(
    id: Types.ObjectId,
    organizationId: Types.ObjectId,
    expectedVersion: number,
    session?: ClientSession,
  ): Promise<boolean> {
    const res = await this.model
      .deleteOne({ _id: id, organizationId, version: expectedVersion }, { session })
      .exec();
    return (res.deletedCount ?? 0) > 0;
  }
}
