import { IsDateString, IsIn, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { TaskStatus } from '../schemas/task.schema';

export class UpdateTaskDto {
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
  @IsMongoId()
  assignedPositionId?: string;

  @IsOptional()
  @IsIn(['open', 'cancelled'])
  status?: TaskStatus;
}
