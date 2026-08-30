import { Type } from 'class-transformer';
import { IsIn, IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';
import { DEAL_STAGES, type DealStage } from '../deal-stage';

export const DEFAULT_DEAL_LIST_LIMIT = 20;
export const MAX_DEAL_LIST_LIMIT = 100;

export class ListDealsDto {
  @IsOptional()
  @IsIn(DEAL_STAGES)
  stage?: DealStage;

  @IsOptional()
  @IsMongoId()
  ownerPositionId?: string;

  @IsOptional()
  @IsMongoId()
  leadId?: string;

  @IsOptional()
  @IsMongoId()
  contactId?: string;

  @IsOptional()
  @IsMongoId()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_DEAL_LIST_LIMIT)
  limit: number = DEFAULT_DEAL_LIST_LIMIT;
}
