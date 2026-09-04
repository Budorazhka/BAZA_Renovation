import { IsIn, IsInt, IsOptional, IsString, Min, MaxLength, ValidateIf } from 'class-validator';
import type { DevSelectionReaction } from '../schemas/dev-selection.schema';

const REACTIONS = ['liked', 'disliked', 'question'] as const;

export class UpdateSelectionItemDto {
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  agentNote?: string;

  /** `null` — явная очистка реакции (не то же самое, что отсутствие поля). */
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsIn(REACTIONS)
  reaction?: DevSelectionReaction | null;
}
