import { IsDateString, IsOptional, IsString } from 'class-validator';

/**
 * GET /crm/reports/team-performance
 * Поддерживает опциональные фильтры по периоду (from, to) и конкретной должности (positionId).
 */
export class TeamPerformanceReportDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  positionId?: string;
}
