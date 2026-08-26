import { IsString, IsIn, IsInt, IsOptional, IsNumber, IsPositive, IsMongoId, Length, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MoneyAmountDto } from './money-amount.dto';

const UNIT_KINDS = ['apartment', 'commercial', 'office', 'parking', 'storage', 'other'] as const;

export class CreateUnitDto {
  @IsString()
  @Length(1, 50)
  number!: string;

  @IsIn(UNIT_KINDS)
  kind!: (typeof UNIT_KINDS)[number];

  @IsOptional()
  @IsInt()
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
  floorPlanId?: string;
}
