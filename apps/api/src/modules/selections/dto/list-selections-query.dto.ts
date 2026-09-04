import { IsIn, IsOptional } from 'class-validator';
import type { DevSelectionStatus } from '../schemas/dev-selection.schema';

const STATUSES = ['draft', 'sent', 'viewed', 'archived'] as const;

export class ListSelectionsQueryDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: DevSelectionStatus;
}
