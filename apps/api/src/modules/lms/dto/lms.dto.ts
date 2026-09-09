import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  LMS_CONTENT_TYPES,
  LMS_TARGET_ROLES,
  type LmsContentType,
  type LmsTargetRole,
} from '../schemas/lms-item.schema';

export class ListLmsItemsQueryDto {
  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsEnum(LMS_CONTENT_TYPES)
  type?: LmsContentType;
}

export class ListLmsCoursesQueryDto {
  @IsOptional()
  @IsString()
  role?: string;
}

export class CreateLmsItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  itemId?: string;

  @IsNotEmpty()
  @IsEnum(LMS_CONTENT_TYPES)
  type!: LmsContentType;

  @IsNotEmpty()
  @IsString()
  @MaxLength(300)
  title!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsEnum(LMS_TARGET_ROLES)
  targetRole?: LmsTargetRole;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  readTime?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsNotEmpty()
  @IsObject()
  content!: Record<string, unknown>;
}

export class UpdateLmsItemDto {
  @IsOptional()
  @IsEnum(LMS_CONTENT_TYPES)
  type?: LmsContentType;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(LMS_TARGET_ROLES)
  targetRole?: LmsTargetRole;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  readTime?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;
}

export class FinalQuizQuestionDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  question!: string;

  @IsArray()
  @IsString({ each: true })
  options!: string[];

  @IsInt()
  @Min(0)
  correct!: number;
}

export class CourseFinalQuizDto {
  @IsInt()
  @Min(0)
  @Max(100)
  passingScore!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinalQuizQuestionDto)
  questions!: FinalQuizQuestionDto[];
}

export class CreateLmsCourseDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  courseId?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(300)
  title!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetRoles?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(10)
  emoji?: string;

  @IsArray()
  @IsString({ each: true })
  itemIds!: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CourseFinalQuizDto)
  finalQuiz?: CourseFinalQuizDto;
}

export class UpdateLmsCourseDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetRoles?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(10)
  emoji?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  itemIds?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CourseFinalQuizDto)
  finalQuiz?: CourseFinalQuizDto;
}

export class UpsertProgressDto {
  @IsArray()
  @IsString({ each: true })
  completedItems!: string[];

  @IsOptional()
  @IsBoolean()
  finalQuizPassed?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  finalQuizScore?: number;
}
