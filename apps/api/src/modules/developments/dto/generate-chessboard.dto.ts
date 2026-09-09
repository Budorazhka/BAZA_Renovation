import {
  IsInt,
  IsOptional,
  IsNumber,
  IsPositive,
  IsMongoId,
  IsIn,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MoneyAmountDto } from './money-amount.dto';

const UNIT_KINDS = ['apartment', 'commercial', 'office', 'parking', 'storage', 'other'] as const;
const NUMBERING_SCHEMES = ['floor_prefix', 'sequential'] as const;

export class GenerateChessboardDto {
  @IsOptional()
  @IsMongoId()
  sectionId?: string;

  @IsInt()
  @Min(1)
  @Max(200)
  fromFloor!: number;

  @IsInt()
  @Min(1)
  @Max(200)
  toFloor!: number;

  @IsInt()
  @Min(1)
  @Max(50)
  unitsPerFloor!: number;

  @IsOptional()
  @IsIn(NUMBERING_SCHEMES)
  numberingScheme?: 'floor_prefix' | 'sequential';

  @IsOptional()
  @IsIn(UNIT_KINDS)
  defaultKind?: (typeof UNIT_KINDS)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  rooms?: number;

  @IsNumber()
  @IsPositive()
  defaultArea!: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  defaultAreaLiving?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  defaultAreaBalcony?: number;

  @ValidateNested()
  @Type(() => MoneyAmountDto)
  defaultPrice!: MoneyAmountDto;

  @IsOptional()
  @IsMongoId()
  floorPlanId?: string;
}
