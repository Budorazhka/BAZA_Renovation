import {
  IsArray,
  IsInt,
  IsOptional,
  IsNumber,
  IsString,
  IsMongoId,
  IsIn,
  Min,
  Max,
  Length,
} from 'class-validator';

const UNIT_KINDS = ['apartment', 'commercial', 'office', 'parking', 'storage', 'other'] as const;
const PRICE_OPERATION_TYPES = ['percentage', 'delta_per_sqm', 'fixed_price_per_sqm', 'fixed_total'] as const;

export class BatchUpdatePricesDto {
  @IsOptional()
  @IsMongoId()
  buildingId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  floorMin?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  floorMax?: number;

  @IsOptional()
  @IsIn(UNIT_KINDS)
  kind?: (typeof UNIT_KINDS)[number];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  unitIds?: string[];

  @IsIn(PRICE_OPERATION_TYPES)
  operationType!: (typeof PRICE_OPERATION_TYPES)[number];

  @IsNumber()
  value!: number;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;
}
