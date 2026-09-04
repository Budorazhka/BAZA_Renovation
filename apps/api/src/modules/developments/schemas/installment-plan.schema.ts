import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type InstallmentApplyTo = 'project' | 'unit';
export type InstallmentDownPaymentType = 'percent' | 'amount';
export type InstallmentTermType = 'months_from_current_date' | 'fixed_end_date';
export type InstallmentPaymentFrequency = 'monthly' | 'quarterly';

/**
 * Планы рассрочки (Installment Plans) застройщика на проект (ЖК) или конкретный юнит.
 */
@Schema({ collection: 'installment_plans', timestamps: true })
export class InstallmentPlanDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, index: true })
  developmentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: false, index: true })
  unitId?: Types.ObjectId;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true, default: true })
  isActive!: boolean;

  @Prop({ required: true, enum: ['project', 'unit'], default: 'project' })
  applyTo!: InstallmentApplyTo;

  @Prop({ required: true, enum: ['percent', 'amount'] })
  downPaymentType!: InstallmentDownPaymentType;

  @Prop({ required: true })
  downPaymentValue!: number;

  @Prop({ required: true, enum: ['months_from_current_date', 'fixed_end_date'] })
  termType!: InstallmentTermType;

  @Prop({ required: false })
  termMonths?: number;

  @Prop({ required: false })
  endDate?: string;

  @Prop({ required: true, enum: ['monthly', 'quarterly'], default: 'monthly' })
  paymentFrequency!: InstallmentPaymentFrequency;

  @Prop({ required: true, default: false })
  useDiscount!: boolean;

  @Prop({ required: false })
  discountFromDownPayment?: boolean;

  @Prop({ required: false })
  discountPercent?: number;

  @Prop({ required: false })
  description?: string;

  @Prop({ required: true, default: 0 })
  sortOrder!: number;

  /** conventions.md разд.5 — optimistic concurrency (409 VERSION_CONFLICT). */
  @Prop({ required: true, default: 0 })
  version!: number;

  declare createdAt: Date;
  declare updatedAt: Date;
}

export const InstallmentPlanSchema = SchemaFactory.createForClass(InstallmentPlanDocument);

InstallmentPlanSchema.index({ organizationId: 1, developmentId: 1 });
InstallmentPlanSchema.index({ organizationId: 1, unitId: 1 });
