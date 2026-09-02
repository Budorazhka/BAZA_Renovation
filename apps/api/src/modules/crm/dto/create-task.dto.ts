import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsHexColor,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TASK_CATEGORIES, type TaskCategory } from '../schemas/task.schema';

/** Подзадача. `id` генерирует клиент — он же переставляет их локально до сохранения. */
export class CreateTaskSubtaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsBoolean()
  done?: boolean;
}

export class CreateTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

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
  @IsMongoId()
  leadId?: string;

  @IsOptional()
  @IsMongoId()
  contactId?: string;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  /** Признаки матрицы Эйзенхауэра. По умолчанию — «важно, не срочно», как в форме. */
  @IsOptional()
  @IsBoolean()
  isUrgent?: boolean;

  @IsOptional()
  @IsBoolean()
  isImportant?: boolean;

  @IsOptional()
  @IsIn(TASK_CATEGORIES)
  taskCategory?: TaskCategory;

  /** `null` — снять метку. Отсутствие поля и null — разные намерения. */
  @IsOptional()
  @IsHexColor()
  colorHex?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  @Min(0, { each: true })
  reminderOffsetsMinutes?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateTaskSubtaskDto)
  subtasks?: CreateTaskSubtaskDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  attachmentFileNames?: string[];

  // entityType/entityId не принимаются: связь выводится из leadId/contactId.
  // isAutomatic/triggerType не принимаются: провенанс ставит только сервер.
}
