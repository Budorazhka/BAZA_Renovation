import {
  IsArray,
  IsInt,
  IsOptional,
  IsNumber,
  IsPositive,
  IsString,
  IsMongoId,
  IsIn,
  Length,
  Min,
  Max,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MoneyAmountDto } from './money-amount.dto';

const UNIT_KINDS = ['apartment', 'commercial', 'office', 'parking', 'storage', 'other'] as const;

export class BatchUnitItemDto {
  @IsInt()
  @Min(1)
  @Max(200)
  floorNumber!: number;

  @IsString()
  @Length(1, 50)
  number!: string;

  @IsIn(UNIT_KINDS)
  kind!: (typeof UNIT_KINDS)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  rooms?: number;

  @IsNumber()
  @IsPositive()
  area!: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  areaLiving?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  areaBalcony?: number;

  @ValidateNested()
  @Type(() => MoneyAmountDto)
  price!: MoneyAmountDto;

  @IsOptional()
  @IsMongoId()
  sectionId?: string;

  @IsOptional()
  @IsMongoId()
  floorPlanId?: string;
}

export class BatchCreateUnitsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => BatchUnitItemDto)
  units!: BatchUnitItemDto[];
}
