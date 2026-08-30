import { IsInt, Min } from 'class-validator';

/** conventions.md разд.5 — тот же паттерн, что ChangeLeadStageDto. */
export class CompleteTaskDto {
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}
