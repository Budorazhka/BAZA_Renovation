import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { LEAD_STAGES } from '../lead-stage';
import type { LeadStage } from '../schemas/lead.schema';

export class ListLeadsDto {
  @IsOptional()
  @IsIn(LEAD_STAGES)
  stage?: LeadStage;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
