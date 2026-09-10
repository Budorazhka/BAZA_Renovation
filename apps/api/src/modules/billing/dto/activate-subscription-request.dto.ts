import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

// ИСПРАВЛЕНО 10.09.2026: periodDays без верхней границы давал Invalid Date
// (и падение с 500) на огромных значениях; currency принимала любую строку
// вместо реальных валют платформы (packages/contracts/src/money.ts).
const CURRENCIES = ['USD', 'GEL', 'RUB'] as const;

export class ActivateSubscriptionRequestDto {
  @IsString()
  planCode!: string;

  @IsInt()
  @Min(1)
  @Max(3650)
  @IsOptional()
  periodDays?: number = 30;

  @IsInt()
  @Min(0)
  @IsOptional()
  amountMinorUnits?: number = 0;

  @IsIn(CURRENCIES)
  @IsOptional()
  currency?: (typeof CURRENCIES)[number] = 'USD';

  @IsString()
  @MinLength(10)
  reason!: string;
}
