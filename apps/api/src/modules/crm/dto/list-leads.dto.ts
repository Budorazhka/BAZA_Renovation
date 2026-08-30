import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';
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
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  stalled?: boolean;

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
