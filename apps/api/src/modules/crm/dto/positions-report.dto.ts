import { IsDateString, IsOptional } from 'class-validator';

/** GET /crm/reports/positions?from=&to= — оба параметра опциональны. */
export class PositionsReportDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
