import { IsIn, IsInt, Min } from 'class-validator';
import { CURRENCIES } from '@baza/contracts';

/**
 * conventions.md разд.1: никогда JS float для сумм — amountMinorUnits
 * целое (копейки/тетри/центы), не decimal.
 */
export class MoneyAmountDto {
  @IsInt()
  @Min(0)
  amountMinorUnits!: number;

  @IsIn(CURRENCIES)
  currency!: 'USD' | 'GEL' | 'RUB';
}
