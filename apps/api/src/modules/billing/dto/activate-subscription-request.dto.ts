import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class ActivateSubscriptionRequestDto {
  @IsString()
  planCode!: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  periodDays?: number = 30;

  @IsInt()
  @Min(0)
  @IsOptional()
  amountMinorUnits?: number = 0;

  @IsString()
  @IsOptional()
  currency?: string = 'USD';

  @IsString()
  @MinLength(10)
  reason!: string;
}
