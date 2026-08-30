import { IsDateString, IsIn, IsInt, IsOptional, IsString, Min, MaxLength, MinLength } from 'class-validator';
import type { TaskStatus } from '../schemas/task.schema';

/**
 * НЕ содержит assignedPositionId — смена исполнителя ТОЛЬКО через
 * PATCH /tasks/:taskId/reassign (task.reassign — отдельный action от
 * task.edit, см. CrmService.updateTask/reassignTask докстринги).
 */
export class UpdateTaskDto {
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsIn(['open', 'cancelled'])
  status?: TaskStatus;
}
