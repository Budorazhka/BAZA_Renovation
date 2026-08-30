import { IsInt, IsMongoId, IsOptional, Min } from 'class-validator';

export class ReassignTaskDto {
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  /** Отсутствие поля/null — снять назначение (задача становится unassigned). */
  @IsOptional()
  @IsMongoId()
  assignedPositionId?: string | null;
}
