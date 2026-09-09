import {
  IsOptional,
  IsString,
  IsMongoId,
  IsIn,
  Length,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MoneyAmountDto } from '../../developments/dto/money-amount.dto';

const DEAL_TYPES = ['primary', 'secondary', 'rental', 'assignment'] as const;

export class ConvertBookingToDealDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  title?: string;

  @IsOptional()
  @IsMongoId()
  contactId?: string;

  @IsOptional()
  @IsIn(DEAL_TYPES)
  dealType?: (typeof DEAL_TYPES)[number];

  @IsOptional()
  @IsMongoId()
  installmentPlanId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  downPayment?: MoneyAmountDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => MoneyAmountDto)
  expectedCommission?: MoneyAmountDto;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  notes?: string;
}
