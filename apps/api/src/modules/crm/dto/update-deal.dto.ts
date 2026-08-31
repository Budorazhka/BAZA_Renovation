import { Type } from 'class-transformer';
import { IsInt, IsMongoId, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { MoneyAmountDto } from './money-amount.dto';

export class UpdateDealDto {
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsMongoId()
  ownerPositionId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  expectedCommission?: MoneyAmountDto;
}
