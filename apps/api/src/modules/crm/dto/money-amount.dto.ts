import { IsIn, IsInt, Min } from 'class-validator';
import { CURRENCIES, type Currency } from '@baza/contracts';

export class MoneyAmountDto {
  @IsInt()
  @Min(0)
  amountMinorUnits!: number;

  @IsIn(CURRENCIES)
  currency!: Currency;
}
