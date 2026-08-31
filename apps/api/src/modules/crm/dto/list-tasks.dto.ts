import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';
import { TASK_STATUSES, type TaskStatus } from '../schemas/task.schema';

export const DEFAULT_TASK_LIST_LIMIT = 20;
export const MAX_TASK_LIST_LIMIT = 100;

export class ListTasksDto {
  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: TaskStatus;

  @IsOptional()
  @IsMongoId()
  assignedPositionId?: string;

  @IsOptional()
  @IsMongoId()
  leadId?: string;

  @IsOptional()
  @IsMongoId()
  contactId?: string;

  @IsOptional()
  @IsDateString()
  dueBefore?: string;

  @IsOptional()
  @IsDateString()
  dueAfter?: string;

  @IsOptional()
  @IsMongoId()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_TASK_LIST_LIMIT)
  limit: number = DEFAULT_TASK_LIST_LIMIT;
}
