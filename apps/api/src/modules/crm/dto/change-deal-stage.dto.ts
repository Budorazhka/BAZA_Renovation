import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { DEAL_STAGES, type DealStage } from '../deal-stage';

export class ChangeDealStageDto {
  @IsIn(DEAL_STAGES)
  stage!: DealStage;

  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
