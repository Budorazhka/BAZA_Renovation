import { IsIn } from 'class-validator';
import { LEAD_STAGES } from '../lead-stage';
import type { LeadStage } from '../schemas/lead.schema';

export class ChangeLeadStageDto {
  @IsIn(LEAD_STAGES)
  stage!: LeadStage;
}
