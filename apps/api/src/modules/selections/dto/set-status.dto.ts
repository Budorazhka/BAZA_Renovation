import { IsIn, IsInt, Min } from 'class-validator';
import type { DevSelectionStatus } from '../schemas/dev-selection.schema';

const STATUSES = ['draft', 'sent', 'viewed', 'archived'] as const;

export class SetSelectionStatusDto {
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsIn(STATUSES)
  status!: DevSelectionStatus;
}
