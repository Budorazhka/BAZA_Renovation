import {
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  InstallmentApplyTo,
  InstallmentDownPaymentType,
  InstallmentPaymentFrequency,
  InstallmentTermType,
} from '../schemas/installment-plan.schema';

const APPLY_TO = ['project', 'unit'] as const;
const DOWN_PAYMENT_TYPES = ['percent', 'amount'] as const;
const TERM_TYPES = ['months_from_current_date', 'fixed_end_date'] as const;
const PAYMENT_FREQUENCIES = ['monthly', 'quarterly'] as const;

export class UpdateInstallmentPlanDto {
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  title?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn(APPLY_TO)
  applyTo?: InstallmentApplyTo;

  @IsOptional()
  @IsMongoId()
  unitId?: string;

  @IsOptional()
  @IsIn(DOWN_PAYMENT_TYPES)
  downPaymentType?: InstallmentDownPaymentType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  downPaymentValue?: number;

  @IsOptional()
  @IsIn(TERM_TYPES)
  termType?: InstallmentTermType;

  @IsOptional()
  @IsInt()
  @Min(1)
  termMonths?: number;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsIn(PAYMENT_FREQUENCIES)
  paymentFrequency?: InstallmentPaymentFrequency;

  @IsOptional()
  @IsBoolean()
  useDiscount?: boolean;

  @IsOptional()
  @IsBoolean()
  discountFromDownPayment?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
