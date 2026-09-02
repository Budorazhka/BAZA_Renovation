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

  /**
   * `in_progress` добавлен 02.09.2026. Статус появился в модели вместе с
   * расширением задачи под экран ERP, но задать его было нечем: PATCH
   * принимал только `open` и `cancelled`, и «В работе» на экране оставалось
   * состоянием, в которое задача попасть не может.
   *
   * `completed` здесь по-прежнему нет намеренно: завершение — отдельная
   * команда `POST /tasks/:taskId/complete`, она пишет `completedAt`,
   * `completedByPositionId` и событие `TaskCompleted`. Разрешить его тут
   * значило бы завести второй путь завершения, который ничего этого не
   * делает.
   */
  @IsOptional()
  @IsIn(['open', 'in_progress', 'cancelled'])
  status?: TaskStatus;
}
