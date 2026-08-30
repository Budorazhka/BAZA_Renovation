import { Type } from 'class-transformer';
import { IsIn, IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';
import { LEAD_STAGES } from '../lead-stage';
import type { LeadStage } from '../schemas/lead.schema';

export const DEFAULT_LEAD_LIST_LIMIT = 20;
export const MAX_LEAD_LIST_LIMIT = 100;

export class ListLeadsDto {
  @IsOptional()
  @IsIn(LEAD_STAGES)
  stage?: LeadStage;

  @IsOptional()
  @IsMongoId()
  ownerPositionId?: string;

  @IsOptional()
  @IsMongoId()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LEAD_LIST_LIMIT)
  limit: number = DEFAULT_LEAD_LIST_LIMIT;
}
