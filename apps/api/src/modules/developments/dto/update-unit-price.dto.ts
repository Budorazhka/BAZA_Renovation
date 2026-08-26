import { IsInt, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MoneyAmountDto } from './money-amount.dto';

export class UpdateUnitPriceDto {
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @ValidateNested()
  @Type(() => MoneyAmountDto)
  price!: MoneyAmountDto;
}
